"""Run after migration. Existing business values always win, including during races."""

import asyncio
import json

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.core.database import create_database_engine, create_session_factory
from coffix.core.settings import Settings
from coffix.shop.models import ShopSettings
from coffix.shop.schemas import ShopAddress


async def initialize_shop_settings(session: AsyncSession, settings: Settings) -> None:
    if await session.scalar(select(ShopSettings.id)) is not None:
        return
    address = ShopAddress.model_validate(json.loads(settings.shop_address_json))
    await session.execute(
        insert(ShopSettings)
        .values(
            id=1,
            version=1,
            shipping_fee_agorot=settings.shipping_fee_agorot,
            shop_address=address.model_dump(),
            phone=settings.shop_phone,
            whatsapp=settings.shop_whatsapp,
            email=None,
            opening_hours=(settings.shop_hours or "").strip() or None,
        )
        .on_conflict_do_nothing(index_elements=[ShopSettings.id])
    )


async def bootstrap(settings: Settings) -> None:
    engine = create_database_engine(settings)
    try:
        async with create_session_factory(engine)() as session, session.begin():
            await initialize_shop_settings(session, settings)
    finally:
        await engine.dispose()


def main() -> None:
    asyncio.run(bootstrap(Settings()))
    print("Shop settings initialized; existing business values preserved.")


if __name__ == "__main__":
    main()
