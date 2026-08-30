from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request

from coffix.api.errors import ApiError
from coffix.users.models import Role


@dataclass(frozen=True, slots=True)
class CurrentActor:
    user_id: UUID
    role: Role
    is_active: bool = True


def get_current_actor(request: Request) -> CurrentActor:
    actor = getattr(request.state, "actor", None)
    if not isinstance(actor, CurrentActor):
        raise ApiError(status=401, code="unauthorized", title="Authentication required")
    return actor


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
