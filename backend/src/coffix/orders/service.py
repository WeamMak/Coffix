import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from typing import Literal
from uuid import UUID

from coffix.api.errors import ApiError
from coffix.carts.models import CartStatus
from coffix.carts.repository import CartRepository
from coffix.core.clock import Clock
from coffix.core.ids import IdGenerator
from coffix.core.types import Money, UserId
from coffix.inventory.service import InventoryService
from coffix.machines.service import MachineRegistrationService
from coffix.orders.models import Order, OrderState
from coffix.orders.repository import OrderRepository
from coffix.orders.schemas import CheckoutRequest, ShipOrderCommand
from coffix.orders.state_machine import (
    OrderAction,
    OrderTransitionError,
    allowed_admin_actions,
    next_order_state,
)
from coffix.payments.models import Payment, PaymentPhase
from coffix.payments.providers import ProviderEvent, ProviderResource, ProviderState
from coffix.payments.service import PaymentIntent, PaymentService, RefundIntent


@dataclass(frozen=True, slots=True)
class OrderTotals:
    subtotal_agorot: int
    shipping_agorot: int
    total_agorot: int
    currency: Literal["ILS"] = "ILS"


def calculate_order_totals(
    lines: Iterable[tuple[object, int]], *, shipping_fee_agorot: int
) -> OrderTotals:
    if type(shipping_fee_agorot) is not int or shipping_fee_agorot < 0:
        raise ValueError("shipping fee must be non-negative integer agorot")
    subtotal = 0
    for price_agorot, quantity in lines:
        if type(price_agorot) is not int or price_agorot < 0:
            raise ValueError("price must be non-negative integer agorot")
        if type(quantity) is not int or quantity <= 0:
            raise ValueError("quantity must be a positive integer")
        subtotal += price_agorot * quantity
    return OrderTotals(
        subtotal_agorot=subtotal,
        shipping_agorot=shipping_fee_agorot,
        total_agorot=subtotal + shipping_fee_agorot,
    )


@dataclass(frozen=True, slots=True)
class OrderAddressView:
    recipient_name: str
    phone_e164: str
    street: str
    building: str
    apartment: str | None
    city: str
    postal_code: str | None
    country: Literal["IL"]


@dataclass(frozen=True, slots=True)
class OrderItemView:
    id: UUID
    sku_id: UUID
    product_id: UUID
    product_name_he: str
    sku_code: str
    attributes: dict[str, str]
    unit_price_agorot: int
    quantity: int
    line_total_agorot: int
    currency: Literal["ILS"]
    machine_model_id: UUID | None


@dataclass(frozen=True, slots=True)
class OrderHistoryView:
    from_state: OrderState | None
    to_state: OrderState
    source: str
    reason: str | None
    created_at: datetime | None


@dataclass(frozen=True, slots=True)
class ShipmentView:
    carrier: str
    tracking_number: str
    tracking_url: str | None
    shipped_at: datetime
    delivered_at: datetime | None


@dataclass(frozen=True, slots=True)
class OrderView:
    id: UUID
    order_number: str
    state: OrderState
    items: tuple[OrderItemView, ...]
    subtotal_agorot: int
    shipping_agorot: int
    total_agorot: int
    currency: Literal["ILS"]
    address: OrderAddressView
    payment_deadline: datetime
    history: tuple[OrderHistoryView, ...]
    shipment: ShipmentView | None
    allowed_actions: tuple[str, ...]
    created_at: datetime | None


@dataclass(frozen=True, slots=True)
class CheckoutResult:
    order: OrderView
    payment: PaymentIntent


class CheckoutService:
    def __init__(
        self,
        orders: OrderRepository,
        carts: CartRepository,
        inventory: InventoryService,
        payments: PaymentService,
        *,
        clock: Clock,
        id_generator: IdGenerator,
        shipping_fee_agorot: int,
        payment_ttl_seconds: int,
    ) -> None:
        if payment_ttl_seconds <= 0:
            raise ValueError("payment_ttl_seconds must be positive")
        self.orders = orders
        self.carts = carts
        self.inventory = inventory
        self.payments = payments
        self.clock = clock
        self.id_generator = id_generator
        self.shipping_fee_agorot = shipping_fee_agorot
        self.payment_ttl_seconds = payment_ttl_seconds

    async def checkout(
        self,
        customer_id: UserId,
        data: CheckoutRequest,
        *,
        idempotency_key: str,
    ) -> CheckoutResult:
        if not idempotency_key.strip():
            raise ValueError("idempotency_key must not be empty")
        fingerprint = self._checkout_fingerprint(customer_id, data)
        existing = await self.orders.get_by_checkout_key(
            customer_id, idempotency_key, for_update=True
        )
        if existing is not None:
            return await self._existing_result(existing, fingerprint)

        if not await self.carts.lock_customer(customer_id):
            raise ApiError(status=404, code="USER_NOT_FOUND", title="User not found")
        existing = await self.orders.get_by_checkout_key(
            customer_id, idempotency_key, for_update=True
        )
        if existing is not None:
            return await self._existing_result(existing, fingerprint)
        cart = await self.carts.get_active_for_customer(customer_id, for_update=True)
        now = self.clock.now()
        if cart is None or not cart.items:
            raise ApiError(status=409, code="CART_EMPTY", title="Cart is empty")
        if cart.is_expired(now):
            await self.inventory.release_cart(cart.id)
            cart.expire(now)
            await self.carts.flush()
            raise ApiError(status=409, code="CART_EXPIRED", title="Cart expired")

        for item in cart.items:
            if not item.sku.is_active or not item.sku.product.is_active:
                raise ApiError(status=409, code="SKU_INACTIVE", title="SKU is inactive")
            if item.sku.currency != "ILS":
                raise ApiError(status=409, code="INVALID_CURRENCY", title="Invalid currency")

        address_snapshot = await self._address_snapshot(customer_id, data)
        totals = calculate_order_totals(
            ((item.sku.price_agorot, item.quantity) for item in cart.items),
            shipping_fee_agorot=self.shipping_fee_agorot,
        )
        order_id = self.id_generator.new()
        deadline = now + timedelta(seconds=self.payment_ttl_seconds)
        model_ids = {
            item.sku.machine_model_id
            for item in cart.items
            if item.sku.machine_model_id is not None
        }
        machine_models = await self.orders.get_machine_models(model_ids)
        item_snapshots: list[dict[str, object]] = []
        for item in cart.items:
            sku = item.sku
            machine = machine_models.get(sku.machine_model_id) if sku.machine_model_id else None
            item_snapshots.append(
                {
                    "sku_id": sku.id,
                    "product_id": sku.product_id,
                    "product_name_he": sku.product.name_he,
                    "sku_code": sku.sku_code,
                    "attributes": dict(sku.attributes),
                    "unit_price_agorot": sku.price_agorot,
                    "quantity": item.quantity,
                    "line_total_agorot": sku.price_agorot * item.quantity,
                    "currency": "ILS",
                    "machine_model_id": machine.id if machine else None,
                    "machine_manufacturer": machine.manufacturer if machine else None,
                    "machine_model_name": machine.model_name if machine else None,
                    "machine_warranty_months": (
                        machine.default_warranty_months if machine else None
                    ),
                }
            )
        order = await self.orders.create(
            order_id=order_id,
            customer_id=customer_id,
            source_cart_id=cart.id,
            order_number=f"CFX-{order_id.hex[:12].upper()}",
            subtotal_agorot=totals.subtotal_agorot,
            shipping_agorot=totals.shipping_agorot,
            total_agorot=totals.total_agorot,
            address_snapshot=address_snapshot,
            payment_deadline=deadline,
            checkout_idempotency_key=idempotency_key,
            checkout_fingerprint=fingerprint,
            items=item_snapshots,
            occurred_at=now,
        )
        await self.inventory.transfer_to_order(cart.id, order.id, deadline)
        cart.status = CartStatus.CHECKED_OUT
        cart.version += 1
        payment = await self.payments.create_payment(
            owner_id=order.id,
            phase=PaymentPhase.ORDER,
            amount=Money(totals.total_agorot),
            idempotency_key=f"order:{customer_id}:{idempotency_key}",
            metadata={"order_id": str(order.id), "order_number": order.order_number},
        )
        order.payment_id = payment.payment_id
        await self.orders.flush()
        return CheckoutResult(order=self._view(order), payment=payment)

    async def _existing_result(self, order: Order, fingerprint: str) -> CheckoutResult:
        if order.checkout_fingerprint != fingerprint:
            raise ApiError(
                status=409,
                code="IDEMPOTENCY_KEY_REUSED",
                title="Idempotency key was already used for another checkout",
            )
        if order.payment_id is None:
            raise ApiError(
                status=409,
                code="CHECKOUT_INCOMPLETE",
                title="Checkout is incomplete",
            )
        return CheckoutResult(
            order=self._view(order),
            payment=await self.payments.get_intent(order.payment_id),
        )

    async def _address_snapshot(
        self, customer_id: UUID, data: CheckoutRequest
    ) -> dict[str, object]:
        if data.address_id is not None:
            address = await self.orders.get_address(customer_id, data.address_id)
            if address is None:
                raise ApiError(status=404, code="ADDRESS_NOT_FOUND", title="Address not found")
            return {
                "recipient_name": address.recipient_name,
                "phone_e164": address.phone_e164,
                "street": address.street,
                "building": address.building,
                "apartment": address.apartment,
                "city": address.city,
                "postal_code": address.postal_code,
                "country": address.country,
            }
        assert data.address is not None
        snapshot = data.address.model_dump()
        snapshot["phone_e164"] = snapshot.pop("phone")
        return snapshot

    @staticmethod
    def _checkout_fingerprint(customer_id: UUID, data: CheckoutRequest) -> str:
        canonical = json.dumps(
            {"customer_id": str(customer_id), "request": data.model_dump(mode="json")},
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode()).hexdigest()

    @staticmethod
    def _view(order: Order) -> OrderView:
        address = order.address_snapshot
        return OrderView(
            id=order.id,
            order_number=order.order_number,
            state=order.state,
            items=tuple(
                OrderItemView(
                    id=item.id,
                    sku_id=item.sku_id,
                    product_id=item.product_id,
                    product_name_he=item.product_name_he,
                    sku_code=item.sku_code,
                    attributes=dict(item.attributes),
                    unit_price_agorot=item.unit_price_agorot,
                    quantity=item.quantity,
                    line_total_agorot=item.line_total_agorot,
                    currency="ILS",
                    machine_model_id=item.machine_model_id,
                )
                for item in order.items
            ),
            subtotal_agorot=order.subtotal_agorot,
            shipping_agorot=order.shipping_agorot,
            total_agorot=order.total_agorot,
            currency="ILS",
            address=OrderAddressView(
                recipient_name=str(address["recipient_name"]),
                phone_e164=str(address["phone_e164"]),
                street=str(address["street"]),
                building=str(address["building"]),
                apartment=(str(address["apartment"]) if address.get("apartment") else None),
                city=str(address["city"]),
                postal_code=(str(address["postal_code"]) if address.get("postal_code") else None),
                country="IL",
            ),
            payment_deadline=order.payment_deadline,
            history=tuple(
                OrderHistoryView(
                    from_state=entry.from_state,
                    to_state=entry.to_state,
                    source=entry.source,
                    reason=entry.reason,
                    created_at=entry.created_at,
                )
                for entry in order.history
            ),
            shipment=(
                ShipmentView(
                    carrier=order.shipment.carrier,
                    tracking_number=order.shipment.tracking_number,
                    tracking_url=order.shipment.tracking_url,
                    shipped_at=order.shipment.shipped_at,
                    delivered_at=order.shipment.delivered_at,
                )
                if order.shipment is not None
                else None
            ),
            allowed_actions=(),
            created_at=order.created_at,
        )


class OrderService:
    def __init__(
        self,
        orders: OrderRepository,
        inventory: InventoryService,
        *,
        clock: Clock,
        payments: PaymentService | None = None,
        machine_registrations: MachineRegistrationService | None = None,
    ) -> None:
        self.orders = orders
        self.inventory = inventory
        self.clock = clock
        self.payments = payments
        self.machine_registrations = machine_registrations

    async def get_for_customer(self, order_id: UUID, customer_id: UUID) -> OrderView:
        order = await self.orders.get_for_customer(order_id, customer_id)
        if order is None:
            raise ApiError(status=404, code="ORDER_NOT_FOUND", title="Order not found")
        return CheckoutService._view(order)

    async def list_for_customer(self, customer_id: UUID) -> list[OrderView]:
        orders = await self.orders.list_for_customer(customer_id)
        return [CheckoutService._view(order) for order in orders]

    async def process(self, order_id: UUID, admin_id: UUID) -> OrderView:
        order = await self._admin_order(order_id)
        await self._transition(order, OrderAction.PROCESS, actor_id=admin_id)
        return self._admin_view(order)

    async def cancel(
        self,
        order_id: UUID,
        admin_id: UUID,
        *,
        reason: str,
        confirm_order_number: str,
    ) -> OrderView:
        order = await self._admin_order(order_id)
        self._confirm_order_number(order, confirm_order_number)
        target = self._target(order, OrderAction.CANCEL)
        await self.inventory.release_order(order.id)
        await self.orders.transition(
            order,
            target,
            actor_id=admin_id,
            source="admin",
            reason=reason.strip(),
            occurred_at=self.clock.now(),
        )
        return self._admin_view(order)

    async def ship(
        self,
        order_id: UUID,
        admin_id: UUID,
        data: ShipOrderCommand,
    ) -> OrderView:
        order = await self._admin_order(order_id)
        target = self._target(order, OrderAction.SHIP)
        if order.shipment is not None:
            raise ApiError(
                status=409,
                code="SHIPMENT_ALREADY_EXISTS",
                title="Order already has a shipment",
            )
        await self.orders.create_shipment(
            order,
            carrier=data.carrier,
            tracking_number=data.tracking_number,
            tracking_url=data.tracking_url,
            shipped_at=self.clock.now(),
        )
        await self.orders.transition(
            order,
            target,
            actor_id=admin_id,
            source="admin",
            occurred_at=self.clock.now(),
        )
        return self._admin_view(order)

    async def deliver(self, order_id: UUID, admin_id: UUID) -> OrderView:
        order = await self._admin_order(order_id)
        target = self._target(order, OrderAction.DELIVER)
        if order.shipment is None:
            raise ApiError(status=409, code="SHIPMENT_NOT_FOUND", title="Shipment not found")
        order.shipment.delivered_at = self.clock.now()
        await self.orders.transition(
            order,
            target,
            actor_id=admin_id,
            source="admin",
            occurred_at=self.clock.now(),
        )
        return self._admin_view(order)

    async def request_refund(
        self,
        order_id: UUID,
        admin_id: UUID,
        *,
        reason: str,
        confirm_order_number: str,
        idempotency_key: str,
    ) -> RefundIntent:
        order = await self._admin_order(order_id)
        self._confirm_order_number(order, confirm_order_number)
        self._target(order, OrderAction.REFUND_CONFIRMED)
        if self.payments is None or order.payment_id is None:
            raise ApiError(status=409, code="PAYMENT_NOT_FOUND", title="Payment not found")
        return await self.payments.create_full_refund(
            payment_id=order.payment_id,
            requested_by=admin_id,
            reason=reason,
            idempotency_key=f"refund:{idempotency_key}",
        )

    async def handle_provider_event(self, payment: Payment, event: ProviderEvent) -> str | None:
        order = await self.orders.get(payment.owner_id, for_update=True)
        if order is None:
            return None
        if event.resource is ProviderResource.PAYMENT:
            return await self._handle_payment(order, event)
        if event.resource is ProviderResource.REFUND:
            return await self._handle_refund(order, event)
        return "ignored_unsupported"

    async def _handle_payment(self, order: Order, event: ProviderEvent) -> str | None:
        if event.state is ProviderState.FAILED:
            await self.orders.add_outbox_event(
                order,
                event_type="payment.order.failed",
                occurred_at=self.clock.now(),
            )
            return None
        if event.state is not ProviderState.CONFIRMED:
            return None
        if order.state is not OrderState.PENDING_PAYMENT:
            return "requires_reconciliation"
        if order.payment_deadline <= self.clock.now():
            return "requires_reconciliation"
        await self.inventory.consume_order(order.id)
        await self.orders.transition(
            order,
            next_order_state(order.state, OrderAction.PAYMENT_CONFIRMED),
            actor_id=None,
            source="provider",
            occurred_at=self.clock.now(),
        )
        if self.machine_registrations is not None:
            await self.machine_registrations.register_order_machines(order.id)
        return None

    async def _handle_refund(self, order: Order, event: ProviderEvent) -> str | None:
        if event.state is ProviderState.FAILED:
            await self.orders.add_outbox_event(
                order,
                event_type="payment.refund.failed",
                occurred_at=self.clock.now(),
            )
            return None
        if event.state is not ProviderState.CONFIRMED:
            return None
        try:
            target = next_order_state(order.state, OrderAction.REFUND_CONFIRMED)
        except OrderTransitionError:
            return "requires_reconciliation"
        await self.orders.transition(
            order,
            target,
            actor_id=None,
            source="provider",
            reason="Full refund confirmed",
            occurred_at=self.clock.now(),
        )
        return None

    async def _admin_order(self, order_id: UUID) -> Order:
        order = await self.orders.get(order_id, for_update=True)
        if order is None:
            raise ApiError(status=404, code="ORDER_NOT_FOUND", title="Order not found")
        return order

    async def _transition(self, order: Order, action: OrderAction, *, actor_id: UUID) -> None:
        target = self._target(order, action)
        await self.orders.transition(
            order,
            target,
            actor_id=actor_id,
            source="admin",
            occurred_at=self.clock.now(),
        )

    @staticmethod
    def _target(order: Order, action: OrderAction) -> OrderState:
        try:
            return next_order_state(order.state, action)
        except OrderTransitionError as exc:
            raise ApiError(
                status=409,
                code="INVALID_ORDER_TRANSITION",
                title="Order transition is not allowed",
            ) from exc

    @staticmethod
    def _confirm_order_number(order: Order, confirmation: str) -> None:
        if confirmation != order.order_number:
            raise ApiError(
                status=409,
                code="ORDER_CONFIRMATION_MISMATCH",
                title="Order confirmation does not match",
            )

    @staticmethod
    def _admin_view(order: Order) -> OrderView:
        return replace(
            CheckoutService._view(order),
            allowed_actions=tuple(sorted(allowed_admin_actions(order.state))),
        )
