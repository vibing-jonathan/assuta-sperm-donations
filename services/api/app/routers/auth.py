from typing import Annotated

from fastapi import APIRouter, Depends

from app.dependencies import AdminPrincipal, require_admin

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.get("/me", response_model=AdminPrincipal)
async def get_current_admin(
    principal: Annotated[AdminPrincipal, Depends(require_admin)],
) -> AdminPrincipal:
    return principal
