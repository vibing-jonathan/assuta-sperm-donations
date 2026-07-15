from dataclasses import dataclass

import httpx

from app.settings import Settings


class AuthConfigurationError(RuntimeError):
    """Raised when server-side Supabase authentication is not configured."""


class InvalidAccessTokenError(RuntimeError):
    """Raised when Supabase rejects an access token."""


class AuthProviderUnavailableError(RuntimeError):
    """Raised when Supabase Auth cannot be reached."""


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    user_id: str
    email: str


class SupabaseAuthClient:
    """Validate access tokens against the authoritative Supabase Auth user endpoint."""

    def __init__(self, settings: Settings) -> None:
        self._project_url = settings.supabase_project_url.rstrip("/")
        self._publishable_key = settings.supabase_publishable_key

    async def get_user(self, access_token: str) -> AuthenticatedUser:
        if not self._project_url or not self._publishable_key:
            raise AuthConfigurationError

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.get(
                    f"{self._project_url}/auth/v1/user",
                    headers={
                        "apikey": self._publishable_key,
                        "Authorization": f"Bearer {access_token}",
                    },
                )
        except httpx.HTTPError as exc:
            raise AuthProviderUnavailableError from exc

        if 400 <= response.status_code < 500:
            raise InvalidAccessTokenError
        if response.is_error:
            raise AuthProviderUnavailableError

        try:
            payload = response.json()
        except ValueError as exc:
            raise AuthProviderUnavailableError from exc
        user_id = payload.get("id")
        email = payload.get("email")
        if not isinstance(user_id, str) or not isinstance(email, str):
            raise InvalidAccessTokenError

        return AuthenticatedUser(user_id=user_id, email=email)
