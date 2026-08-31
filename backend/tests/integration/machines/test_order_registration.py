from datetime import UTC, date, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.carts.repository import CartRepository
from coffix.carts.service import CartService
from coffix.catalog.repository import CatalogRepository, MachineModelRepository
from coffix.catalog.schemas import (
    CategoryCreate,
    MachineModelCreate,
    MachineModelUpdate,
    ProductCreate,
    SkuCreate,
)
from coffix.core.clock import FakeClock
from coffix.core.ids import UuidGenerator
from coffix.inventory.repository import InventoryRepository
from coffix.inventory.service import InventoryService
from coffix.machines.models import MachineSource
from coffix.machines.repository import MachineRepository
from coffix.machines.service import MachineRegistrationService
from coffix.orders.repository import OrderRepository
from coffix.orders.schemas import CheckoutRequest
from coffix.orders.service import CheckoutService, OrderService
from coffix.payments.adapters.fake import FakePaymentProvider
from coffix.payments.models import PaymentPhase
from coffix.payments.providers import ProviderState
from coffix.payments.repository import PaymentRepository
from coffix.payments.service import PaymentService
from coffix.users.models import Role
from coffix.users.repository import UserRepository

NOW = datetime(2026, 8, 31, 14, 0, tzinfo=UTC)


@pytest.mark.asyncio
async def test_paid_order_registers_each_machine_unit_once_from_checkout_snapshots(
    database_session: AsyncSession,
) -> None:
    clock = FakeClock(NOW)
    customer = await UserRepository(database_session).create(
        phone_e164="+972506666777", role=Role.CUSTOMER
    )
    catalog = CatalogRepository(database_session)
    models = MachineModelRepository(database_session)
    custom_model = await models.create(
        MachineModelCreate(
            manufacturer="Coffix",
            model_name="Barista Pro",
            default_warranty_months=18,
        )
    )
    default_model = await models.create(
        MachineModelCreate(manufacturer="Coffix", model_name="Mini")
    )
    category = await catalog.create_category(
        CategoryCreate(name_he="מכונות לרישום", slug="registered-machines")
    )
    machine_product = await catalog.create_product(
        ProductCreate(
            category_id=category.id,
            name_he="מכונת קפה",
            description_he="מכונה שנרשמת אחרי תשלום",
            product_type="machine",
        )
    )
    custom_sku = await catalog.create_sku(
        machine_product.id,
        SkuCreate(
            sku_code="REGISTER-CUSTOM",
            price_agorot=100_000,
            stock_quantity=3,
            machine_model_id=custom_model.id,
        ),
    )
    default_sku = await catalog.create_sku(
        machine_product.id,
        SkuCreate(
            sku_code="REGISTER-DEFAULT",
            price_agorot=80_000,
            stock_quantity=1,
            machine_model_id=default_model.id,
        ),
    )
    accessory_product = await catalog.create_product(
        ProductCreate(
            category_id=category.id,
            name_he="מברשת ניקוי",
            description_he="מוצר שאינו מכונה",
            product_type="accessory",
        )
    )
    accessory_sku = await catalog.create_sku(
        accessory_product.id,
        SkuCreate(
            sku_code="REGISTER-ACCESSORY",
            price_agorot=2_000,
            stock_quantity=None,
        ),
    )
    inventory = InventoryService(InventoryRepository(database_session), clock=clock)
    carts = CartService(
        CartRepository(database_session),
        inventory,
        clock=clock,
        ttl_seconds=3600,
    )
    await carts.add_item(customer.id, custom_sku.id, quantity=2)
    await carts.add_item(customer.id, default_sku.id, quantity=1)
    await carts.add_item(customer.id, accessory_sku.id, quantity=1)
    fake = FakePaymentProvider(signing_secret="test-secret")
    checkout = await CheckoutService(
        OrderRepository(database_session),
        CartRepository(database_session),
        inventory,
        PaymentService(PaymentRepository(database_session), fake, clock=clock),
        clock=clock,
        id_generator=UuidGenerator(),
        shipping_fee_agorot=3000,
        payment_ttl_seconds=1800,
    ).checkout(
        customer.id,
        CheckoutRequest(
            address={
                "recipient_name": "לקוח מכונות",
                "phone": "0506666777",
                "street": "הקפה",
                "building": "10",
                "city": "תל אביב",
            }
        ),
        idempotency_key="machine-registration-order",
    )
    await models.update(
        custom_model,
        MachineModelUpdate(default_warranty_months=36),
    )
    await models.update(
        default_model,
        MachineModelUpdate(default_warranty_months=24),
    )
    machine_repository = MachineRepository(database_session)
    machine_registrations = MachineRegistrationService(machine_repository, clock=clock)
    orders = OrderService(
        OrderRepository(database_session),
        inventory,
        clock=clock,
        machine_registrations=machine_registrations,
    )
    payments = PaymentService(
        PaymentRepository(database_session),
        fake,
        clock=clock,
        handlers={PaymentPhase.ORDER: orders.handle_provider_event},
    )
    confirmed = fake.build_event(
        event_id="evt-register-machines",
        event_type="payment_intent.succeeded",
        provider_object_id=checkout.payment.provider_payment_id,
        state=ProviderState.CONFIRMED,
    )
    another_confirmation = fake.build_event(
        event_id="evt-register-machines-again",
        event_type="payment_intent.succeeded",
        provider_object_id=checkout.payment.provider_payment_id,
        state=ProviderState.CONFIRMED,
    )

    first = await payments.process_event(confirmed)
    duplicate = await payments.process_event(confirmed)
    repeated_confirmation = await payments.process_event(another_confirmation)
    repeated_ids = await machine_registrations.register_order_machines(checkout.order.id)
    registrations = await machine_repository.list_for_order(checkout.order.id)

    assert first.result == "processed"
    assert duplicate.result == "duplicate"
    assert repeated_confirmation.result == "ignored_out_of_order"
    assert repeated_ids == [machine.id for machine in registrations]
    assert len(registrations) == 3
    assert all(machine.source is MachineSource.ORDER for machine in registrations)
    assert all(machine.serial_pending for machine in registrations)
    assert all(machine.serial_number is None for machine in registrations)
    assert all(machine.purchase_date == date(2026, 8, 31) for machine in registrations)

    custom_registrations = [
        machine for machine in registrations if machine.machine_model_id == custom_model.id
    ]
    assert len(custom_registrations) == 2
    assert {machine.source_unit_index for machine in custom_registrations} == {1, 2}
    assert {machine.warranty_months for machine in custom_registrations} == {18}
    assert {machine.warranty_start_date for machine in custom_registrations} == {date(2026, 8, 31)}
    assert {machine.warranty_end_date for machine in custom_registrations} == {date(2028, 2, 29)}

    default_registration = next(
        machine for machine in registrations if machine.machine_model_id == default_model.id
    )
    assert default_registration.warranty_months == 12
    assert default_registration.warranty_end_date == date(2027, 8, 31)
    assert {machine.machine_model_id for machine in registrations} == {
        custom_model.id,
        default_model.id,
    }
