from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.auth.policies import CustomerActorDep
from coffix.core.database import get_session
from coffix.users.repository import AddressRepository
from coffix.users.schemas import AddressCreate, AddressRead, AddressUpdate
from coffix.users.service import AddressService

SessionDep = Annotated[AsyncSession, Depends(get_session)]

router = APIRouter(prefix="/api/v1/users/me/addresses", tags=["addresses"])


def service_for(session: AsyncSession) -> AddressService:
    return AddressService(AddressRepository(session))


@router.get("")
async def list_addresses(actor: CustomerActorDep, session: SessionDep) -> list[AddressRead]:
    addresses = await service_for(session).list_addresses(actor.user_id)
    return [AddressRead.model_validate(address) for address in addresses]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_address(
    data: AddressCreate,
    actor: CustomerActorDep,
    session: SessionDep,
) -> AddressRead:
    address = await service_for(session).create(actor.user_id, data)
    return AddressRead.model_validate(address)


@router.get("/{address_id}")
async def get_address(
    address_id: UUID,
    actor: CustomerActorDep,
    session: SessionDep,
) -> AddressRead:
    address = await service_for(session).get(address_id, actor.user_id)
    return AddressRead.model_validate(address)


@router.patch("/{address_id}")
async def update_address(
    address_id: UUID,
    data: AddressUpdate,
    actor: CustomerActorDep,
    session: SessionDep,
) -> AddressRead:
    address = await service_for(session).update(address_id, actor.user_id, data)
    return AddressRead.model_validate(address)


@router.delete("/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_address(
    address_id: UUID,
    actor: CustomerActorDep,
    session: SessionDep,
) -> Response:
    await service_for(session).delete(address_id, actor.user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
