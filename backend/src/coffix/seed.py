import asyncio
import json
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime, timedelta
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.carts.models import Cart, CartStatus
from coffix.catalog.models import Category, Product, ProductSku
from coffix.core.database import create_database_engine, create_session_factory
from coffix.core.settings import AppEnvironment, Settings
from coffix.machines.models import MachineModel, MachineSource, RegisteredMachine
from coffix.notifications.models import (
    DeliveryState,
    DevicePlatform,
    DeviceToken,
    Notification,
    NotificationDelivery,
)
from coffix.orders.models import Order, OrderItem, OrderState, OrderStatusHistory, Shipment
from coffix.payments.models import Payment, PaymentPhase, PaymentState, Refund, RefundState
from coffix.service.models import (
    ServiceLocationMode,
    ServiceNote,
    ServiceNoteVisibility,
    ServiceQuote,
    ServiceQuoteDecision,
    ServiceRequest,
    ServiceRequestState,
    ServiceStatusHistory,
    ServiceType,
    ServiceTypeMachineModel,
)
from coffix.users.models import Role, User

SEED_TIME = datetime(2026, 1, 1, 10, 0, tzinfo=UTC)


def _seed_id(name: str) -> UUID:
    return uuid5(NAMESPACE_URL, f"https://coffix.app/seed/v1/{name}")


SEED_IDS = {
    name: _seed_id(name)
    for name in (
        "user:admin",
        "user:technician",
        "user:customer",
        "category:coffee",
        "category:machines",
        "category:capsules",
        "category:grinders",
        "category:accessories",
        "category:parts",
        "product:beans",
        "sku:beans",
        "model:lelit-bianca",
        "model:lelit-mara",
        "model:rancilio-silvia-pro",
        "model:rancilio-silvia",
        "service:maintenance",
        "service:repair",
        "machine:one",
        "machine:pro",
        "notification:unread",
        "notification:read",
        "device:customer",
        "delivery:retry",
        "delivery:dead-letter",
    )
}


@dataclass(frozen=True, slots=True)
class SeedSummary:
    created: bool
    identities: dict[str, str]
    counts: dict[str, int]
    fake_otp_code: str | None


async def seed_database(settings: Settings) -> SeedSummary:
    if settings.app_env is AppEnvironment.PROD:
        raise RuntimeError("Development seed data cannot be loaded in production")
    engine = create_database_engine(settings)
    factory = create_session_factory(engine)
    created = False
    try:
        async with factory() as session, session.begin():
            marker = await session.get(User, SEED_IDS["user:admin"])
            if marker is None:
                await _insert_seed_data(session)
                created = True
            else:
                await _ensure_catalog_categories(session)
            counts = await _counts(session)
    finally:
        await engine.dispose()
    return SeedSummary(
        created=created,
        identities={
            "admin_user_id": str(SEED_IDS["user:admin"]),
            "admin_phone": "+972500000001",
            "technician_user_id": str(SEED_IDS["user:technician"]),
            "technician_phone": "+972500000002",
            "customer_user_id": str(SEED_IDS["user:customer"]),
            "customer_phone": "+972500000003",
        },
        counts=counts,
        fake_otp_code=settings.otp_dev_code,
    )


async def _ensure_catalog_categories(session: AsyncSession) -> dict[str, Category]:
    category_data = (
        ("category:machines", "מכונות קפה", "machines", "coffee"),
        ("category:coffee", "פולי קפה", "beans", "coffee-bean"),
        ("category:capsules", "קפסולות", "capsules", "capsule"),
        ("category:grinders", "מטחנות", "grinders", "settings"),
        ("category:accessories", "אביזרים", "accessories", "sparkles"),
        ("category:parts", "חלקי חילוף", "parts", "wrench"),
    )
    categories: dict[str, Category] = {}
    for sort_order, (key, name_he, slug, icon_key) in enumerate(category_data, start=1):
        category = await session.get(Category, SEED_IDS[key])
        if category is None:
            category = Category(
                id=SEED_IDS[key],
                name_he=name_he,
                slug=slug,
                icon_key=icon_key,
                sort_order=sort_order,
                is_active=True,
                created_at=SEED_TIME,
                updated_at=SEED_TIME,
            )
            session.add(category)
        else:
            category.name_he = name_he
            category.slug = slug
            category.icon_key = icon_key
            category.sort_order = sort_order
            category.is_active = True
        categories[key] = category
    await session.flush()
    return categories


async def _insert_seed_data(session: AsyncSession) -> None:
    admin_id = SEED_IDS["user:admin"]
    technician_id = SEED_IDS["user:technician"]
    customer_id = SEED_IDS["user:customer"]
    session.add_all(
        [
            User(
                id=admin_id,
                phone_e164="+972500000001",
                role=Role.ADMIN,
                display_name="Coffix Admin",
                is_active=True,
                created_at=SEED_TIME,
                updated_at=SEED_TIME,
            ),
            User(
                id=technician_id,
                phone_e164="+972500000002",
                role=Role.TECHNICIAN,
                display_name="Coffix Technician",
                is_active=True,
                created_at=SEED_TIME,
                updated_at=SEED_TIME,
            ),
            User(
                id=customer_id,
                phone_e164="+972500000003",
                role=Role.CUSTOMER,
                display_name="Demo Customer",
                is_active=True,
                created_at=SEED_TIME,
                updated_at=SEED_TIME,
            ),
        ]
    )
    await session.flush()

    model_one = MachineModel(
        id=SEED_IDS["model:lelit-bianca"],
        manufacturer="Lelit",
        model_name="Bianca V3",
        serial_pattern=r"^LB-[0-9]{4}-[0-9]{4}$",
        default_warranty_months=24,
        is_active=True,
        created_at=SEED_TIME,
        updated_at=SEED_TIME,
    )
    model_lelit_mara = MachineModel(
        id=SEED_IDS["model:lelit-mara"],
        manufacturer="Lelit",
        model_name="Mara X",
        serial_pattern=r"^LMX-[0-9]{6}$",
        default_warranty_months=12,
        is_active=True,
        created_at=SEED_TIME,
        updated_at=SEED_TIME,
    )
    model_pro = MachineModel(
        id=SEED_IDS["model:rancilio-silvia-pro"],
        manufacturer="Rancilio",
        model_name="Silvia Pro",
        serial_pattern=r"^RS-[0-9]{4}-[0-9]{4}$",
        default_warranty_months=36,
        is_active=True,
        created_at=SEED_TIME,
        updated_at=SEED_TIME,
    )
    model_rancilio_silvia = MachineModel(
        id=SEED_IDS["model:rancilio-silvia"],
        manufacturer="Rancilio",
        model_name="Silvia",
        serial_pattern=r"^RSV-[0-9]{6}$",
        default_warranty_months=18,
        is_active=True,
        created_at=SEED_TIME,
        updated_at=SEED_TIME,
    )
    session.add_all([model_one, model_lelit_mara, model_pro, model_rancilio_silvia])
    await session.flush()
    categories = await _ensure_catalog_categories(session)
    category = categories["category:coffee"]

    product = Product(
        id=SEED_IDS["product:beans"],
        category_id=category.id,
        name_he="פולי קפה הבית",
        description_he="תערובת הבית להדגמת החנות",
        admin_label_en="House beans",
        product_type="beans",
        is_featured=True,
        is_active=True,
        created_at=SEED_TIME,
        updated_at=SEED_TIME,
    )
    session.add(product)
    await session.flush()


    sku = ProductSku(
        id=SEED_IDS["sku:beans"],
        product_id=product.id,
        sku_code="DEMO-BEANS-1KG",
        attributes={"weight": "1kg"},
        price_agorot=7900,
        stock_quantity=25,
        is_active=True,
        created_at=SEED_TIME,
        updated_at=SEED_TIME,
    )
    maintenance = ServiceType(
        id=SEED_IDS["service:maintenance"],
        label_he="טיפול תקופתי",
        label_en="Maintenance",
        diagnostic_fee_agorot=15000,
        is_active=True,
        version=1,
        created_at=SEED_TIME,
        updated_at=SEED_TIME,
    )
    repair = ServiceType(
        id=SEED_IDS["service:repair"],
        label_he="תיקון תקלה",
        label_en="Repair",
        diagnostic_fee_agorot=18000,
        is_active=True,
        version=1,
        created_at=SEED_TIME,
        updated_at=SEED_TIME,
    )
    session.add_all([sku, maintenance, repair])
    await session.flush()
    session.add_all(
        [
            ServiceTypeMachineModel(
                id=_seed_id("service-model:maintenance-one"),
                service_type_id=maintenance.id,
                machine_model_id=model_one.id,
                created_at=SEED_TIME,
            ),
            ServiceTypeMachineModel(
                id=_seed_id("service-model:repair-one"),
                service_type_id=repair.id,
                machine_model_id=model_one.id,
                created_at=SEED_TIME,
            ),
            ServiceTypeMachineModel(
                id=_seed_id("service-model:repair-pro"),
                service_type_id=repair.id,
                machine_model_id=model_pro.id,
                created_at=SEED_TIME,
            ),
        ]
    )
    machine_one = RegisteredMachine(
        id=SEED_IDS["machine:one"],
        customer_id=customer_id,
        machine_model_id=model_one.id,
        serial_number="LB-2024-8821",
        serial_pending=False,
        source=MachineSource.MANUAL,
        purchase_date=date(2025, 5, 1),
        created_at=SEED_TIME,
        updated_at=SEED_TIME,
    )
    machine_pro = RegisteredMachine(
        id=SEED_IDS["machine:pro"],
        customer_id=customer_id,
        machine_model_id=model_pro.id,
        serial_number=None,
        serial_pending=True,
        source=MachineSource.MANUAL,
        purchase_date=None,
        created_at=SEED_TIME,
        updated_at=SEED_TIME,
    )
    session.add_all([machine_one, machine_pro])
    await session.flush()

    await _insert_orders(session, customer_id, admin_id, product, sku)
    await _insert_service_requests(
        session,
        customer_id=customer_id,
        admin_id=admin_id,
        technician_id=technician_id,
        machine_id=machine_one.id,
        service_type_id=repair.id,
    )
    await _insert_notifications(session, customer_id)


async def _insert_orders(
    session: AsyncSession,
    customer_id: UUID,
    admin_id: UUID,
    product: Product,
    sku: ProductSku,
) -> None:
    for index, state in enumerate(OrderState, start=1):
        cart_id = _seed_id(f"cart:{state.value}")
        order_id = _seed_id(f"order:{state.value}")
        payment_id = _seed_id(f"payment:order:{state.value}")
        session.add(
            Cart(
                id=cart_id,
                customer_id=customer_id,
                status=CartStatus.CHECKED_OUT,
                last_activity_at=SEED_TIME,
                expires_at=SEED_TIME + timedelta(hours=1),
                version=2,
                created_at=SEED_TIME,
                updated_at=SEED_TIME,
            )
        )
        payment_state = (
            PaymentState.PENDING
            if state is OrderState.PENDING_PAYMENT
            else PaymentState.FAILED
            if state is OrderState.PAYMENT_EXPIRED
            else PaymentState.CONFIRMED
        )
        session.add(
            Payment(
                id=payment_id,
                owner_id=order_id,
                phase=PaymentPhase.ORDER,
                amount_agorot=10900,
                provider="fake",
                provider_payment_id=f"seed_payment_{state.value}",
                provider_client_secret=f"seed_client_{state.value}",
                state=payment_state,
                idempotency_key=f"seed-payment-{state.value}",
                request_fingerprint=f"{index:x}".rjust(64, "0"),
                confirmed_at=SEED_TIME if payment_state is PaymentState.CONFIRMED else None,
                failed_at=SEED_TIME if payment_state is PaymentState.FAILED else None,
                failure_code="expired" if payment_state is PaymentState.FAILED else None,
                created_at=SEED_TIME,
                updated_at=SEED_TIME,
            )
        )
        await session.flush()
        order = Order(
            id=order_id,
            customer_id=customer_id,
            source_cart_id=cart_id,
            payment_id=payment_id,
            order_number=f"CFX-DEMO-{index:03d}",
            state=state,
            subtotal_agorot=7900,
            shipping_agorot=3000,
            total_agorot=10900,
            address_snapshot=_address(),
            payment_deadline=SEED_TIME + timedelta(minutes=30),
            checkout_idempotency_key=f"seed-order-{state.value}",
            checkout_fingerprint=f"{index:x}".rjust(64, "f"),
            created_at=SEED_TIME + timedelta(minutes=index),
            updated_at=SEED_TIME + timedelta(minutes=index),
        )
        session.add(order)
        await session.flush()
        session.add_all(
            [
                OrderItem(
                    id=_seed_id(f"order-item:{state.value}"),
                    order_id=order.id,
                    sku_id=sku.id,
                    product_id=product.id,
                    product_name_he=product.name_he,
                    sku_code=sku.sku_code,
                    attributes=sku.attributes,
                    unit_price_agorot=7900,
                    quantity=1,
                    line_total_agorot=7900,
                    created_at=SEED_TIME,
                ),
                OrderStatusHistory(
                    id=_seed_id(f"order-history:{state.value}"),
                    order_id=order.id,
                    from_state=None,
                    to_state=state,
                    actor_id=admin_id,
                    source="seed",
                    reason="Representative UI state",
                    created_at=SEED_TIME,
                ),
            ]
        )
        if state in (OrderState.SHIPPED, OrderState.DELIVERED):
            session.add(
                Shipment(
                    id=_seed_id(f"shipment:{state.value}"),
                    order_id=order.id,
                    carrier="Israel Post",
                    tracking_number=f"DEMO-{index:03d}",
                    tracking_url=f"https://tracking.example/DEMO-{index:03d}",
                    shipped_at=SEED_TIME,
                    delivered_at=SEED_TIME if state is OrderState.DELIVERED else None,
                    created_at=SEED_TIME,
                    updated_at=SEED_TIME,
                )
            )
        if state is OrderState.REFUNDED:
            session.add(
                Refund(
                    id=_seed_id("refund:refunded"),
                    payment_id=payment_id,
                    amount_agorot=10900,
                    reason="Representative refund",
                    provider="fake",
                    provider_refund_id="seed_refund_refunded",
                    state=RefundState.CONFIRMED,
                    requested_by=admin_id,
                    idempotency_key="seed-refund-refunded",
                    request_fingerprint="e" * 64,
                    confirmed_at=SEED_TIME,
                    created_at=SEED_TIME,
                    updated_at=SEED_TIME,
                )
            )
    await session.flush()


async def _insert_service_requests(
    session: AsyncSession,
    *,
    customer_id: UUID,
    admin_id: UUID,
    technician_id: UUID,
    machine_id: UUID,
    service_type_id: UUID,
) -> None:
    scheduled_states = {
        ServiceRequestState.SCHEDULED,
        ServiceRequestState.RECEIVED,
        ServiceRequestState.DIAGNOSING,
        ServiceRequestState.AWAITING_ADDITIONAL_DECISION,
        ServiceRequestState.AWAITING_ADDITIONAL_PAYMENT,
        ServiceRequestState.REPAIR_IN_PROGRESS,
        ServiceRequestState.READY_FOR_RETURN,
        ServiceRequestState.COMPLETED,
    }
    quote_states = {
        ServiceRequestState.AWAITING_ADDITIONAL_DECISION,
        ServiceRequestState.AWAITING_ADDITIONAL_PAYMENT,
        ServiceRequestState.REPAIR_IN_PROGRESS,
    }
    for index, state in enumerate(ServiceRequestState, start=1):
        request_id = _seed_id(f"service-request:{state.value}")
        scheduled = state in scheduled_states
        service_request = ServiceRequest(
            id=request_id,
            reference=f"SR-DEMO-{index:03d}",
            customer_id=customer_id,
            machine_id=machine_id,
            service_type_id=service_type_id,
            assigned_technician_id=technician_id if scheduled else None,
            state=state,
            diagnostic_fee_agorot=18000,
            description=f"Representative request in {state.value}",
            location_mode=(
                ServiceLocationMode.PICKUP if index % 2 == 0 else ServiceLocationMode.BRING_IN
            ),
            address_snapshot=_address(),
            preferred_window_start=SEED_TIME + timedelta(days=1),
            preferred_window_end=SEED_TIME + timedelta(days=1, hours=2),
            confirmed_appointment_start=(SEED_TIME + timedelta(days=2) if scheduled else None),
            confirmed_appointment_end=(
                SEED_TIME + timedelta(days=2, hours=2) if scheduled else None
            ),
            created_at=SEED_TIME + timedelta(minutes=index),
            updated_at=SEED_TIME + timedelta(minutes=index),
        )
        session.add(service_request)
        await session.flush()
        session.add(
            ServiceStatusHistory(
                id=_seed_id(f"service-history:{state.value}"),
                request_id=request_id,
                from_state=None,
                to_state=state,
                actor_id=admin_id,
                source="seed",
                reason="Representative UI state",
                created_at=SEED_TIME,
            )
        )
        if state in quote_states:
            decision = (
                ServiceQuoteDecision.PENDING
                if state is ServiceRequestState.AWAITING_ADDITIONAL_DECISION
                else ServiceQuoteDecision.ACCEPTED
            )
            session.add(
                ServiceQuote(
                    id=_seed_id(f"service-quote:{state.value}"),
                    request_id=request_id,
                    admin_author_id=admin_id,
                    amount_agorot=22000,
                    explanation="Representative additional repair",
                    decision=decision,
                    decided_at=None if decision is ServiceQuoteDecision.PENDING else SEED_TIME,
                    created_at=SEED_TIME,
                    updated_at=SEED_TIME,
                )
            )
        if state is ServiceRequestState.DIAGNOSING:
            session.add(
                ServiceNote(
                    id=_seed_id("service-note:diagnosing"),
                    request_id=request_id,
                    author_id=technician_id,
                    visibility=ServiceNoteVisibility.CUSTOMER,
                    body="נמצאת בבדיקה טכנית",
                    created_at=SEED_TIME,
                )
            )
    await session.flush()


async def _insert_notifications(session: AsyncSession, customer_id: UUID) -> None:
    unread = Notification(
        id=SEED_IDS["notification:unread"],
        recipient_id=customer_id,
        type="demo.unread",
        title_he="עדכון חדש",
        body_he="זוהי התראה שלא נקראה",
        related_entity_type="seed",
        created_at=SEED_TIME,
    )
    read = Notification(
        id=SEED_IDS["notification:read"],
        recipient_id=customer_id,
        type="demo.read",
        title_he="עדכון שנקרא",
        body_he="זוהי התראה שנקראה",
        related_entity_type="seed",
        read_at=SEED_TIME,
        created_at=SEED_TIME,
    )
    device = DeviceToken(
        id=SEED_IDS["device:customer"],
        user_id=customer_id,
        token="seed-device-token-not-for-production",
        platform=DevicePlatform.ANDROID,
        is_active=True,
        last_registered_at=SEED_TIME,
        created_at=SEED_TIME,
        updated_at=SEED_TIME,
    )
    session.add_all([unread, read, device])
    await session.flush()
    session.add_all(
        [
            NotificationDelivery(
                id=SEED_IDS["delivery:retry"],
                notification_id=unread.id,
                device_token_id=device.id,
                state=DeliveryState.RETRY,
                attempt_count=1,
                next_attempt_at=SEED_TIME + timedelta(minutes=5),
                last_error_code="seed_retry",
                created_at=SEED_TIME,
                updated_at=SEED_TIME,
            ),
            NotificationDelivery(
                id=SEED_IDS["delivery:dead-letter"],
                notification_id=read.id,
                device_token_id=device.id,
                state=DeliveryState.DEAD_LETTER,
                attempt_count=5,
                next_attempt_at=SEED_TIME,
                last_error_code="seed_dead_letter",
                dead_lettered_at=SEED_TIME,
                created_at=SEED_TIME,
                updated_at=SEED_TIME,
            ),
        ]
    )
    await session.flush()


async def _counts(session: AsyncSession) -> dict[str, int]:
    return {
        "users": int(await session.scalar(select(func.count()).select_from(User)) or 0),
        "categories": int(await session.scalar(select(func.count()).select_from(Category)) or 0),
        "products": int(await session.scalar(select(func.count()).select_from(Product)) or 0),
        "skus": int(await session.scalar(select(func.count()).select_from(ProductSku)) or 0),
        "machine_models": int(
            await session.scalar(select(func.count()).select_from(MachineModel)) or 0
        ),
        "machines": int(
            await session.scalar(select(func.count()).select_from(RegisteredMachine)) or 0
        ),
        "service_types": int(
            await session.scalar(select(func.count()).select_from(ServiceType)) or 0
        ),
        "orders": int(await session.scalar(select(func.count()).select_from(Order)) or 0),
        "service_requests": int(
            await session.scalar(select(func.count()).select_from(ServiceRequest)) or 0
        ),
        "notifications": int(
            await session.scalar(select(func.count()).select_from(Notification)) or 0
        ),
    }


def _address() -> dict[str, str]:
    return {
        "recipient_name": "Demo Customer",
        "phone_e164": "+972500000003",
        "street": "HaCoffee",
        "building": "1",
        "city": "Tel Aviv",
        "country": "IL",
    }


async def _main() -> None:
    summary = await seed_database(Settings())
    print(json.dumps(asdict(summary), ensure_ascii=False, sort_keys=True))


def main() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    main()
