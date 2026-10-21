from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models import User
from tests.conftest import PASSWORD, make_user


def register(client, username="new.user", password="Secure123", full_name="New User"):
    return client.post(
        "/api/auth/register", json={"username": username, "password": password, "full_name": full_name}
    )


def test_register_logs_in_and_hashes_password(client, db):
    resp = register(client)
    assert resp.status_code == 201
    assert resp.json()["role"] == "patient"
    assert "medslot_session" in resp.cookies
    assert client.get("/api/auth/me").json()["username"] == "new.user"

    stored = db.scalar(select(User).where(User.username == "new.user"))
    assert stored.password_hash.startswith("$argon2id$")
    assert "Secure123" not in stored.password_hash


def test_duplicate_username_is_rejected_case_insensitively(client):
    assert register(client, username="Dup.User").status_code == 201
    resp = register(TestClient(app, headers=client.headers), username="dup.user")
    assert resp.status_code == 409
    assert "taken" in resp.json()["detail"]


def test_password_rules_and_required_fields(client):
    resp = register(client, password="short")
    assert resp.status_code == 422
    assert "password" in resp.json()["detail"]["fields"]
    assert register(client, password="lettersonly").status_code == 422
    assert register(client, username="no spaces!").status_code == 422
    assert register(client, full_name="").status_code == 422


def test_login_errors_do_not_reveal_which_part_was_wrong(client, db):
    make_user(db, "bob")
    wrong_password = client.post("/api/auth/login", json={"username": "bob", "password": "nope"})
    unknown_user = client.post("/api/auth/login", json={"username": "ghost", "password": PASSWORD})
    assert wrong_password.status_code == unknown_user.status_code == 401
    assert wrong_password.json() == unknown_user.json()


def test_login_and_logout_invalidates_the_session(client, db):
    make_user(db, "carol")
    assert client.post("/api/auth/login", json={"username": "CAROL", "password": PASSWORD}).status_code == 200
    token = client.cookies.get("medslot_session")
    assert client.post("/api/auth/logout").status_code == 204

    # Replaying the old cookie must not work: the server-side session is gone.
    replay = TestClient(app)
    replay.cookies.set("medslot_session", token)
    assert replay.get("/api/auth/me").status_code == 401


def test_protected_routes_need_a_session(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/bookings/me").status_code == 401


def test_state_changing_requests_need_csrf_header(db):
    make_user(db, "dave")
    bare = TestClient(app)
    resp = bare.post("/api/auth/login", json={"username": "dave", "password": PASSWORD})
    assert resp.status_code == 403


def test_repeated_failed_logins_are_throttled(client, db):
    make_user(db, "erin")
    for _ in range(5):
        assert client.post("/api/auth/login", json={"username": "erin", "password": "bad"}).status_code == 401
    blocked = client.post("/api/auth/login", json={"username": "erin", "password": PASSWORD})
    assert blocked.status_code == 429
