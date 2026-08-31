from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Path, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.auth.policies import AdminActorDep, CustomerActorDep
from coffix.carts.repository import CartRepository
from coffix.core.database import get_session
from coffix.inventory.repository import InventoryRepository
from coffix.inventory.service import InventoryService
from coffix.orders.repository import OrderRepository
from coffix.orders.schemas import (
    CheckoutRead,
    CheckoutRequest,
    ConfirmedReasonCommand,
    OrderRead,
    RefundRead,
    ShipOrderCommand,
)
from coffix.orders.service import CheckoutService, OrderService
from coffix.payments.repository import PaymentRepository
from coffix.payments.service import PaymentService

SessionDep = Annotated[AsyncSession, Depends(get_session)]
IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=255)]
OrderIdPath = Annotated[UUID, Path()]

router = APIRouter(prefix="/api/v1", tags=["orders"])


def inventory_for(request: Request, session: AsyncSession) -> InventoryService:
    return InventoryService(
        InventoryRepository(session),
        clock=request.app.state.clock,
        metrics=request.app.state.metrics,
    )


def checkout_service_for(request: Request, session: AsyncSession) -> CheckoutService:
    return CheckoutService(
        OrderRepository(session),
        CartRepository(session),
        inventory_for(request, session),
        PaymentService(
            PaymentRepository(session),
            request.app.state.payment_provider,
            clock=request.app.state.clock,
        ),
        clock=request.app.state.clock,
        id_generator=request.app.state.id_generator,
        shipping_fee_agorot=request.app.state.settings.shipping_fee_agorot,
        payment_ttl_seconds=request.app.state.settings.order_payment_ttl_seconds,
    )


def order_service_for(request: Request, session: AsyncSession) -> OrderService:
    payments = PaymentService(
        PaymentRepository(session),
        request.app.state.payment_provider,
        clock=request.app.state.clock,
    )
    return OrderService(
        OrderRepository(session),
        inventory_for(request, session),
        clock=request.app.state.clock,
        payments=payments,
    )


@router.post("/checkout", response_model=CheckoutRead, status_code=status.HTTP_201_CREATED)
async def checkout(
    data: CheckoutRequest,
    idempotency_key: IdempotencyKey,
    actor: CustomerActorDep,
    request: Request,
    session: SessionDep,
) -> CheckoutRead:
    result = await checkout_service_for(request, session).checkout(
        actor.user_id,
        data,
        idempotency_key=idempotency_key,
    )
    return CheckoutRead.model_validate(result)


@router.get("/orders", response_model=list[OrderRead])
async def list_orders(
    actor: CustomerActorDep,
    request: Request,
    session: SessionDep,
) -> list[OrderRead]:
    orders = await order_service_for(request, session).list_for_customer(actor.user_id)
    return [OrderRead.model_validate(order) for order in orders]


@router.get("/orders/{order_id}", response_model=OrderRead)
async def get_order(
    order_id: OrderIdPath,
    actor: CustomerActorDep,
    request: Request,
    session: SessionDep,
) -> OrderRead:
    order = await order_service_for(request, session).get_for_customer(order_id, actor.user_id)
    return OrderRead.model_validate(order)


@router.post("/admin/orders/{order_id}/process", response_model=OrderRead)
async def process_order(
    order_id: OrderIdPath,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> OrderRead:
    order = await order_service_for(request, session).process(order_id, actor.user_id)
    return OrderRead.model_validate(order)


@router.post("/admin/orders/{order_id}/cancel", response_model=OrderRead)
async def cancel_order(
    order_id: OrderIdPath,
    data: ConfirmedReasonCommand,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> OrderRead:
    order = await order_service_for(request, session).cancel(
        order_id,
        actor.user_id,
        reason=data.reason,
        confirm_order_number=data.confirm_order_number,
    )
    return OrderRead.model_validate(order)


@router.post("/admin/orders/{order_id}/ship", response_model=OrderRead)
async def ship_order(
    order_id: OrderIdPath,
    data: ShipOrderCommand,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> OrderRead:
    order = await order_service_for(request, session).ship(order_id, actor.user_id, data)
    return OrderRead.model_validate(order)


@router.post("/admin/orders/{order_id}/deliver", response_model=OrderRead)
async def deliver_order(
    order_id: OrderIdPath,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> OrderRead:
    order = await order_service_for(request, session).deliver(order_id, actor.user_id)
    return OrderRead.model_validate(order)


@router.post(
    "/admin/orders/{order_id}/refund",
    response_model=RefundRead,
    status_code=status.HTTP_202_ACCEPTED,
)
async def refund_order(
    order_id: OrderIdPath,
    data: ConfirmedReasonCommand,
    idempotency_key: IdempotencyKey,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> RefundRead:
    refund = await order_service_for(request, session).request_refund(
        order_id,
        actor.user_id,
        reason=data.reason,
        confirm_order_number=data.confirm_order_number,
        idempotency_key=idempotency_key,
    )
    return RefundRead.model_validate(refund)
