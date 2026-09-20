import pytest

from tests.conftest import login


@pytest.mark.parametrize("question,kind,item,category", [
    ("I have an old robot toy with a battery. What should I do?", "answer", "electronic-toy", "ewaste"),
    ("Where should I throw a toy?", "clarify", "toy", None),
    ("Can I put a milk packet with plastic?", "answer", "milk-packet", "plastic"),
    ("What should I do with used batteries?", "answer", "batteries", "ewaste"),
    ("Is an old charger e-waste?", "answer", "charger-cable", "ewaste"),
    ("What should I do with broken glass?", "answer", "broken-glass", "glass"),
    ("Can I recycle old clothes?", "answer", "old-clothes", "textile"),
    ("Where should I dispose of a CFL bulb?", "answer", "cfl-bulb", "ewaste"),
    ("Can I put a pizza box in paper recycling?", "answer", "pizza-box", "paper"),
    ("What do I do with a damaged phone?", "answer", "mobile-phone", "ewaste"),
    ("thermocal", "answer", "thermocol", "other"),  # typo tolerance
    ("doodh ki thaili", "answer", "milk-packet", "plastic"),  # Hinglish
    ("बैटरी कहाँ डालें", "answer", "batteries", "ewaste"),  # Hindi
    ("What can I put in plastic?", "category", None, "plastic"),
    ("Teach me about waste segregation.", "info", None, None),
])
def test_assistant_routing(client, question, kind, item, category):
    r = client.post("/api/v1/ai/chat", json={"message": question})
    assert r.status_code == 200
    p = r.json()["reply"]["payload"]
    assert (p["kind"], p["item_slug"], p["category_slug"]) == (kind, item, category)


def test_answer_structure_and_actions(client):
    p = client.post("/api/v1/ai/chat", json={"message": "old robot toy"}).json()["reply"]["payload"]
    card = p["card"]
    assert card["what_to_do"] and card["why"] and card["what_not_to_do"]
    types = [a["type"] for a in p["actions"]]
    assert "schedule_pickup" in types and "learn" in types
    # Guidance-only items never offer a pickup.
    t = client.post("/api/v1/ai/chat", json={"message": "wet wipes"}).json()["reply"]["payload"]
    assert "schedule_pickup" not in [a["type"] for a in t["actions"]]


def test_clarify_then_pick_option_and_guest_ownership(client):
    first = client.post("/api/v1/ai/chat", json={"message": "bulb"}).json()
    opts = first["reply"]["payload"]["clarify"]["options"]
    cfl = next(o for o in opts if o["item_slug"] == "cfl-bulb")
    follow = client.post("/api/v1/ai/chat", json={"message": cfl["label"], "item_slug": cfl["item_slug"],
                                                 "conversation_id": first["conversation_id"],
                                                 "guest_key": first["guest_key"]})
    assert follow.json()["reply"]["payload"]["item_slug"] == "cfl-bulb"
    # Without the guest key the conversation is not accessible.
    hijack = client.post("/api/v1/ai/chat", json={"message": "hi", "conversation_id": first["conversation_id"]})
    assert hijack.status_code == 404
    fb = client.post(f"/api/v1/ai/messages/{follow.json()['reply']['id']}/feedback",
                     json={"helpful": True, "guest_key": first["guest_key"]})
    assert fb.status_code == 204


def test_lesson_quiz_and_points(client):
    h = login(client, "deepak@swacchify.demo")
    lesson = client.get("/api/v1/learning/lessons/batteries", headers=h).json()
    assert lesson["slides"] and lesson["quiz_id"]
    done = client.post("/api/v1/learning/lessons/batteries/progress", headers=h, json={"progress_pct": 100}).json()
    assert done["newly_completed"] and done["points"] == 5
    again = client.post("/api/v1/learning/lessons/batteries/progress", headers=h, json={"progress_pct": 100}).json()
    assert not again["newly_completed"]

    quiz = client.get(f"/api/v1/quizzes/{lesson['quiz_id']}").json()
    assert "correct_index" not in str(quiz)  # answers are never sent to the client
    wrong = client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", headers=h,
                        json={"answers": {str(q["id"]): 0 for q in quiz["questions"]}}).json()
    assert not wrong["passed"] and wrong["results"][0]["explanation"]
    right = client.post(f"/api/v1/quizzes/{quiz['id']}/attempts", headers=h,
                        json={"answers": {str(q["id"]): 1 for q in quiz["questions"]}}).json()
    assert right["passed"] and right["points"] == 10 and right["improved"]


def test_recycler_traceability(client, admin, priya):
    # The seeded plastic order was processed: Priya's older plastic pickups show where the material went.
    pickups = client.get("/api/v1/pickups?status=completed&size=100", headers=priya).json()["items"]
    journeys = [client.get(f"/api/v1/pickups/{p['code']}", headers=priya).json()["journey"] for p in pickups
                if any(i["category"] == "plastic" for i in p["items"])]
    assert any(j.get("recycler") == "GreenLoop Polymers (demo)" for js in journeys for j in js)

    recycler = login(client, "recycler@swacchify.demo")
    stock = {m["category"]: m for m in client.get("/api/v1/industries/materials", headers=recycler).json()}
    assert stock["paper"]["available_kg"] > 0
    orders = client.get("/api/v1/admin/orders?status=requested", headers=admin).json()["orders"]
    paper = next(o for o in orders if o["category"] == "paper")
    r = client.post(f"/api/v1/admin/orders/{paper['code']}/decision", headers=admin, json={"approve": True})
    assert r.json()["status"] == "dispatched" and r.json()["allocated_kg"] > 0
    inv = client.get("/api/v1/industries/transactions", headers=recycler).json()
    assert any(t["order_code"] == paper["code"] and t["total"] > t["amount"] for t in inv)
    # A recycler can't order a material category it isn't authorised for.
    bad = client.post("/api/v1/industries/orders", headers=recycler,
                      json={"category": "ewaste", "quantity_kg": 5, "price_per_kg": 10})
    assert bad.status_code == 422


def test_admin_dashboards(client, admin):
    ov = client.get("/api/v1/admin/overview", headers=admin).json()
    assert ov["kpis"]["pickups_completed"] >= 30 and len(ov["trend"]) == 6
    ai = client.get("/api/v1/admin/ai/analytics", headers=admin).json()
    assert ai["total_questions"] > 0 and ai["top_items"]
    kb = client.get("/api/v1/admin/knowledge/items?q=thermocol", headers=admin).json()
    assert kb and kb[0]["slug"] == "thermocol"
    assert client.get("/api/v1/admin/audit", headers=admin).json()["total"] > 0
