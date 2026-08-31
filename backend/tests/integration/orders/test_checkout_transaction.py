from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.carts.models import Cart, CartStatus
from coffix.carts.repository import CartRepository
from coffix.carts.service import CartService
from coffix.catalog.repository import CatalogRepository
from coffix.catalog.schemas import CategoryCreate, ProductCreate, SkuCreate, SkuUpdate
from coffix.core.clock import FakeClock
from coffix.core.ids import UuidGenerator
from coffix.inventory.repository import InventoryRepository
from coffix.inventory.service import InventoryService
from coffix.orders.repository import OrderRepository
from coffix.orders.schemas import CheckoutRequest
from coffix.orders.service import CheckoutService, OrderService
from coffix.payments.adapters.fake import FakePaymentProvider
from coffix.payments.models import PaymentPhase
from coffix.payments.providers import ProviderState
from coffix.payments.repository import PaymentRepository
from coffix.payments.service import PaymentService
from coffix.users.models import Role
from coffix.users.repository import AddressRepository, UserRepository
from coffix.users.schemas import AddressCreate
from coffix.worker.expiration import OrderExpirationService

NOW = datetime(2026, 8, 31, 12, 0, tzinfo=UTC)


def checkout_service(session: AsyncSession, clock: FakeClock) -> CheckoutService:
    inventory = InventoryService(InventoryRepository(session), clock=clock)
    return CheckoutService(
        OrderRepository(session),
        CartRepository(session),
        inventory,
        PaymentService(
            PaymentRepository(session),
            FakePaymentProvider(signing_secret="test-secret"),
            clock=clock,
        ),
        clock=clock,
        id_generator=UuidGenerator(),
        shipping_fee_agorot=3000,
        payment_ttl_seconds=1800,
    )


@pytest.mark.asyncio
async def test_checkout_snapshots_server_values_transfers_stock_and_is_idempotent(
    database_session: AsyncSession,
) -> None:
    clock = FakeClock(NOW)
    customer = await UserRepository(database_session).create(
        phone_e164="+972501234567", role=Role.CUSTOMER
    )
    address = await AddressRepository(database_session).create(
        customer.id,
        AddressCreate(
            recipient_name="נועה כהן",
            phone="0501234567",
            street="הרצל",
            building="10",
            apartment="3",
            city="תל אביב",
            postal_code="6100000",
            is_default=True,
        ),
    )
    catalog = CatalogRepository(database_session)
    category = await catalog.create_category(CategoryCreate(name_he="קפה", slug="checkout"))
    product = await catalog.create_product(
        ProductCreate(
            category_id=category.id,
            name_he="פולי הבית",
            description_he="תערובת הבית",
            product_type="beans",
        )
    )
    sku = await catalog.create_sku(
        product.id,
        SkuCreate(sku_code="CHECKOUT-1", price_agorot=2900, stock_quantity=4),
    )
    carts = CartService(
        CartRepository(database_session),
        InventoryService(InventoryRepository(database_session), clock=clock),
        clock=clock,
        ttl_seconds=3600,
    )
    added = await carts.add_item(customer.id, sku.id, quantity=2)
    await catalog.update_sku(sku, SkuUpdate(price_agorot=3100))

    service = checkout_service(database_session, clock)
    first = await service.checkout(
        customer.id,
        CheckoutRequest(address_id=address.id),
        idempotency_key="checkout-request-1",
    )
    duplicate = await service.checkout(
        customer.id,
        CheckoutRequest(address_id=address.id),
        idempotency_key="checkout-request-1",
    )
    address.recipient_name = "שם חדש שלא אמור להופיע"
    product.name_he = "שם מוצר חדש"
    sku.price_agorot = 9999
    await database_session.flush()
    persisted = await OrderService(
        OrderRepository(database_session),
        InventoryService(InventoryRepository(database_session), clock=clock),
        clock=clock,
    ).get_for_customer(first.order.id, customer.id)
    reservations = await InventoryRepository(database_session).active_order_reservations(
        first.order.id
    )
    original_cart = await database_session.get(Cart, added.cart.id)

    assert duplicate.order.id == first.order.id
    assert duplicate.payment.payment_id == first.payment.payment_id
    assert first.order.order_number.startswith("CFX-")
    assert first.order.subtotal_agorot == 6200
    assert first.order.shipping_agorot == 3000
    assert first.order.total_agorot == 9200
    assert first.order.payment_deadline == NOW + timedelta(minutes=30)
    assert first.order.address.recipient_name == "נועה כהן"
    assert first.order.address.country == "IL"
    assert first.order.items[0].product_name_he == "פולי הבית"
    assert first.order.items[0].sku_code == "CHECKOUT-1"
    assert first.order.items[0].unit_price_agorot == 3100
    assert first.order.items[0].quantity == 2
    assert persisted.address.recipient_name == "נועה כהן"
    assert persisted.items[0].product_name_he == "פולי הבית"
    assert persisted.items[0].unit_price_agorot == 3100
    assert len(reservations) == 1
    assert reservations[0].cart_id is None
    assert reservations[0].order_id == first.order.id
    assert reservations[0].expires_at == first.order.payment_deadline
    assert original_cart is not None
    assert original_cart.status is CartStatus.CHECKED_OUT


@pytest.mark.asyncio
async def test_verified_payment_consumes_stock_and_finalizes_order_exactly_once(
    database_session: AsyncSession,
) -> None:
    clock = FakeClock(NOW)
    customer = await UserRepository(database_session).create(
        phone_e164="+972509876543", role=Role.CUSTOMER
    )
    catalog = CatalogRepository(database_session)
    category = await catalog.create_category(
        CategoryCreate(name_he="מכונות", slug="payment-finalization")
    )
    product = await catalog.create_product(
        ProductCreate(
            category_id=category.id,
            name_he="מכונת בדיקה",
            description_he="מוצר לבדיקת תשלום",
            product_type="machine",
        )
    )
    sku = await catalog.create_sku(
        product.id,
        SkuCreate(sku_code="PAYMENT-1", price_agorot=10000, stock_quantity=3),
    )
    carts = CartService(
        CartRepository(database_session),
        InventoryService(InventoryRepository(database_session), clock=clock),
        clock=clock,
        ttl_seconds=3600,
    )
    await carts.add_item(customer.id, sku.id, quantity=2)
    checkout = await checkout_service(database_session, clock).checkout(
        customer.id,
        CheckoutRequest(
            address={
                "recipient_name": "דנה לוי",
                "phone": "0509876543",
                "street": "הנמל",
                "building": "5",
                "city": "חיפה",
            }
        ),
        idempotency_key="checkout-payment-1",
    )
    orders = OrderService(
        OrderRepository(database_session),
        InventoryService(InventoryRepository(database_session), clock=clock),
        clock=clock,
    )
    fake = FakePaymentProvider(signing_secret="test-secret")
    payments = PaymentService(
        PaymentRepository(database_session),
        fake,
        clock=clock,
        handlers={PaymentPhase.ORDER: orders.handle_provider_event},
    )
    event = fake.build_event(
        event_id="evt-order-paid",
        event_type="payment_intent.succeeded",
        provider_object_id=checkout.payment.provider_payment_id,
        state=ProviderState.CONFIRMED,
    )

    first = await payments.process_event(event)
    duplicate = await payments.process_event(event)
    paid = await orders.get_for_customer(checkout.order.id, customer.id)
    refreshed_sku = await catalog.get_sku(sku.id)
    reservations = await InventoryRepository(database_session).active_order_reservations(
        checkout.order.id
    )

    assert first.result == "processed"
    assert duplicate.result == "duplicate"
    assert paid.state.value == "paid"
    assert [entry.to_state.value for entry in paid.history] == ["pending_payment", "paid"]
    assert refreshed_sku is not None
    assert refreshed_sku.stock_quantity == 1
    assert reservations == []


@pytest.mark.asyncio
async def test_unpaid_order_expiry_releases_transferred_stock_idempotently(
    database_session: AsyncSession,
) -> None:
    clock = FakeClock(NOW)
    users = UserRepository(database_session)
    first = await users.create(phone_e164="+972501111222", role=Role.CUSTOMER)
    second = await users.create(phone_e164="+972502222333", role=Role.CUSTOMER)
    catalog = CatalogRepository(database_session)
    category = await catalog.create_category(
        CategoryCreate(name_he="הזמנה שפגה", slug="order-expiry")
    )
    product = await catalog.create_product(
        ProductCreate(
            category_id=category.id,
            name_he="מוצר שמור",
            description_he="מלאי להזמנה",
            product_type="accessory",
        )
    )
    sku = await catalog.create_sku(
        product.id,
        SkuCreate(sku_code="ORDER-EXPIRY", price_agorot=2000, stock_quantity=2),
    )
    carts = CartService(
        CartRepository(database_session),
        InventoryService(InventoryRepository(database_session), clock=clock),
        clock=clock,
        ttl_seconds=3600,
    )
    await carts.add_item(first.id, sku.id, quantity=2)
    checkout = await checkout_service(database_session, clock).checkout(
        first.id,
        CheckoutRequest(
            address={
                "recipient_name": "לקוח ראשון",
                "phone": "0501111222",
                "street": "ראשי",
                "building": "1",
                "city": "ירושלים",
            }
        ),
        idempotency_key="checkout-expiry-1",
    )
    clock.advance(timedelta(minutes=30))
    expiration = OrderExpirationService(
        OrderRepository(database_session),
        InventoryService(InventoryRepository(database_session), clock=clock),
    )

    first_pass = await expiration.expire_orders(clock.now(), batch_size=10)
    second_pass = await expiration.expire_orders(clock.now(), batch_size=10)
    reused = await carts.add_item(second.id, sku.id, quantity=2)
    expired = await OrderService(
        OrderRepository(database_session),
        InventoryService(InventoryRepository(database_session), clock=clock),
        clock=clock,
    ).get_for_customer(checkout.order.id, first.id)

    assert first_pass.expired_count == 1
    assert first_pass.released_reservation_count == 1
    assert first_pass.released_quantity == 2
    assert second_pass.expired_count == 0
    assert expired.state.value == "payment_expired"
    assert expired.history[-1].source == "system"
    assert reused.cart.items[0].quantity == 2


@pytest.mark.asyncio
async def test_pending_order_payment_is_exposed_for_reconciliation(
    database_session: AsyncSession,
) -> None:
    clock = FakeClock(NOW)
    customer = await UserRepository(database_session).create(
        phone_e164="+972503456789", role=Role.CUSTOMER
    )
    catalog = CatalogRepository(database_session)
    category = await catalog.create_category(
        CategoryCreate(name_he="התאמות", slug="order-reconciliation")
    )
    product = await catalog.create_product(
        ProductCreate(
            category_id=category.id,
            name_he="מוצר להתאמה",
            description_he="תוצאת ספק לא ידועה",
            product_type="accessory",
        )
    )
    sku = await catalog.create_sku(
        product.id,
        SkuCreate(sku_code="RECONCILE-1", price_agorot=4000, stock_quantity=1),
    )
    await CartService(
        CartRepository(database_session),
        InventoryService(InventoryRepository(database_session), clock=clock),
        clock=clock,
        ttl_seconds=3600,
    ).add_item(customer.id, sku.id, quantity=1)
    checkout = await checkout_service(database_session, clock).checkout(
        customer.id,
        CheckoutRequest(
            address={
                "recipient_name": "לקוח התאמות",
                "phone": "0503456789",
                "street": "הבדיקה",
                "building": "9",
                "city": "באר שבע",
            }
        ),
        idempotency_key="checkout-reconciliation-1",
    )

    candidates = await PaymentService(
        PaymentRepository(database_session),
        FakePaymentProvider(signing_secret="test-secret"),
        clock=clock,
    ).reconciliation_candidates(created_before=NOW + timedelta(days=1), limit=10)

    assert len(candidates) == 1
    assert candidates[0].resource.value == "payment"
    assert candidates[0].local_id == checkout.payment.payment_id
    assert candidates[0].owner_id == checkout.order.id
    assert candidates[0].provider_object_id == checkout.payment.provider_payment_id
