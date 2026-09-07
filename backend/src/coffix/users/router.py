from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.api.errors import ApiError
from coffix.auth.policies import CustomerActorDep
from coffix.core.database import get_session
from coffix.users.repository import AddressRepository, UserRepository
from coffix.users.schemas import AddressCreate, AddressRead, AddressUpdate, UserRead
from coffix.users.service import AddressService

SessionDep = Annotated[AsyncSession, Depends(get_session)]

router = APIRouter(prefix="/api/v1/users/me", tags=["addresses"])


def service_for(session: AsyncSession) -> AddressService:
    return AddressService(AddressRepository(session))


@router.get("/addresses")
async def list_addresses(actor: CustomerActorDep, session: SessionDep) -> list[AddressRead]:
    addresses = await service_for(session).list_addresses(actor.user_id)
    return [AddressRead.model_validate(address) for address in addresses]


@router.post("/addresses", status_code=status.HTTP_201_CREATED)
async def create_address(
    data: AddressCreate,
    actor: CustomerActorDep,
    session: SessionDep,
) -> AddressRead:
    address = await service_for(session).create(actor.user_id, data)
    return AddressRead.model_validate(address)


@router.get("/addresses/{address_id}")
async def get_address(
    address_id: UUID,
    actor: CustomerActorDep,
    session: SessionDep,
) -> AddressRead:
    address = await service_for(session).get(address_id, actor.user_id)
    return AddressRead.model_validate(address)


@router.patch("/addresses/{address_id}")
async def update_address(
    address_id: UUID,
    data: AddressUpdate,
    actor: CustomerActorDep,
    session: SessionDep,
) -> AddressRead:
    address = await service_for(session).update(address_id, actor.user_id, data)
    return AddressRead.model_validate(address)


@router.delete("/addresses/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_address(
    address_id: UUID,
    actor: CustomerActorDep,
    session: SessionDep,
) -> Response:
    await service_for(session).delete(address_id, actor.user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("", tags=["profile"])
async def get_profile(actor: CustomerActorDep, session: SessionDep) -> UserRead:
    user = await UserRepository(session).get(actor.user_id)
    if user is None:
        raise ApiError(status=404, code="USER_NOT_FOUND", title="User not found")
    return UserRead.model_validate(user)
