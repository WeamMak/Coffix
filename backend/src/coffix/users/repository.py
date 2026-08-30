from uuid import UUID

from sqlalchemy import Select, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.users.models import Address, Role, User
from coffix.users.schemas import AddressCreate, AddressUpdate


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        *,
        phone_e164: str,
        role: Role,
        display_name: str | None = None,
    ) -> User:
        user = User(phone_e164=phone_e164, role=role, display_name=display_name)
        self.session.add(user)
        await self.session.flush()
        return user

    async def get(self, user_id: UUID) -> User | None:
        return await self.session.get(User, user_id)

    async def get_by_phone(self, phone_e164: str) -> User | None:
        return await self.session.scalar(select(User).where(User.phone_e164 == phone_e164))


class AddressRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def _owned(self, owner_id: UUID) -> Select[tuple[Address]]:
        return select(Address).where(Address.user_id == owner_id)

    async def list_for_owner(self, owner_id: UUID) -> list[Address]:
        result = await self.session.scalars(
            self._owned(owner_id).order_by(Address.created_at, Address.id)
        )
        return list(result)

    async def get_for_owner(self, address_id: UUID, owner_id: UUID) -> Address | None:
        return await self.session.scalar(
            self._owned(owner_id).where(Address.id == address_id)
        )

    async def create(self, owner_id: UUID, data: AddressCreate) -> Address:
        if data.is_default:
            await self._clear_default(owner_id)
        address = Address(
            user_id=owner_id,
            recipient_name=data.recipient_name,
            phone_e164=data.phone,
            street=data.street,
            building=data.building,
            apartment=data.apartment,
            city=data.city,
            postal_code=data.postal_code,
            country=data.country,
            is_default=data.is_default,
        )
        self.session.add(address)
        await self.session.flush()
        return address

    async def update(self, address: Address, data: AddressUpdate) -> Address:
        changes = data.model_dump(exclude_unset=True)
        if changes.get("is_default") is True:
            await self._clear_default(address.user_id)
        if "phone" in changes:
            changes["phone_e164"] = changes.pop("phone")
        for field, value in changes.items():
            setattr(address, field, value)
        await self.session.flush()
        await self.session.refresh(address)
        return address

    async def delete(self, address: Address) -> None:
        await self.session.delete(address)
        await self.session.flush()

    async def _clear_default(self, owner_id: UUID) -> None:
        await self.session.execute(
            update(Address)
            .where(Address.user_id == owner_id, Address.is_default.is_(True))
            .values(is_default=False)
        )
