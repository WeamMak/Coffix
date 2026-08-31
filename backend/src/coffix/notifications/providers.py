from dataclasses import dataclass, field
from enum import StrEnum
from typing import Protocol
from uuid import UUID


class PushResultStatus(StrEnum):
    SENT = "sent"
    RETRYABLE_FAILURE = "retryable_failure"
    INVALID_TOKEN = "invalid_token"


@dataclass(frozen=True, slots=True)
class PushMessage:
    delivery_id: UUID
    notification_id: UUID
    device_token: str
    title: str
    body: str
    data: dict[str, str] = field(default_factory=dict)

    @property
    def idempotency_key(self) -> str:
        return f"notification-delivery:{self.delivery_id}"


@dataclass(frozen=True, slots=True)
class PushResult:
    status: PushResultStatus
    provider_message_id: str | None = None
    error_code: str | None = None


class PushProvider(Protocol):
    async def send(self, message: PushMessage) -> PushResult: ...
