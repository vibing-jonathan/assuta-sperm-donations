from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.auth import AuthenticatedUser, InvalidAccessTokenError
from app.dependencies import get_supabase_auth_client
from app.main import app

client = TestClient(app)


class FakeAuthClient:
    def __init__(self, user: AuthenticatedUser | None = None, invalid: bool = False) -> None:
        self.user = user
        self.invalid = invalid

    async def get_user(self, access_token: str) -> AuthenticatedUser:
        assert access_token == "test-token"
        if self.invalid or self.user is None:
            raise InvalidAccessTokenError
        return self.user


@pytest.fixture(autouse=True)
def reset_dependency_overrides() -> Iterator[None]:
    yield
    app.dependency_overrides.clear()


def use_auth_user(email: str) -> None:
    app.dependency_overrides[get_supabase_auth_client] = lambda: FakeAuthClient(
        AuthenticatedUser(user_id="user-123", email=email)
    )


def test_authentication_is_required() -> None:
    response = client.get("/api/auth/me")

    assert response.status_code == 401


def test_allowed_admin_is_returned() -> None:
    use_auth_user("JGabbayJ@gmail.com")

    response = client.get("/api/auth/me", headers={"Authorization": "Bearer test-token"})

    assert response.status_code == 200
    assert response.json() == {
        "user_id": "user-123",
        "email": "jgabbayj@gmail.com",
        "role": "admin",
    }


def test_non_admin_is_forbidden() -> None:
    use_auth_user("visitor@example.com")

    response = client.get("/api/auth/me", headers={"Authorization": "Bearer test-token"})

    assert response.status_code == 403


def test_invalid_token_is_rejected() -> None:
    app.dependency_overrides[get_supabase_auth_client] = lambda: FakeAuthClient(invalid=True)

    response = client.get("/api/auth/me", headers={"Authorization": "Bearer test-token"})

    assert response.status_code == 401
