import os
import tempfile
from datetime import timedelta

import pytest

_tmp = tempfile.mkdtemp(prefix="swacchify-test-")
os.environ.update({
    # CI also runs the suite against PostgreSQL by setting TEST_DATABASE_URL.
    "DATABASE_URL": os.environ.get("TEST_DATABASE_URL", f"sqlite:///{_tmp}/test.db"),
    "MEDIA_DIR": f"{_tmp}/media",
    "SEED_DEMO_DATA": "true",
    "AI_ENABLED": "false",  # tests exercise the deterministic knowledge-base path
    "AI_RATE_LIMIT_PER_MINUTE": "1000",
    "ENV": "test",
})

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.seed.run import DEMO_PASSWORD  # noqa: E402
from app.services.common import today_ist  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def login(client, email, password=DEMO_PASSWORD) -> dict:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def admin(client):
    return login(client, "admin@swacchify.demo")


@pytest.fixture(scope="session")
def priya(client):
    return login(client, "priya@swacchify.demo")


@pytest.fixture
def tomorrow():
    return (today_ist() + timedelta(days=1)).isoformat()
