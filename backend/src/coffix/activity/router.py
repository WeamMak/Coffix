from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.activity.repository import ActivityRepository
from coffix.activity.schemas import (
    ActiveOrderRead,
    ActiveServiceRequestRead,
    ActivitySummaryRead,
)
from coffix.api.errors import ApiError
from coffix.auth.policies import CustomerActorDep
from coffix.core.database import get_session

SessionDep = Annotated[AsyncSession, Depends(get_session)]

router = APIRouter(prefix="/api/v1/users/me", tags=["activity"])


@router.get("/activity-summary")
async def get_activity_summary(
    actor: CustomerActorDep,
    session: SessionDep,
) -> ActivitySummaryRead:
    summary = await ActivityRepository(session).get_summary(actor.user_id)
    if summary is None:
        raise ApiError(status=404, code="user_not_found", title="User not found")
    order = summary.active_order
    service_request = summary.active_service_request
    return ActivitySummaryRead(
        customer_id=summary.customer.id,
        display_name=summary.customer.display_name,
        active_order=(
            ActiveOrderRead(
                id=order.id,
                order_number=order.order_number,
                state=order.state,
            )
            if order is not None
            else None
        ),
        active_service_request=(
            ActiveServiceRequestRead(
                id=service_request.id,
                reference=service_request.reference,
                state=service_request.state,
            )
            if service_request is not None
            else None
        ),
    )
