from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.orders.models import Order, OrderState
from coffix.service.models import ServiceRequest, ServiceRequestState
from coffix.users.models import User

TERMINAL_ORDER_STATES = {
    OrderState.PAYMENT_EXPIRED,
    OrderState.CANCELLED,
    OrderState.DELIVERED,
    OrderState.REFUNDED,
}
TERMINAL_SERVICE_STATES = {
    ServiceRequestState.COMPLETED,
    ServiceRequestState.CANCELLED,
}


@dataclass(frozen=True, slots=True)
class ActivitySummary:
    customer: User
    active_order: Order | None
    active_service_request: ServiceRequest | None


class ActivityRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_summary(self, customer_id: UUID) -> ActivitySummary | None:
        customer = await self.session.get(User, customer_id)
        if customer is None:
            return None
        active_order = await self.session.scalar(
            select(Order)
            .where(
                Order.customer_id == customer_id,
                Order.state.not_in(TERMINAL_ORDER_STATES),
            )
            .order_by(Order.created_at.desc(), Order.id.desc())
            .limit(1)
        )
        active_service_request = await self.session.scalar(
            select(ServiceRequest)
            .where(
                ServiceRequest.customer_id == customer_id,
                ServiceRequest.state.not_in(TERMINAL_SERVICE_STATES),
            )
            .order_by(ServiceRequest.created_at.desc(), ServiceRequest.id.desc())
            .limit(1)
        )
        return ActivitySummary(
            customer=customer,
            active_order=active_order,
            active_service_request=active_service_request,
        )
