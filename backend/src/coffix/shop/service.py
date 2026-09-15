from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.admin.queries import AuditContext
from coffix.api.errors import ApiError
from coffix.notifications.models import AuditLog
from coffix.shop.models import ShopSettings
from coffix.shop.schemas import ShopSettingsRead, ShopSettingsUpdate


async def read_shop_settings(session: AsyncSession) -> ShopSettingsRead:
    row = await session.scalar(select(ShopSettings).execution_options(populate_existing=True))
    if row is None:
        raise ApiError(
            status=503, code="SHOP_SETTINGS_UNAVAILABLE", title="Shop settings unavailable"
        )
    return ShopSettingsRead.model_validate(row)


async def update_shop_settings(
    session: AsyncSession, data: ShopSettingsUpdate, context: AuditContext
) -> ShopSettingsRead:
    row = await session.scalar(
        select(ShopSettings).with_for_update().execution_options(populate_existing=True)
    )
    if row is None:
        raise ApiError(
            status=503, code="SHOP_SETTINGS_UNAVAILABLE", title="Shop settings unavailable"
        )
    if row.version != data.version:
        raise ApiError(
            status=409,
            code="SHOP_SETTINGS_VERSION_CONFLICT",
            title="Shop settings changed; reload before saving",
        )
    before = ShopSettingsRead.model_validate(row).model_dump(mode="json")
    for key, value in data.model_dump(mode="json", exclude={"version"}).items():
        setattr(row, key, value)
    row.version += 1
    result = ShopSettingsRead.model_validate(row)
    session.add(
        AuditLog(
            actor_id=context.actor_id,
            action="shop.settings_updated",
            target_type="shop_settings",
            target_id=None,
            before=before,
            after=result.model_dump(mode="json"),
            ip_address=context.ip_address,
            correlation_id=context.correlation_id,
            request_metadata={},
        )
    )
    await session.flush()
    return result
