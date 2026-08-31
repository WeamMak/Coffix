from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, Strict

from coffix.payments.providers import ProviderState

StrictPositiveInt = Annotated[int, Strict(), Field(gt=0)]


class PaymentAmount(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount_agorot: StrictPositiveInt
    currency: str = Field(default="ILS", pattern="^ILS$")


class FakeWebhookRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str = Field(min_length=1, max_length=255)
    event_type: str = Field(min_length=1, max_length=255)
    provider_object_id: str = Field(min_length=1, max_length=255)
    state: ProviderState


class WebhookRead(BaseModel):
    result: str
