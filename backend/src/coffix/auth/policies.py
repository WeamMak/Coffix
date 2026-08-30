from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.api.errors import ApiError
from coffix.auth.models import AuthSession
from coffix.auth.tokens import AccessTokenError, decode_access_token
from coffix.core.database import get_session
from coffix.users.models import Role
from coffix.users.repository import UserRepository


@dataclass(frozen=True, slots=True)
class CurrentActor:
    user_id: UUID
    role: Role
    is_active: bool = True


SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def get_current_actor(request: Request, session: SessionDep) -> CurrentActor:
    actor = getattr(request.state, "actor", None)
    if isinstance(actor, CurrentActor):
        return actor

    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise ApiError(status=401, code="unauthorized", title="Authentication required")
    try:
        claims = decode_access_token(
            token,
            public_key=request.app.state.settings.jwt_public_key,
            now=request.app.state.clock.now(),
        )
    except AccessTokenError as exc:
        raise ApiError(status=401, code="unauthorized", title="Invalid access token") from exc

    auth_session = await session.get(AuthSession, claims.session_id)
    user = await UserRepository(session).get(claims.user_id)
    if (
        auth_session is None
        or auth_session.user_id != claims.user_id
        or auth_session.revoked_at is not None
        or user is None
    ):
        raise ApiError(status=401, code="unauthorized", title="Invalid access token")
    if not user.is_active:
        raise ApiError(status=403, code="account_inactive", title="Account is inactive")
    return CurrentActor(user_id=user.id, role=user.role, is_active=user.is_active)


CurrentActorDep = Annotated[CurrentActor, Depends(get_current_actor)]


def require_role(actor: CurrentActor, expected: Role) -> CurrentActor:
    if not actor.is_active:
        raise ApiError(status=403, code="account_inactive", title="Account is inactive")
    if actor.role is not expected:
        raise ApiError(status=403, code="forbidden", title="Permission denied")
    return actor


def require_customer(actor: CurrentActorDep) -> CurrentActor:
    return require_role(actor, Role.CUSTOMER)


def require_admin(actor: CurrentActorDep) -> CurrentActor:
    return require_role(actor, Role.ADMIN)


def require_technician(actor: CurrentActorDep) -> CurrentActor:
    return require_role(actor, Role.TECHNICIAN)


CustomerActorDep = Annotated[CurrentActor, Depends(require_customer)]
AdminActorDep = Annotated[CurrentActor, Depends(require_admin)]
TechnicianActorDep = Annotated[CurrentActor, Depends(require_technician)]
