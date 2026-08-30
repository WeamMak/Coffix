import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.users.models import Role
from coffix.users.repository import AddressRepository, UserRepository
from coffix.users.schemas import AddressCreate


@pytest.mark.asyncio
async def test_user_phone_must_be_unique(database_session: AsyncSession) -> None:
    users = UserRepository(database_session)
    await users.create(phone_e164="+972501234567", role=Role.CUSTOMER)

    with pytest.raises(IntegrityError):
        await users.create(phone_e164="+972501234567", role=Role.CUSTOMER)


@pytest.mark.asyncio
async def test_new_default_address_replaces_previous_default(
    database_session: AsyncSession,
) -> None:
    users = UserRepository(database_session)
    addresses = AddressRepository(database_session)
    user = await users.create(phone_e164="+972501234567", role=Role.CUSTOMER)

    first = await addresses.create(
        user.id,
        AddressCreate(
            recipient_name="ישראל ישראלי",
            phone="0501234567",
            street="דיזנגוף",
            building="1",
            city="תל אביב",
            is_default=True,
        ),
    )
    second = await addresses.create(
        user.id,
        AddressCreate(
            recipient_name="ישראל ישראלי",
            phone="0501234567",
            street="הרצל",
            building="2",
            city="תל אביב",
            is_default=True,
        ),
    )

    stored = await addresses.list_for_owner(user.id)

    assert {address.id: address.is_default for address in stored} == {
        first.id: False,
        second.id: True,
    }
