import json
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.admin.schemas import (
    AdminCategoryRead,
    AdminListParams,
    AdminOrderParams,
    AdminProductPage,
    AdminProductParams,
    AdminProductRead,
    AdminServiceParams,
    AdminUserParams,
    AdminUserRead,
    AuditLogRead,
    AuditParams,
    ConfigurationRead,
    DashboardAppointmentRead,
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
    DeviceToken,
    Notification,
    NotificationDelivery,
    OutboxEvent,
)
from coffix.orders.models import Order, OrderState
from coffix.service.models import ServiceRequest, ServiceRequestState
from coffix.service.repository import ServiceRepository
from coffix.service.service import ServiceTypeConfigService
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
        orders = await self._enum_counts(Order.state, OrderState)
        services = await self._enum_counts(ServiceRequest.state, ServiceRequestState)
        zone = ZoneInfo("Asia/Jerusalem")
        day = self.clock.now().astimezone(zone).date()
        start = datetime.combine(day, time.min, zone)
        end = datetime.combine(day + timedelta(days=1), time.min, zone)
        appointments = await self.session.execute(
            select(ServiceRequest, User.display_name)
            .outerjoin(User, User.id == ServiceRequest.assigned_technician_id)
            .where(
                ServiceRequest.confirmed_appointment_start >= start,
                ServiceRequest.confirmed_appointment_start < end,
                ServiceRequest.state.not_in(
                    (ServiceRequestState.CANCELLED, ServiceRequestState.COMPLETED)
                ),
            )
            .order_by(ServiceRequest.confirmed_appointment_start, ServiceRequest.id)
        )
        return DashboardRead(
            product_revenue_agorot=int(
                await self.session.scalar(
                    select(func.coalesce(func.sum(Order.total_agorot), 0)).where(
                        Order.state.in_(
                            (
                                OrderState.PAID,
                                OrderState.PROCESSING,
                                OrderState.SHIPPED,
                                OrderState.DELIVERED,
                            )
                        )
                    )
                )
                or 0
            ),
            open_services=sum(
                value
                for state, value in services.items()
                if state not in ("completed", "cancelled")
            ),
            awaiting_payment_orders=orders["pending_payment"],
            awaiting_payment_services=services["awaiting_diagnostic_payment"]
            + services["awaiting_additional_payment"],
            todays_appointments=[
                DashboardAppointmentRead(
                    id=item.id,
                    reference=item.reference,
                    technician_name=name,
                    start=item.confirmed_appointment_start,
                    end=item.confirmed_appointment_end,
                )
                for item, name in appointments
                if item.confirmed_appointment_start and item.confirmed_appointment_end
            ],
            users_by_role=await self._enum_counts(User.role, Role),
            orders_by_state=orders,
            service_requests_by_state=services,
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
            failed_outbox_events=int(
                await self.session.scalar(
                    select(func.count())
                    .select_from(OutboxEvent)
                    .where(OutboxEvent.dead_lettered_at.is_not(None))
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

    async def users(self, params: AdminUserParams) -> list[AdminUserRead]:
        items = await self.session.scalars(
            select(User)
            .where(
                or_(
                    User.phone_e164.icontains(params.q.strip(), autoescape=True),
                    User.display_name.icontains(params.q.strip(), autoescape=True),
                )
            )
            .where(true() if params.role is None else User.role == params.role)
            .where(true() if params.active is None else User.is_active.is_(params.active))
            .order_by(User.created_at, User.id)
            .offset((params.page - 1) * params.limit)
            .limit(params.limit)
        )
        return [AdminUserRead.model_validate(item) for item in items]

    async def inventory(self, params: AdminListParams) -> list[InventoryRead]:
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
            .where(
                or_(
                    ProductSku.sku_code.icontains(params.q.strip(), autoescape=True),
                    Product.name_he.icontains(params.q.strip(), autoescape=True),
                )
            )
            .where(true() if params.active is None else ProductSku.is_active.is_(params.active))
            .order_by(ProductSku.sku_code)
            .offset((params.page - 1) * params.limit)
            .limit(params.limit)
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

    async def orders(self, params: AdminOrderParams) -> list[OrderQueueRead]:
        items = await self.session.scalars(
            select(Order)
            .where(Order.order_number.icontains(params.q.strip(), autoescape=True))
            .where(true() if params.state is None else Order.state == params.state)
            .order_by(Order.updated_at.desc(), Order.id)
            .offset((params.page - 1) * params.limit)
            .limit(params.limit)
        )
        return [OrderQueueRead.model_validate(item, from_attributes=True) for item in items]

    async def categories(self, params: AdminListParams) -> list[AdminCategoryRead]:
        items = await self.session.scalars(
            select(Category)
            .where(
                or_(
                    Category.name_he.icontains(params.q.strip(), autoescape=True),
                    Category.slug.icontains(params.q.strip(), autoescape=True),
                )
            )
            .where(true() if params.active is None else Category.is_active.is_(params.active))
            .order_by(Category.sort_order, Category.id)
            .offset((params.page - 1) * params.limit)
            .limit(params.limit)
        )
        return [AdminCategoryRead.model_validate(item) for item in items]

    async def products(self, params: AdminProductParams) -> AdminProductPage:
        filters = [
            or_(
                Product.name_he.icontains(params.q.strip(), autoescape=True),
                Product.admin_label_en.icontains(params.q.strip(), autoescape=True),
            )
        ]
        if params.active is not None:
            filters.append(Product.is_active.is_(params.active))
        if params.category_id is not None:
            filters.append(Product.category_id == params.category_id)
        if params.featured is not None:
            filters.append(Product.is_featured.is_(params.featured))
        total = await self.session.scalar(select(func.count()).select_from(Product).where(*filters))
        items = await self.session.scalars(
            select(Product)
            .where(*filters)
            .order_by(Product.created_at.desc(), Product.id)
            .offset((params.page - 1) * params.limit)
            .limit(params.limit)
        )
        return AdminProductPage(
            items=[AdminProductRead.model_validate(item) for item in items],
            page=params.page,
            limit=params.limit,
            total=total or 0,
        )

    async def service_requests(self, params: AdminServiceParams) -> list[ServiceQueueRead]:
        items = await self.session.scalars(
            select(ServiceRequest)
            .where(ServiceRequest.reference.icontains(params.q.strip(), autoescape=True))
            .where(true() if params.state is None else ServiceRequest.state == params.state)
            .where(
                true()
                if params.technician_id is None
                else ServiceRequest.assigned_technician_id == params.technician_id
            )
            .order_by(ServiceRequest.updated_at.desc(), ServiceRequest.id)
            .offset((params.page - 1) * params.limit)
            .limit(params.limit)
        )
        return [ServiceQueueRead.model_validate(item, from_attributes=True) for item in items]

    async def delivery_failures(self, *, page: int, limit: int) -> list[DeliveryFailureRead]:
        items = await self.session.execute(
            select(
                NotificationDelivery,
                DeviceToken.is_active,
                DeviceToken.user_id == Notification.recipient_id,
            )
            .join(DeviceToken, DeviceToken.id == NotificationDelivery.device_token_id)
            .join(Notification, Notification.id == NotificationDelivery.notification_id)
            .where(NotificationDelivery.state.in_((DeliveryState.RETRY, DeliveryState.DEAD_LETTER)))
            .order_by(NotificationDelivery.updated_at.desc(), NotificationDelivery.id)
            .offset((page - 1) * limit)
            .limit(limit)
        )
        return [
            DeliveryFailureRead.model_validate(item, from_attributes=True).model_copy(
                update={"can_retry": active and owned and item.claimed_at is None}
            )
            for item, active, owned in items
        ]

    async def audit_logs(self, params: AuditParams) -> list[AuditLogRead]:
        items = await self.session.scalars(
            select(AuditLog)
            .where(AuditLog.action.icontains(params.action.strip(), autoescape=True))
            .where(true() if not params.target_type else AuditLog.target_type == params.target_type)
            .where(true() if params.target_id is None else AuditLog.target_id == params.target_id)
            .where(true() if params.actor_id is None else AuditLog.actor_id == params.actor_id)
            .where(true() if params.from_time is None else AuditLog.created_at >= params.from_time)
            .where(true() if params.to_time is None else AuditLog.created_at < params.to_time)
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .offset((params.page - 1) * params.limit)
            .limit(params.limit)
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
        service_types = await ServiceTypeConfigService(ServiceRepository(self.session)).list_all()
        return ConfigurationRead(
            categories=[CategoryRead.model_validate(item) for item in categories],
            products=[ProductRead.model_validate(item) for item in products],
            machine_models=[MachineModelRead.model_validate(item) for item in models],
            service_types=service_types,
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

    async def retry_delivery(self, delivery_id: UUID, context: AuditContext) -> DeliveryFailureRead:
        row = (
            await self.session.execute(
                select(NotificationDelivery, DeviceToken, Notification)
                .join(DeviceToken, DeviceToken.id == NotificationDelivery.device_token_id)
                .join(Notification, Notification.id == NotificationDelivery.notification_id)
                .where(NotificationDelivery.id == delivery_id)
                .with_for_update(of=NotificationDelivery)
            )
        ).one_or_none()
        if row is None:
            raise ApiError(status=404, code="DELIVERY_NOT_FOUND", title="Delivery not found")
        delivery, token, notification = row
        if (
            delivery.state not in (DeliveryState.RETRY, DeliveryState.DEAD_LETTER)
            or delivery.claimed_at is not None
            or not token.is_active
            or token.user_id != notification.recipient_id
        ):
            raise ApiError(
                status=409, code="DELIVERY_NOT_RETRYABLE", title="Delivery cannot be retried"
            )
        before = {
            "state": delivery.state.value,
            "attempt_count": delivery.attempt_count,
            "last_error_code": delivery.last_error_code,
        }
        delivery.state = DeliveryState.PENDING
        delivery.attempt_count = 0
        delivery.dead_lettered_at = None
        delivery.last_error_code = None
        delivery.next_attempt_at = self.clock.now()
        await self.audit(
            action="notification.delivery_retried",
            target_type="notification_delivery",
            target_id=delivery.id,
            before=before,
            after={"state": "pending"},
            context=context,
        )
        return DeliveryFailureRead.model_validate(delivery, from_attributes=True)

    async def check_catalog_version(self, kind: str, record_id: UUID, version: datetime) -> None:
        model = {"category": Category, "product": Product, "sku": ProductSku}[kind]
        record = await self.session.scalar(
            select(model).where(model.id == record_id).with_for_update()
        )
        if record is None:
            raise ApiError(status=404, code="record_not_found", title="Record not found")
        if record.updated_at != version:
            raise ApiError(
                status=409,
                code="record_changed",
                title="This record changed. Reload before editing again.",
            )

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
