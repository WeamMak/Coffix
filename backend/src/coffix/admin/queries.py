import json
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.admin.schemas import (
    AdminUserRead,
    AuditLogRead,
    ConfigurationRead,
    DashboardRead,
    DeliveryFailureRead,
    InventoryRead,
    OrderQueueRead,
    ServiceQueueRead,
    StockCorrection,
    UserAccessUpdate,
)
from coffix.api.errors import ApiError
from coffix.catalog.models import Category, Product, ProductSku
from coffix.catalog.schemas import CategoryRead, MachineModelRead, ProductRead
from coffix.core.clock import Clock
from coffix.core.settings import Settings
from coffix.inventory.models import ReservationState, StockReservation
from coffix.machines.models import MachineModel
from coffix.notifications.models import (
    AuditLog,
    DeliveryState,
    NotificationDelivery,
    OutboxEvent,
)
from coffix.orders.models import Order, OrderState
from coffix.service.models import ServiceRequest, ServiceRequestState, ServiceType
from coffix.service.schemas import ServiceTypeRead
from coffix.users.models import Role, User


@dataclass(frozen=True, slots=True)
class AuditContext:
    actor_id: UUID
    ip_address: str | None
    correlation_id: str | None


class AdminQueries:
    def __init__(self, session: AsyncSession, *, clock: Clock) -> None:
        self.session = session
        self.clock = clock

    async def dashboard(self) -> DashboardRead:
        return DashboardRead(
            users_by_role=await self._enum_counts(User.role, Role),
            orders_by_state=await self._enum_counts(Order.state, OrderState),
            service_requests_by_state=await self._enum_counts(
                ServiceRequest.state, ServiceRequestState
            ),
            failed_deliveries=int(
                await self.session.scalar(
                    select(func.count())
                    .select_from(NotificationDelivery)
                    .where(
                        NotificationDelivery.state.in_(
                            (DeliveryState.RETRY, DeliveryState.DEAD_LETTER)
                        )
                    )
                )
                or 0
            ),
            pending_outbox_events=int(
                await self.session.scalar(
                    select(func.count())
                    .select_from(OutboxEvent)
                    .where(
                        OutboxEvent.processed_at.is_(None),
                        OutboxEvent.dead_lettered_at.is_(None),
                    )
                )
                or 0
            ),
            low_stock_skus=int(
                await self.session.scalar(
                    select(func.count())
                    .select_from(ProductSku)
                    .where(
                        ProductSku.stock_quantity.is_not(None),
                        ProductSku.stock_quantity <= 5,
                    )
                )
                or 0
            ),
        )

    async def users(self) -> list[AdminUserRead]:
        items = await self.session.scalars(select(User).order_by(User.created_at, User.id))
        return [AdminUserRead.model_validate(item) for item in items]

    async def inventory(self) -> list[InventoryRead]:
        reserved = (
            select(
                StockReservation.sku_id,
                func.coalesce(func.sum(StockReservation.quantity), 0).label("reserved"),
            )
            .where(
                StockReservation.state == ReservationState.ACTIVE,
                StockReservation.expires_at > self.clock.now(),
            )
            .group_by(StockReservation.sku_id)
            .subquery()
        )
        rows = await self.session.execute(
            select(ProductSku, Product.name_he, func.coalesce(reserved.c.reserved, 0))
            .join(Product, Product.id == ProductSku.product_id)
            .outerjoin(reserved, reserved.c.sku_id == ProductSku.id)
            .order_by(ProductSku.sku_code)
        )
        return [
            InventoryRead(
                id=sku.id,
                sku_code=sku.sku_code,
                product_name_he=product_name,
                stock_quantity=sku.stock_quantity,
                reserved_quantity=int(reserved_quantity),
                available_quantity=(
                    None
                    if sku.stock_quantity is None
                    else sku.stock_quantity - int(reserved_quantity)
                ),
                is_active=sku.is_active,
            )
            for sku, product_name, reserved_quantity in rows
        ]

    async def orders(self) -> list[OrderQueueRead]:
        items = await self.session.scalars(
            select(Order).order_by(Order.updated_at.desc(), Order.id)
        )
        return [OrderQueueRead.model_validate(item, from_attributes=True) for item in items]

    async def service_requests(self) -> list[ServiceQueueRead]:
        items = await self.session.scalars(
            select(ServiceRequest).order_by(ServiceRequest.updated_at.desc(), ServiceRequest.id)
        )
        return [ServiceQueueRead.model_validate(item, from_attributes=True) for item in items]

    async def delivery_failures(self) -> list[DeliveryFailureRead]:
        items = await self.session.scalars(
            select(NotificationDelivery)
            .where(NotificationDelivery.state.in_((DeliveryState.RETRY, DeliveryState.DEAD_LETTER)))
            .order_by(NotificationDelivery.updated_at.desc(), NotificationDelivery.id)
        )
        return [DeliveryFailureRead.model_validate(item, from_attributes=True) for item in items]

    async def audit_logs(self, *, limit: int = 100) -> list[AuditLogRead]:
        items = await self.session.scalars(
            select(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit)
        )
        return [AuditLogRead.model_validate(item) for item in items]

    async def configuration(self, settings: Settings) -> ConfigurationRead:
        categories = await self.session.scalars(
            select(Category).order_by(Category.sort_order, Category.id)
        )
        products = await self.session.scalars(
            select(Product).order_by(Product.created_at, Product.id)
        )
        models = await self.session.scalars(
            select(MachineModel).order_by(MachineModel.manufacturer, MachineModel.model_name)
        )
        service_types = await self.session.scalars(
            select(ServiceType).order_by(ServiceType.label_en, ServiceType.id)
        )
        return ConfigurationRead(
            categories=[CategoryRead.model_validate(item) for item in categories],
            products=[ProductRead.model_validate(item) for item in products],
            machine_models=[MachineModelRead.model_validate(item) for item in models],
            service_types=[ServiceTypeRead.model_validate(item) for item in service_types],
            shipping_fee_agorot=settings.shipping_fee_agorot,
            shop_address=json.loads(settings.shop_address_json),
        )

    async def _enum_counts(self, column: Any, values: type[Any]) -> dict[str, int]:
        rows = await self.session.execute(select(column, func.count()).group_by(column))
        counts = {str(value): 0 for value in values}
        counts.update({str(value): int(count) for value, count in rows})
        return counts


class AdminCommands:
    def __init__(self, session: AsyncSession, *, clock: Clock) -> None:
        self.session = session
        self.clock = clock

    async def change_user_access(
        self,
        user_id: UUID,
        data: UserAccessUpdate,
        context: AuditContext,
    ) -> AdminUserRead:
        user = await self.session.scalar(select(User).where(User.id == user_id).with_for_update())
        if user is None:
            raise ApiError(status=404, code="user_not_found", title="User not found")
        if user.id == context.actor_id and (
            (data.role is not None and data.role is not Role.ADMIN) or data.is_active is False
        ):
            raise ApiError(
                status=409,
                code="unsafe_self_change",
                title="Administrators cannot remove their own access",
            )
        removes_admin = user.role is Role.ADMIN and (
            (data.role is not None and data.role is not Role.ADMIN) or data.is_active is False
        )
        if removes_admin:
            active_admins = int(
                await self.session.scalar(
                    select(func.count())
                    .select_from(User)
                    .where(User.role == Role.ADMIN, User.is_active.is_(True))
                )
                or 0
            )
            if active_admins <= 1:
                raise ApiError(
                    status=409,
                    code="last_admin",
                    title="The last active administrator cannot be changed",
                )
        before = {"role": user.role.value, "is_active": user.is_active}
        if data.role is not None:
            user.role = data.role
        if data.is_active is not None:
            user.is_active = data.is_active
        await self.session.flush()
        await self.session.refresh(user)
        await self.audit(
            action="user.access_changed",
            target_type="user",
            target_id=user.id,
            before=before,
            after={"role": user.role.value, "is_active": user.is_active},
            context=context,
        )
        return AdminUserRead.model_validate(user)

    async def correct_stock(
        self,
        sku_id: UUID,
        data: StockCorrection,
        context: AuditContext,
    ) -> InventoryRead:
        row = (
            await self.session.execute(
                select(ProductSku, Product.name_he)
                .join(Product, Product.id == ProductSku.product_id)
                .where(ProductSku.id == sku_id)
                .with_for_update(of=ProductSku)
            )
        ).one_or_none()
        if row is None:
            raise ApiError(status=404, code="sku_not_found", title="SKU not found")
        sku, product_name = row
        if sku.stock_quantity != data.expected_quantity:
            raise ApiError(
                status=409,
                code="stock_changed",
                title="Stock changed since it was loaded",
            )
        reserved = int(
            await self.session.scalar(
                select(func.coalesce(func.sum(StockReservation.quantity), 0)).where(
                    StockReservation.sku_id == sku.id,
                    StockReservation.state == ReservationState.ACTIVE,
                    StockReservation.expires_at > self.clock.now(),
                )
            )
            or 0
        )
        if data.quantity is not None and data.quantity < reserved:
            raise ApiError(
                status=409,
                code="stock_below_reserved",
                title="Stock cannot be lower than active reservations",
            )
        before = {"stock_quantity": sku.stock_quantity}
        sku.stock_quantity = data.quantity
        await self.session.flush()
        await self.audit(
            action="inventory.stock_corrected",
            target_type="product_sku",
            target_id=sku.id,
            before=before,
            after={"stock_quantity": sku.stock_quantity, "reason": data.reason},
            context=context,
        )
        return InventoryRead(
            id=sku.id,
            sku_code=sku.sku_code,
            product_name_he=product_name,
            stock_quantity=sku.stock_quantity,
            reserved_quantity=reserved,
            available_quantity=(
                None if sku.stock_quantity is None else sku.stock_quantity - reserved
            ),
            is_active=sku.is_active,
        )

    async def audit(
        self,
        *,
        action: str,
        target_type: str,
        target_id: UUID | None,
        before: dict[str, Any] | None,
        after: dict[str, Any] | None,
        context: AuditContext,
    ) -> None:
        self.session.add(
            AuditLog(
                actor_id=context.actor_id,
                action=action,
                target_type=target_type,
                target_id=target_id,
                before=before,
                after=after,
                ip_address=context.ip_address,
                request_metadata={},
                correlation_id=context.correlation_id,
            )
        )
        await self.session.flush()
