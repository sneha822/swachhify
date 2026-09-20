import uuid

from tests.conftest import login

PARTNERS = ["partner1@swacchify.demo", "partner2@swacchify.demo", "partner3@swacchify.demo"]


def _new_customer(client):
    email = f"hh-{uuid.uuid4().hex[:6]}@swacchify.demo"
    r = client.post("/api/v1/auth/register", json={"full_name": "Sita Sharma", "email": email,
                                                   "phone": "9812345678", "password": "longpassword1"})
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    addr = client.post("/api/v1/users/me/addresses", headers=h, json={
        "line1": "12 Tilak Nagar", "city": "Jaipur", "pincode": "302004", "lat": 26.89, "lng": 75.81})
    assert addr.status_code == 201 and addr.json()["is_default"]
    return h, addr.json()["id"], r.json()["user"]


def _assigned_partner(client, code):
    for email in PARTNERS:
        h = login(client, email)
        if any(p["code"] == code for p in client.get("/api/v1/partners/pickups", headers=h).json()):
            return h
    raise AssertionError("pickup was not offered to any partner")


def test_full_pickup_lifecycle(client, admin, tomorrow):
    h, address_id, user = _new_customer(client)
    slots = client.get(f"/api/v1/pickups/slots?date={tomorrow}").json()
    slot = next(s["slot"] for s in slots if s["available"])

    # Guidance-only categories are refused.
    bad = client.post("/api/v1/pickups", headers=h, json={"address_id": address_id, "scheduled_date": tomorrow,
                                                          "slot": slot, "items": [{"category": "other", "estimated_kg": 1}]})
    assert bad.status_code == 422

    r = client.post("/api/v1/pickups", headers=h, json={
        "address_id": address_id, "scheduled_date": tomorrow, "slot": slot,
        "items": [{"category": "plastic", "estimated_kg": 2}, {"category": "ewaste", "estimated_kg": 1}]})
    assert r.status_code == 201, r.text
    pickup = r.json()
    code = pickup["code"]
    assert pickup["status"] == "assigned"  # auto-assigned to the nearest verified partner

    partner = _assigned_partner(client, code)
    offered = client.get(f"/api/v1/partners/pickups/{code}", headers=partner).json()
    # Privacy: partners see the customer's Swacchify ID, never their name; phone only once accepted.
    assert offered["customer"]["code"] == user["public_code"]
    assert "Sita" not in str(offered) and offered["customer"]["phone"] is None

    assert client.post(f"/api/v1/partners/pickups/{code}/respond", headers=partner,
                       json={"accept": True}).json()["status"] == "accepted"
    detail = client.get(f"/api/v1/pickups/{code}", headers=h).json()
    assert detail["partner"]["code"].startswith("SWP-") and "name" not in detail["partner"]
    assert detail["tracking"]["eta_min"] >= 2

    # Can't skip steps.
    skip = client.post(f"/api/v1/partners/pickups/{code}/status", headers=partner,
                       json={"status": "collected", "actual": {"plastic": 2}})
    assert skip.status_code == 409
    for st in ("on_the_way", "arrived"):
        assert client.post(f"/api/v1/partners/pickups/{code}/status", headers=partner,
                           json={"status": st}).status_code == 200
    col = client.post(f"/api/v1/partners/pickups/{code}/status", headers=partner,
                      json={"status": "collected", "actual": {"plastic": 2.4, "ewaste": 1.0}})
    assert col.json()["status"] == "collected"

    pending = client.get("/api/v1/rewards/summary", headers=h).json()
    assert pending["pending"] == round(2.4 * 10) + round(1.0 * 20)
    before = pending["balance"]

    v = client.post(f"/api/v1/admin/pickups/{code}/verify", headers=admin,
                    json={"verified": {"plastic": 2.0, "ewaste": 1.0}, "quality": "good"})
    assert v.status_code == 200 and v.json()["status"] == "completed"

    after = client.get("/api/v1/rewards/summary", headers=h).json()
    assert after["pending"] == 0
    assert after["balance"] - before == round((20 + 20) * 1.1)  # verified kg, +10% well-segregated bonus
    impact = client.get("/api/v1/impact/me", headers=h).json()["me"]
    assert impact["total_kg"] == 3.0 and impact["pickups"] == 1
    earnings = client.get("/api/v1/partners/earnings", headers=partner).json()
    assert any(i["reference"] == code for i in earnings["items"])
    titles = [n["title"] for n in client.get("/api/v1/notifications", headers=h).json()["items"]]
    assert "Pickup completed" in titles and "Partner on the way" in titles

    rate = client.post(f"/api/v1/pickups/{code}/rate", headers=h, json={"stars": 5})
    assert rate.status_code == 201
    assert client.post(f"/api/v1/pickups/{code}/rate", headers=h, json={"stars": 4}).status_code == 409


def test_reject_reassigns_and_cancel(client, tomorrow):
    h, address_id, _ = _new_customer(client)
    slot = next(s["slot"] for s in client.get(f"/api/v1/pickups/slots?date={tomorrow}").json() if s["available"])
    code = client.post("/api/v1/pickups", headers=h, json={
        "address_id": address_id, "scheduled_date": tomorrow, "slot": slot,
        "items": [{"category": "paper", "estimated_kg": 5}]}).json()["code"]
    first = _assigned_partner(client, code)
    client.post(f"/api/v1/partners/pickups/{code}/respond", headers=first, json={"accept": False, "reason": "Too far"})
    status = client.get(f"/api/v1/pickups/{code}", headers=h).json()["status"]
    assert status in ("assigned", "requested")  # offered to the next partner if one is in range
    c = client.post(f"/api/v1/pickups/{code}/cancel", headers=h, json={"reason": "Changed plans"})
    assert c.json()["status"] == "cancelled"
    assert client.post(f"/api/v1/pickups/{code}/cancel", headers=h, json={}).status_code == 409


def test_other_customers_cannot_see_pickup(client, priya, tomorrow):
    h, address_id, _ = _new_customer(client)
    slot = next(s["slot"] for s in client.get(f"/api/v1/pickups/slots?date={tomorrow}").json() if s["available"])
    code = client.post("/api/v1/pickups", headers=h, json={
        "address_id": address_id, "scheduled_date": tomorrow, "slot": slot,
        "items": [{"category": "metal", "estimated_kg": 1}]}).json()["code"]
    assert client.get(f"/api/v1/pickups/{code}", headers=priya).status_code == 404
    # Someone else's address can't be used either.
    assert client.post("/api/v1/pickups", headers=priya, json={
        "address_id": address_id, "scheduled_date": tomorrow, "slot": slot,
        "items": [{"category": "metal", "estimated_kg": 1}]}).status_code == 404
