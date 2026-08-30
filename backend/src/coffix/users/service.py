from __future__ import annotations

import re
from typing import TYPE_CHECKING
from uuid import UUID

from coffix.api.errors import ApiError
from coffix.users.models import Address, Role, User
from coffix.users.schemas import AddressCreate, AddressUpdate

if TYPE_CHECKING:
    from coffix.users.repository import AddressRepository, UserRepository

ISRAELI_MOBILE_PATTERN = re.compile(r"^5\d{8}$")


def normalize_israeli_phone(raw: str) -> str:
    compact = re.sub(r"[\s()-]", "", raw)
    if compact.startswith("00972"):
        national_number = compact[5:]
    elif compact.startswith("+972"):
        national_number = compact[4:]
    elif compact.startswith("972"):
        national_number = compact[3:]
    elif compact.startswith("0"):
        national_number = compact[1:]
    else:
        raise ValueError("A valid Israeli mobile number is required")

    if not ISRAELI_MOBILE_PATTERN.fullmatch(national_number):
        raise ValueError("A valid Israeli mobile number is required")
    return f"+972{national_number}"


class UserService:
    def __init__(self, users: UserRepository) -> None:
        self.users = users

    async def get_or_create_customer(self, raw_phone: str) -> User:
        phone_e164 = normalize_israeli_phone(raw_phone)
        existing = await self.users.get_by_phone(phone_e164)
        if existing is not None:
            return existing
        return await self.users.create(phone_e164=phone_e164, role=Role.CUSTOMER)


class AddressService:
    def __init__(self, addresses: AddressRepository) -> None:
        self.addresses = addresses

    async def list_addresses(self, owner_id: UUID) -> list[Address]:
        return await self.addresses.list_for_owner(owner_id)

    async def get(self, address_id: UUID, owner_id: UUID) -> Address:
        address = await self.addresses.get_for_owner(address_id, owner_id)
        if address is None:
            raise ApiError(status=404, code="not_found", title="Address not found")
        return address

    async def create(self, owner_id: UUID, data: AddressCreate) -> Address:
        return await self.addresses.create(owner_id, data)

    async def update(
        self,
        address_id: UUID,
        owner_id: UUID,
        data: AddressUpdate,
    ) -> Address:
        address = await self.get(address_id, owner_id)
        return await self.addresses.update(address, data)

    async def delete(self, address_id: UUID, owner_id: UUID) -> None:
        address = await self.get(address_id, owner_id)
        await self.addresses.delete(address)
