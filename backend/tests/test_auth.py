import uuid

from tests.conftest import login


def test_register_login_and_public_id(client):
    email = f"new-{uuid.uuid4().hex[:6]}@swacchify.demo"
    r = client.post("/api/v1/auth/register", json={"full_name": "Kavya Rao", "email": email,
                                                   "phone": "+91 98765 00000", "password": "longpassword1"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["user"]["public_code"].startswith("SWC-")
    assert body["user"]["phone"] == "9876500000"
    me = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.json()["email"] == email

    dup = client.post("/api/v1/auth/register", json={"full_name": "Kavya", "email": email, "password": "longpassword1"})
    assert dup.status_code == 409
    bad = client.post("/api/v1/auth/login", json={"email": email, "password": "wrong-password"})
    assert bad.status_code == 401


def test_refresh_rotation_detects_reuse(client):
    r = client.post("/api/v1/auth/login", json={"email": "rahul@swacchify.demo", "password": "Swacchify@123"})
    first = r.json()["refresh_token"]
    rotated = client.post("/api/v1/auth/refresh", json={"refresh_token": first})
    assert rotated.status_code == 200
    # Replaying the old token is rejected and revokes the family.
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": first}).status_code == 401
    assert client.post("/api/v1/auth/refresh",
                       json={"refresh_token": rotated.json()["refresh_token"]}).status_code == 401


def test_password_reset_flow(client):
    email = f"reset-{uuid.uuid4().hex[:6]}@swacchify.demo"
    client.post("/api/v1/auth/register", json={"full_name": "Reset Me", "email": email, "password": "oldpassword1"})
    r = client.post("/api/v1/auth/forgot-password", json={"email": email})
    token = r.json()["dev_reset_url"].split("token=")[1]
    assert client.post("/api/v1/auth/reset-password", json={"token": token, "password": "newpassword1"}).status_code == 200
    assert client.post("/api/v1/auth/reset-password", json={"token": token, "password": "again12345"}).status_code == 400
    login(client, email, "newpassword1")
    # Unknown emails get the same answer (no account enumeration).
    unknown = client.post("/api/v1/auth/forgot-password", json={"email": "nobody@swacchify.demo"})
    assert unknown.json()["message"] == r.json()["message"]


def test_role_based_access(client, priya):
    assert client.get("/api/v1/admin/overview", headers=priya).status_code == 403
    partner = login(client, "partner1@swacchify.demo")
    assert client.post("/api/v1/pickups", headers=partner, json={}).status_code in (403, 422)
    assert client.get("/api/v1/partners/me", headers=priya).status_code == 403
    assert client.get("/api/v1/industries/materials", headers=partner).status_code == 403
    assert client.get("/api/v1/users/me").status_code == 401
