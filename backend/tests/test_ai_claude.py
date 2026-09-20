"""The Claude route, exercised with a fake client (no network)."""

import json
from types import SimpleNamespace

import anthropic
import httpx2
import pytest

from app.core.database import SessionLocal
from app.services import ai_assistant
from app.services.knowledge import get_index


class FakeMessages:
    def __init__(self, out=None, exc=None, stop_reason="end_turn"):
        self.out, self.exc, self.stop_reason, self.calls = out, exc, stop_reason, []

    def create(self, **kw):
        self.calls.append(kw)
        if self.exc:
            raise self.exc
        return SimpleNamespace(stop_reason=self.stop_reason,
                               content=[SimpleNamespace(type="text", text=json.dumps(self.out))])


def _out(**kw):
    base = {"kind": "answer", "item_slug": "", "category": "none", "intro": "Here you go.", "what_to_do": "Do it.",
            "why": "Because.", "what_not_to_do": "Don't.", "clarify_question": "", "clarify_options": [],
            "confidence": "high", "follow_ups": ["And batteries?"]}
    return {**base, **kw}


@pytest.fixture
def kb(client):  # `client` boots the app and seeds the knowledge base
    with SessionLocal() as db:
        return get_index(db)


@pytest.fixture
def fake(monkeypatch):
    def install(messages: FakeMessages):
        monkeypatch.setattr(ai_assistant, "_client", SimpleNamespace(beta=SimpleNamespace(messages=messages)))
        monkeypatch.setattr(ai_assistant, "_client_checked", True)
        return messages
    return install


def test_request_shape_and_kb_category_wins(kb, fake):
    m = fake(FakeMessages(_out(item_slug="electronic-toy", category="plastic")))
    p = ai_assistant.reply(kb, "my kid's old robot toy", "en", [])
    call = m.calls[0]
    assert call["model"] == "claude-opus-5"
    assert call["output_config"]["format"]["type"] == "json_schema"
    assert call["fallbacks"] == "default" and "server-side-fallback-2026-07-01" in call["betas"]
    assert "electronic-toy" in call["messages"][-1]["content"]  # retrieved KB record is in the prompt
    # The model said "plastic", but the curated record says e-waste — the record wins.
    assert p["source"] == "ai" and p["category_slug"] == "ewaste" and p["card"]["what_to_do"] == "Do it."
    assert p["suggestions"] == ["And batteries?"]


def test_invented_items_are_dropped(kb, fake):
    fake(FakeMessages(_out(item_slug="quantum-widget", category="none")))
    p = ai_assistant.reply(kb, "what about a quantum widget", "en", [])
    assert p["kind"] == "info" and p["item_slug"] is None

    fake(FakeMessages(_out(item_slug="made-up", category="metal", confidence="high")))
    p = ai_assistant.reply(kb, "a weird metal thing", "en", [])
    assert p["confidence"] == "low" and p["card"]["local_note"]


def test_clarify_options_must_exist_in_kb(kb, fake):
    fake(FakeMessages(_out(kind="clarify", clarify_question="Which bulb?", clarify_options=[
        {"label": "CFL", "emoji": "🌀", "item_slug": "cfl-bulb"},
        {"label": "LED", "emoji": "💡", "item_slug": "led-bulb"},
        {"label": "Laser", "emoji": "🔦", "item_slug": "laser-bulb"},
    ])))
    p = ai_assistant.reply(kb, "a bulb", "en", [])
    assert [o["item_slug"] for o in p["clarify"]["options"]] == ["cfl-bulb", "led-bulb"]


@pytest.mark.parametrize("exc", [
    anthropic.APIConnectionError(request=httpx2.Request("POST", "https://api.anthropic.com")),
])
def test_api_failure_falls_back_to_knowledge_base(kb, fake, exc):
    fake(FakeMessages(exc=exc))
    p = ai_assistant.reply(kb, "used batteries", "en", [])
    assert p["source"] == "knowledge_base" and p["item_slug"] == "batteries"


def test_refusal_falls_back(kb, fake):
    fake(FakeMessages(_out(), stop_reason="refusal"))
    p = ai_assistant.reply(kb, "milk packet", "en", [])
    assert p["source"] == "knowledge_base" and p["item_slug"] == "milk-packet"


def test_button_taps_skip_the_model(kb, fake):
    m = fake(FakeMessages(_out()))
    p = ai_assistant.reply(kb, "LED bulb", "en", [], item_slug="led-bulb")
    assert not m.calls and p["item_slug"] == "led-bulb"
