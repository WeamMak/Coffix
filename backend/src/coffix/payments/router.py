from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.api.errors import ApiError
from coffix.core.database import get_session
from coffix.core.settings import AppEnvironment
from coffix.inventory.repository import InventoryRepository
from coffix.inventory.service import InventoryService
from coffix.orders.repository import OrderRepository
from coffix.orders.service import OrderService
from coffix.payments.adapters.fake import FakePaymentProvider
from coffix.payments.adapters.stripe import StripePaymentProvider
from coffix.payments.models import PaymentPhase
from coffix.payments.repository import PaymentRepository
from coffix.payments.schemas import FakeWebhookRequest, WebhookRead
from coffix.payments.service import PaymentService

SessionDep = Annotated[AsyncSession, Depends(get_session)]
StripeSignature = Annotated[str, Header(alias="Stripe-Signature")]

router = APIRouter(prefix="/api/v1", tags=["payments"])


def service_for(request: Request, session: AsyncSession) -> PaymentService:
    orders = OrderService(
        OrderRepository(session),
        InventoryService(InventoryRepository(session), clock=request.app.state.clock),
        clock=request.app.state.clock,
    )
    return PaymentService(
        PaymentRepository(session),
        request.app.state.payment_provider,
        clock=request.app.state.clock,
        handlers={PaymentPhase.ORDER: orders.handle_provider_event},
    )


@router.post("/webhooks/stripe", response_model=WebhookRead)
async def stripe_webhook(
    request: Request,
    signature: StripeSignature,
    session: SessionDep,
) -> WebhookRead:
    provider = request.app.state.payment_provider
    if not isinstance(provider, StripePaymentProvider):
        raise ApiError(
            status=503,
            code="STRIPE_NOT_CONFIGURED",
            title="Stripe webhook processing is not configured",
        )
    raw_body = await request.body()
    try:
        event = provider.verify_webhook(raw_body, signature)
    except ValueError as exc:
        raise ApiError(
            status=400,
            code="INVALID_WEBHOOK_SIGNATURE",
            title="Invalid webhook signature",
        ) from exc
    result = await service_for(request, session).process_event(event)
    return WebhookRead(result=result.result)


@router.post("/test/payments/webhooks", response_model=WebhookRead, include_in_schema=False)
async def fake_webhook(
    data: FakeWebhookRequest,
    request: Request,
    session: SessionDep,
) -> WebhookRead:
    if request.app.state.settings.app_env is not AppEnvironment.TEST:
        raise ApiError(status=404, code="NOT_FOUND", title="Resource not found")
    provider = request.app.state.payment_provider
    if not isinstance(provider, FakePaymentProvider):
        raise ApiError(
            status=409,
            code="FAKE_PAYMENT_PROVIDER_DISABLED",
            title="Fake payment provider is disabled",
        )
    event = provider.build_event(
        event_id=data.event_id,
        event_type=data.event_type,
        provider_object_id=data.provider_object_id,
        state=data.state,
    )
    result = await service_for(request, session).process_event(event)
    return WebhookRead(result=result.result)
