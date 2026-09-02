from uuid import UUID

from pydantic import BaseModel, ConfigDict

from coffix.orders.models import OrderState
from coffix.service.models import ServiceRequestState


class ActivitySchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ActiveOrderRead(ActivitySchema):
    id: UUID
    order_number: str
    state: OrderState


class ActiveServiceRequestRead(ActivitySchema):
    id: UUID
    reference: str
    state: ServiceRequestState


class ActivitySummaryRead(ActivitySchema):
    customer_id: UUID
    display_name: str | None
    active_order: ActiveOrderRead | None
    active_service_request: ActiveServiceRequestRead | None
