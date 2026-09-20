"""Swacchify AI: knowledge-base-grounded waste assistant.

Pipeline: question → intent + item retrieval (knowledge.py) → [Claude phrases a structured answer from
the retrieved records only] → server builds the card, actions and learning link from the KB.
Without Anthropic credentials (or on any API failure) the KB answer is returned directly, so the
assistant always works and never states a rule that isn't in the curated knowledge base.
"""

import json
import logging
from typing import Any

from app.core.config import settings
from app.models import WasteCategory, WasteItem
from app.services.knowledge import KBIndex

log = logging.getLogger("swacchify.ai")

STRONG_MATCH = 12.0

DEFAULT_SUGGESTIONS = {
    "en": ["How do I dispose of batteries?", "Can I put a milk packet with plastic?", "What do I do with thermocol?",
           "Teach me about waste segregation."],
    "hi": ["बैटरी का क्या करें?", "क्या दूध की थैली प्लास्टिक में जाएगी?", "थर्माकोल का क्या करें?",
           "कचरा अलग करना सिखाइए"],
}

T = {
    "en": {
        "answer_intro": "{emoji} {name} → {category}",
        "not_collected": "Swacchify doesn't collect this, but here's what to do.",
        "unknown": "I'm not completely sure about that one. Can you tell me what it's mostly made of?",
        "unknown_hint": "Tip: try the item's everyday name, like \"milk packet\" or \"old charger\".",
        "greeting": "Namaste! 🙏 Tell me any item you want to throw away and I'll tell you where it goes.",
        "thanks": "Happy to help! Every item you segregate makes a difference. 🌱",
        "segregation": "Here's the simplest way to segregate at home:",
        "pickup": "Sure! Tell me what you have, or schedule a pickup for your dry waste.",
        "rewards": "You earn Swacchify Points for verified pickups, lessons, quizzes and daily challenges.",
        "category": "Here's what goes in {category}:",
    },
    "hi": {
        "answer_intro": "{emoji} {name} → {category}",
        "not_collected": "स्वच्छिफ़ाई इसे नहीं लेता, पर इसका सही तरीका यह है।",
        "unknown": "मुझे इसके बारे में पक्का नहीं पता। क्या आप बता सकते हैं कि यह ज़्यादातर किस चीज़ से बना है?",
        "unknown_hint": "सुझाव: रोज़ का नाम लिखें, जैसे \"दूध की थैली\" या \"पुराना चार्जर\"।",
        "greeting": "नमस्ते! 🙏 कोई भी चीज़ बताइए जिसे आप फेंकना चाहते हैं, मैं बताऊँगा वह कहाँ जाएगी।",
        "thanks": "खुशी हुई! आपकी हर छँटाई से फ़र्क पड़ता है। 🌱",
        "segregation": "घर पर कचरा अलग करने का सबसे आसान तरीका:",
        "pickup": "ज़रूर! बताइए आपके पास क्या है, या सूखे कचरे का पिकअप बुक करें।",
        "rewards": "सत्यापित पिकअप, पाठ, क्विज़ और रोज़ की चुनौतियों से आपको स्वच्छिफ़ाई पॉइंट मिलते हैं।",
        "category": "{category} में क्या जाता है:",
    },
}

SEGREGATION_STEPS = {
    "en": [("🥬", "Wet waste", "Food scraps, peels, tea leaves → compost or green bin"),
           ("📦", "Dry waste", "Plastic, paper, metal, glass, cloth → clean, dry, and give to Swacchify"),
           ("⚠️", "Hazardous", "Batteries, bulbs, medicines, sharp things → keep separate")],
    "hi": [("🥬", "गीला कचरा", "खाना, छिलके, चायपत्ती → कम्पोस्ट या हरा डिब्बा"),
           ("📦", "सूखा कचरा", "प्लास्टिक, कागज़, धातु, काँच, कपड़ा → साफ़, सूखा, स्वच्छिफ़ाई को दें"),
           ("⚠️", "हानिकारक", "बैटरी, बल्ब, दवाइयाँ, धारदार चीज़ें → अलग रखें")],
}


# ── Payload builders (shared by KB-only and Claude paths) ─────────────────────────────────────
def _cat_view(cat: WasteCategory, lang: str) -> dict:
    return {"slug": cat.slug, "name": cat.name_hi if lang == "hi" else cat.name, "emoji": cat.emoji,
            "color": cat.color, "collectable": cat.collectable}


def _lesson_view(kb: KBIndex, item: WasteItem | None, cat_slug: str | None, lang: str) -> dict | None:
    lesson = kb.lesson_for(item, cat_slug)
    if not lesson:
        return None
    return {"slug": lesson.slug, "title": (lesson.title_hi or lesson.title) if lang == "hi" else lesson.title,
            "duration_sec": lesson.duration_sec, "emoji": lesson.emoji}


def _actions(cat: WasteCategory, item: WasteItem | None, learn: dict | None) -> list[dict]:
    acts = []
    if cat.collectable:
        acts.append({"type": "schedule_pickup", "label": f"Schedule {cat.name} pickup", "params": {"category": cat.slug}})
    if (item.donatable if item else cat.donatable):
        acts.append({"type": "donate", "label": "Donate it", "params": {"category": cat.slug}})
    if cat.slug == "ewaste":
        acts.append({"type": "dropoff", "label": "Nearest e-waste drop box", "params": {"kind": "ewaste_bin"}})
    if learn:
        acts.append({"type": "learn", "label": f"Watch: {learn['title']}", "params": {"lesson": learn["slug"]}})
    return acts


def _suggestions(kb: KBIndex, item: WasteItem | None, lang: str) -> list[str]:
    out = []
    for slug in (item.related if item else [])[:2]:
        rel = kb.items.get(slug)
        if rel:
            name = (rel.name_hi or rel.name) if lang == "hi" else rel.name.lower()
            out.append(f"{name} का क्या करें?" if lang == "hi" else f"What about a {name}?")
    return (out + DEFAULT_SUGGESTIONS[lang])[:3]


def answer_payload(kb: KBIndex, item: WasteItem, lang: str, source: str = "knowledge_base",
                   texts: dict | None = None, confidence: str = "high") -> dict:
    cat = kb.categories[item.category.slug]
    learn = _lesson_view(kb, item, cat.slug, lang)
    if texts is None:
        if lang == "hi":
            g = cat.guidance.get("hi", {})
            def sentences(xs: list[str]) -> str:
                return " ".join(x.rstrip("।") + "।" for x in xs)

            texts = {"what_to_do": sentences(g.get("do", [])[:3]), "why": g.get("why", ""),
                     "what_not_to_do": sentences(g.get("dont", [])[:2])}
        else:
            texts = {"what_to_do": item.what_to_do, "why": item.why, "what_not_to_do": item.what_not_to_do}
    name = (item.name_hi or item.name) if lang == "hi" else item.name
    intro = T[lang]["answer_intro"].format(emoji=item.emoji, name=name, category=_cat_view(cat, lang)["name"])
    if not cat.collectable:
        intro += " · " + T[lang]["not_collected"]
    return {
        "kind": "answer", "text": texts.get("intro") or intro,
        "card": {
            "item": {"slug": item.slug, "name": name, "emoji": item.emoji},
            "category": _cat_view(cat, lang),
            "what_to_do": texts["what_to_do"], "why": texts["why"], "what_not_to_do": texts["what_not_to_do"],
            "prep": item.prep_tips if lang == "en" else None,
            "safety": item.safety_notes, "reuse": item.reuse_tip, "local_note": item.local_note,
        },
        "clarify": None, "actions": _actions(cat, item, learn), "learn": learn,
        "suggestions": _suggestions(kb, item, lang), "source": source, "confidence": confidence,
        "item_slug": item.slug, "category_slug": cat.slug,
    }


def clarify_payload(kb: KBIndex, item: WasteItem, lang: str) -> dict:
    c = item.clarify or {}
    return {
        "kind": "clarify", "text": c.get("question_hi" if lang == "hi" else "question", "Which one is it?"),
        "card": None,
        "clarify": {"question": c.get("question_hi" if lang == "hi" else "question"),
                    "options": [{"label": o.get("label_hi" if lang == "hi" else "label") or o["label"],
                                 "emoji": o.get("emoji", ""), "item_slug": o["item"]}
                                for o in c.get("options", []) if o["item"] in kb.items]},
        "actions": [], "learn": None, "suggestions": [], "source": "knowledge_base", "confidence": "medium",
        "item_slug": item.slug, "category_slug": None,
    }


def category_payload(kb: KBIndex, slug: str, lang: str) -> dict:
    cat = kb.categories[slug]
    g = cat.guidance.get(lang) or cat.guidance.get("en", {})
    examples = [((i.name_hi or i.name) if lang == "hi" else i.name) for i in kb.items.values()
                if i.category.slug == slug and not i.clarify][:8]
    learn = _lesson_view(kb, None, slug, lang)
    cv = _cat_view(cat, lang)
    return {
        "kind": "category", "text": T[lang]["category"].format(category=f"{cat.emoji} {cv['name']}"), "card": None,
        "category_guide": {**cv, "do": g.get("do", []), "dont": g.get("dont", []), "why": g.get("why", ""),
                           "examples": examples},
        "clarify": None, "actions": _actions(cat, None, learn), "learn": learn,
        "suggestions": DEFAULT_SUGGESTIONS[lang][:3], "source": "knowledge_base", "confidence": "high",
        "item_slug": None, "category_slug": slug,
    }


def info_payload(kb: KBIndex, key: str, lang: str) -> dict:
    p: dict[str, Any] = {"kind": "info", "text": T[lang][key], "card": None, "clarify": None, "actions": [],
                         "learn": None, "suggestions": DEFAULT_SUGGESTIONS[lang][:3], "source": "knowledge_base",
                         "confidence": "high", "item_slug": None, "category_slug": None}
    if key == "segregation":
        p["steps"] = [{"emoji": e, "title": t, "text": x} for e, t, x in SEGREGATION_STEPS[lang]]
        lesson = kb.lessons.get("three-bins")
        if lesson:
            p["learn"] = {"slug": lesson.slug, "title": (lesson.title_hi or lesson.title) if lang == "hi"
                          else lesson.title, "duration_sec": lesson.duration_sec, "emoji": lesson.emoji}
            p["actions"] = [{"type": "learn", "label": "Watch the 45-sec guide", "params": {"lesson": lesson.slug}}]
    elif key == "pickup":
        p["actions"] = [{"type": "schedule_pickup", "label": "Schedule a pickup", "params": {}}]
    elif key == "rewards":
        p["actions"] = [{"type": "open", "label": "My rewards", "params": {"path": "/app/rewards"}}]
    elif key == "unknown":
        p["confidence"] = "low"
        p["text"] = f"{T[lang]['unknown']}\n{T[lang]['unknown_hint']}"
        p["clarify"] = {"question": None, "options": [
            {"label": _cat_view(c, lang)["name"], "emoji": c.emoji, "category_slug": c.slug}
            for c in kb.categories.values()]}
    return p


# ── Deterministic (knowledge-base) route ──────────────────────────────────────────────────────
def kb_reply(kb: KBIndex, message: str, lang: str, item_slug: str | None = None,
             category_slug: str | None = None) -> dict:
    if item_slug and item_slug in kb.items:
        item = kb.items[item_slug]
        return clarify_payload(kb, item, lang) if item.clarify else answer_payload(kb, item, lang)
    if category_slug and category_slug in kb.categories:
        return category_payload(kb, category_slug, lang)

    intent = kb.detect_intent(message)
    if intent == "segregation":
        return info_payload(kb, "segregation", lang)
    matches = kb.search(message)
    if matches and (matches[0].score >= STRONG_MATCH or not intent):
        top = matches[0].item
        payload = clarify_payload(kb, top, lang) if top.clarify else answer_payload(kb, top, lang)
        if matches[0].score < STRONG_MATCH:  # typo-level match
            payload["confidence"] = "medium"
        return payload
    if intent in ("pickup", "rewards", "greeting", "thanks"):
        return info_payload(kb, intent, lang)
    cat = kb.detect_category(message)
    if cat:
        return category_payload(kb, cat, lang)
    return info_payload(kb, "unknown", lang)


# ── Claude route ──────────────────────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are Swacchify AI, a friendly waste-segregation helper for households in India. Many \
users are homemakers, elders or first-time smartphone users, so write the way a helpful neighbour talks: \
short sentences, everyday words, no jargon.

Swacchify collects clean DRY waste in these categories: plastic, paper (paper & cardboard), metal, glass, \
textile, ewaste. The "other" category (wet/kitchen waste, sanitary waste, domestic hazardous waste such as \
medicines, paint and needles, thermocol, wet wipes, mirrors/crockery) is NOT collected by Swacchify; for \
those, explain the right municipal route.

Grounding rules — these matter more than anything else:
- Each turn includes KNOWLEDGE BASE records retrieved for the question. Disposal rules, categories and \
safety advice must come from those records. Do not invent rules, facility names, prices or legal claims.
- If a record fits the item, set item_slug to that record's slug and paraphrase its guidance simply. Keep \
safety notes.
- If the item is ambiguous and a record has "clarify" options, or the answer genuinely depends on what the \
item is made of, return kind "clarify" with 2–5 options. Each option's item_slug must be a slug from the \
records (use "" if none fits).
- If no record fits, answer only with general, safe segregation principles, set item_slug to "" and \
confidence to "low", and say that local rules vary and the user can check with their municipality.
- Never present uncertain information as fact. Use "generally" or "usually" where rules vary by city.
- If the question isn't about waste, recycling, the environment or using Swacchify, reply kind "info" with \
one friendly sentence steering back to waste questions.

Style: reply in the user's language (English, or Hindi in Devanagari when language is "hi"). "intro" is one \
short sentence. "what_to_do", "why" and "what_not_to_do" are each at most two short sentences. \
"follow_ups" are up to 3 natural next questions the user might ask."""

CATEGORY_ENUM = ["plastic", "paper", "metal", "glass", "textile", "ewaste", "other", "none"]

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "kind": {"type": "string", "enum": ["answer", "clarify", "info"]},
        "item_slug": {"type": "string"},
        "category": {"type": "string", "enum": CATEGORY_ENUM},
        "intro": {"type": "string"},
        "what_to_do": {"type": "string"},
        "why": {"type": "string"},
        "what_not_to_do": {"type": "string"},
        "clarify_question": {"type": "string"},
        "clarify_options": {"type": "array", "items": {
            "type": "object",
            "properties": {"label": {"type": "string"}, "emoji": {"type": "string"}, "item_slug": {"type": "string"}},
            "required": ["label", "emoji", "item_slug"], "additionalProperties": False}},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        "follow_ups": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["kind", "item_slug", "category", "intro", "what_to_do", "why", "what_not_to_do",
                 "clarify_question", "clarify_options", "confidence", "follow_ups"],
    "additionalProperties": False,
}

_client = None
_client_checked = False


def _get_client():
    global _client, _client_checked
    if not _client_checked:
        _client_checked = True
        if settings.AI_ENABLED:
            try:
                import anthropic

                kwargs = {"api_key": settings.ANTHROPIC_API_KEY} if settings.ANTHROPIC_API_KEY else {}
                client = anthropic.Anthropic(timeout=40.0, max_retries=1, **kwargs)
                # Resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN or an `ant auth login` profile.
                if client.api_key or client.auth_token or client.credentials:
                    _client = client
                else:
                    log.info("No Anthropic credentials; Swacchify AI answers from the knowledge base only")
            except Exception as exc:
                log.info("Claude disabled (%s); answering from knowledge base only", exc)
    return _client


def ai_available() -> bool:
    return _get_client() is not None


def _record(item: WasteItem) -> dict:
    return {k: v for k, v in {
        "slug": item.slug, "name": item.name, "category": item.category.slug, "collected_by_swacchify":
        item.collectable and item.category.collectable, "can_donate": item.donatable,
        "what_to_do": item.what_to_do, "why": item.why, "what_not_to_do": item.what_not_to_do,
        "prep": item.prep_tips, "safety": item.safety_notes, "reuse": item.reuse_tip, "local_note": item.local_note,
        "clarify": item.clarify,
    }.items() if v not in (None, "", [])}


def claude_reply(kb: KBIndex, message: str, lang: str, history: list[dict]) -> dict | None:
    client = _get_client()
    if client is None:
        return None
    import anthropic

    matches = kb.search(message, limit=5)
    # Follow-ups ("and its box?") → also retrieve against the previous user turn.
    if len(matches) < 2 and history:
        prev_user = next((h["content"] for h in reversed(history) if h["role"] == "user"), "")
        seen = {m.item.slug for m in matches}
        matches += [m for m in kb.search(prev_user, limit=3) if m.item.slug not in seen]
    records = [_record(m.item) for m in matches]
    category_hint = kb.detect_category(message)
    if category_hint:
        g = kb.categories[category_hint].guidance.get("en", {})
        records.append({"category_guide": category_hint, **g})

    turn = (f"language: {lang}\n\nKNOWLEDGE BASE records (JSON):\n{json.dumps(records, ensure_ascii=False)}"
            f"\n\nUser question: {message}")
    messages = [*history[-8:], {"role": "user", "content": turn}]
    try:
        resp = client.beta.messages.create(
            model=settings.AI_MODEL,
            max_tokens=4000,
            system=SYSTEM_PROMPT,
            messages=messages,
            output_config={"effort": settings.AI_EFFORT,
                           "format": {"type": "json_schema", "schema": OUTPUT_SCHEMA}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.RateLimitError:
        log.warning("Claude rate limited; using knowledge base")
        return None
    except anthropic.APIStatusError as exc:
        log.warning("Claude API error %s (request %s); using knowledge base", exc.status_code,
                    getattr(exc, "request_id", None))
        return None
    except anthropic.APIConnectionError:
        log.warning("Claude unreachable; using knowledge base")
        return None

    if resp.stop_reason in ("refusal", "max_tokens"):
        return None
    text = next((b.text for b in resp.content if b.type == "text"), None)
    try:
        out = json.loads(text or "")
    except json.JSONDecodeError:
        return None
    return _from_claude(kb, out, lang)


def _from_claude(kb: KBIndex, out: dict, lang: str) -> dict:
    item = kb.items.get(out.get("item_slug") or "")
    kind = out.get("kind")
    follow = [f for f in out.get("follow_ups", []) if f][:3] or DEFAULT_SUGGESTIONS[lang][:3]

    if kind == "clarify":
        options = [{"label": o["label"], "emoji": o.get("emoji", ""), "item_slug": o["item_slug"]}
                   for o in out.get("clarify_options", []) if o.get("item_slug") in kb.items]
        if len(options) >= 2:
            return {"kind": "clarify", "text": out.get("clarify_question") or out.get("intro"), "card": None,
                    "clarify": {"question": out.get("clarify_question"), "options": options}, "actions": [],
                    "learn": None, "suggestions": [], "source": "ai", "confidence": out.get("confidence", "medium"),
                    "item_slug": item.slug if item else None, "category_slug": None}
        if item and item.clarify:
            return {**clarify_payload(kb, item, lang), "source": "ai"}

    if kind == "info" or (kind == "answer" and not item and out.get("category") in (None, "none")):
        return {"kind": "info", "text": "\n".join(x for x in [out.get("intro"), out.get("what_to_do")] if x),
                "card": None, "clarify": None, "actions": [], "learn": None, "suggestions": follow,
                "source": "ai", "confidence": out.get("confidence", "low"), "item_slug": None, "category_slug": None}

    texts = {k: out.get(k, "") for k in ("intro", "what_to_do", "why", "what_not_to_do")}
    if item:
        # The KB's category always wins over the model's.
        payload = answer_payload(kb, item, lang, source="ai", texts=texts, confidence=out.get("confidence", "high"))
        payload["suggestions"] = follow
        return payload

    # No KB record: general guidance under the model's best-guess category, marked low confidence.
    cat = kb.categories.get(out.get("category", ""))
    learn = _lesson_view(kb, None, cat.slug, lang) if cat else None
    return {
        "kind": "answer", "text": texts["intro"],
        "card": {"item": None, "category": _cat_view(cat, lang) if cat else None,
                 "what_to_do": texts["what_to_do"], "why": texts["why"], "what_not_to_do": texts["what_not_to_do"],
                 "prep": None, "safety": None, "reuse": None,
                 "local_note": "This item isn't in our verified guide yet. Local rules vary — check with your "
                               "municipality if unsure."},
        "clarify": None, "actions": _actions(cat, None, learn) if cat else [], "learn": learn,
        "suggestions": follow, "source": "ai", "confidence": "low", "item_slug": None,
        "category_slug": cat.slug if cat else None,
    }


def reply(kb: KBIndex, message: str, lang: str, history: list[dict], item_slug: str | None = None,
          category_slug: str | None = None) -> dict:
    # Button taps (clarify options / category chips) resolve straight from the verified KB.
    if item_slug or category_slug:
        return kb_reply(kb, message, lang, item_slug, category_slug)
    intent = kb.detect_intent(message)
    if intent in ("greeting", "thanks") and not kb.search(message):
        return kb_reply(kb, message, lang)
    return claude_reply(kb, message, lang, history) or kb_reply(kb, message, lang)
