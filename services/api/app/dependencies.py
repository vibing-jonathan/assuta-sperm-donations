from typing import Annotated

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.auth import (
    AuthConfigurationError,
    AuthProviderUnavailableError,
    InvalidAccessTokenError,
    SupabaseAuthClient,
)
from app.settings import Settings, get_settings

bearer_scheme = HTTPBearer(auto_error=False)


class AdminPrincipal(BaseModel):
    user_id: str
    email: str
    role: str = "admin"


def get_supabase_auth_client(
    settings: Annotated[Settings, Depends(get_settings)],
) -> SupabaseAuthClient:
    return SupabaseAuthClient(settings)


async def require_admin(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(bearer_scheme)],
    auth_client: Annotated[SupabaseAuthClient, Depends(get_supabase_auth_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AdminPrincipal:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication is required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user = await auth_client.get_user(credentials.credentials)
    except InvalidAccessTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The session is invalid or expired",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except AuthConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured",
        ) from exc
    except AuthProviderUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is unavailable",
        ) from exc

    normalized_email = user.email.strip().casefold()
    if normalized_email not in settings.allowed_admin_email_set:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is not authorized for administration",
        )

    return AdminPrincipal(user_id=user.user_id, email=normalized_email)
