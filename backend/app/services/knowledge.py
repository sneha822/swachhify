"""In-memory index over the curated knowledge base + deterministic intent/item matching."""

import re
import threading
from dataclasses import dataclass, field
from difflib import SequenceMatcher

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Lesson, WasteCategory, WasteItem

_PUNCT = re.compile(r"[!-/:-@\[-`{-~।॥?“”‘’…]")

CATEGORY_WORDS = {
    "plastic": ["plastic", "plastics", "प्लास्टिक"],
    "paper": ["paper", "cardboard", "कागज", "कागज़", "गत्ता", "raddi"],
    "metal": ["metal", "metals", "धातु", "scrap metal"],
    "glass": ["glass", "काँच", "कांच"],
    "textile": ["textile", "textiles", "fabric", "कपड़ा"],
    "ewaste": ["e-waste", "ewaste", "e waste", "electronic waste", "electronics", "ई-कचरा", "ई कचरा"],
    "other": ["wet waste", "household waste", "hazardous", "गीला कचरा", "sanitary"],
}
CATEGORY_LESSON = {"plastic": "plastic-journey", "paper": "pizza-box", "metal": "aluminium-cans",
                   "glass": "glass-safe", "textile": "old-clothes", "ewaste": "ewaste-why",
                   "other": "what-we-dont-take"}

INTENT_PATTERNS = {
    "segregation": ["segregat", "teach me", "how to separate", "how do i separate", "sort my waste",
                    "alag kaise", "कचरा अलग", "अलग करना", "separate waste", "wet and dry", "gila sukha"],
    "pickup": ["schedule", "pickup", "pick up", "pick-up", "book a pickup", "collect my", "come and collect",
               "पिकअप", "uthane"],
    "rewards": ["my points", "reward", "points", "पॉइंट", "इनाम"],
    "greeting": ["hello", "hi", "hey", "namaste", "namaskar", "नमस्ते", "good morning"],
    "thanks": ["thank", "thanks", "dhanyavad", "shukriya", "धन्यवाद", "शुक्रिया"],
}


def normalize(text: str) -> str:
    return " ".join(_PUNCT.sub(" ", text.lower()).split())


def _stem(tok: str) -> str:
    if len(tok) > 4 and tok.endswith("ies"):
        return tok[:-3] + "y"
    if len(tok) > 3 and tok.endswith("es") and tok[-3] in "sxz":
        return tok[:-2]
    if len(tok) > 3 and tok.endswith("s") and not tok.endswith("ss"):
        return tok[:-1]
    return tok


@dataclass
class Match:
    item: WasteItem
    score: float
    matched: str


@dataclass
class KBIndex:
    items: dict[str, WasteItem] = field(default_factory=dict)
    categories: dict[str, WasteCategory] = field(default_factory=dict)
    lessons: dict[str, Lesson] = field(default_factory=dict)
    _aliases: list[tuple[str, str]] = field(default_factory=list)  # (normalized alias, slug)

    def build(self, db: Session) -> "KBIndex":
        self.categories = {c.slug: c for c in db.scalars(select(WasteCategory).order_by(WasteCategory.sort_order))}
        items = db.scalars(select(WasteItem).options(selectinload(WasteItem.category))
                           .where(WasteItem.is_active.is_(True))).all()
        self.items = {i.slug: i for i in items}
        self.lessons = {l.slug: l for l in db.scalars(select(Lesson).where(Lesson.is_published.is_(True)))}
        aliases = []
        for it in items:
            for a in {*(it.aliases or []), it.name, it.name_hi or ""}:
                na = normalize(a)
                if na:
                    aliases.append((na, it.slug))
        self._aliases = aliases
        # Detach from the session: objects are read-only snapshots used across requests.
        for obj in [*self.items.values(), *self.categories.values(), *self.lessons.values()]:
            if obj in db:
                db.expunge(obj)
        return self

    def search(self, text: str, limit: int = 5) -> list[Match]:
        q = normalize(text)
        if not q:
            return []
        tokens = q.split()
        variants = [f" {q} ", f" {' '.join(_stem(t) for t in tokens)} "]
        best: dict[str, Match] = {}
        for alias, slug in self._aliases:
            words = alias.split()
            score = 0.0
            if any(f" {alias} " in v for v in variants):
                score = 10 + 3 * len(words) + len(alias) / 20
            elif len(words) == 1 and len(alias) >= 5:
                # Typo tolerance for single words ("batery", "thermocal").
                ratio = max((SequenceMatcher(None, alias, t).ratio() for t in tokens if abs(len(t) - len(alias)) <= 2),
                            default=0)
                if ratio >= 0.84:
                    score = 6 + ratio
            if score and (slug not in best or score > best[slug].score):
                best[slug] = Match(self.items[slug], score, alias)
        return sorted(best.values(), key=lambda m: -m.score)[:limit]

    def detect_category(self, text: str) -> str | None:
        q = f" {normalize(text)} "
        for slug, words in CATEGORY_WORDS.items():
            if any(f" {normalize(w)} " in q for w in words):
                return slug
        return None

    def detect_intent(self, text: str) -> str | None:
        q = normalize(text)
        padded = f" {q} "
        for intent, pats in INTENT_PATTERNS.items():
            for p in pats:
                if (len(p) <= 5 and f" {p} " in padded) or (len(p) > 5 and p in q):
                    if intent in ("greeting", "thanks") and len(q.split()) > 5:
                        continue
                    return intent
        return None

    def lesson_for(self, item: WasteItem | None, category: str | None) -> Lesson | None:
        slug = (item.lesson_slug if item else None) or CATEGORY_LESSON.get(category or "")
        return self.lessons.get(slug) if slug else None


_lock = threading.Lock()
_index: KBIndex | None = None


def get_index(db: Session) -> KBIndex:
    global _index
    with _lock:
        if _index is None:
            _index = KBIndex().build(db)
        return _index


def invalidate() -> None:
    global _index
    with _lock:
        _index = None
