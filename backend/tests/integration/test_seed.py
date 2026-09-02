import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import create_async_engine

from coffix.catalog.models import Category
from coffix.core.settings import Settings
from coffix.orders.models import Order, OrderState
from coffix.seed import SEED_IDS, seed_database
from coffix.service.models import ServiceRequest, ServiceRequestState
from coffix.users.models import Role, User


@pytest.mark.asyncio
async def test_seed_is_idempotent_and_covers_representative_states(
    migrated_database_url: str,
) -> None:
    settings = Settings(app_env="test", database_url=migrated_database_url)

    first = await seed_database(settings)
    second = await seed_database(settings)

    assert first.created is True
    assert second.created is False
    assert first.identities == second.identities
    assert first.identities["admin_user_id"] == str(SEED_IDS["user:admin"])
    assert first.counts == second.counts
    assert first.counts["users"] == 3
    assert first.counts["orders"] == len(OrderState)
    assert first.counts["service_requests"] == len(ServiceRequestState)

    engine = create_async_engine(migrated_database_url)
    try:
        async with engine.connect() as connection:
            roles = set(await connection.scalars(select(User.role)))
            order_states = set(await connection.scalars(select(Order.state)))
            service_states = set(await connection.scalars(select(ServiceRequest.state)))
            user_count = await connection.scalar(select(func.count()).select_from(User))
            categories = list(
                (
                    await connection.execute(
                        select(Category.name_he, Category.icon_key).order_by(
                            Category.sort_order
                        )
                    )
                ).tuples()
            )
        assert roles == set(Role)
        assert order_states == set(OrderState)
        assert service_states == set(ServiceRequestState)
        assert user_count == 3
        assert categories == [
            ("מכונות קפה", "coffee"),
            ("פולי קפה", "coffee-bean"),
            ("קפסולות", "capsule"),
            ("מטחנות", "settings"),
            ("אביזרים", "sparkles"),
            ("חלקי חילוף", "wrench"),
        ]
    finally:
        await engine.dispose()
