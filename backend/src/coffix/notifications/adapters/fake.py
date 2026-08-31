from collections import defaultdict, deque

from coffix.notifications.providers import (
    PushMessage,
    PushResult,
    PushResultStatus,
)


class FakePushProvider:
    name = "fake"

    def __init__(self) -> None:
        self.messages: list[PushMessage] = []
        self._queued: dict[str, deque[PushResult]] = defaultdict(deque)
        self._successful_results: dict[str, PushResult] = {}

    def queue_result(self, device_token: str, result: PushResult) -> None:
        self._queued[device_token].append(result)

    async def send(self, message: PushMessage) -> PushResult:
        cached = self._successful_results.get(message.idempotency_key)
        if cached is not None:
            return cached
        self.messages.append(message)
        queued = self._queued[message.device_token]
        result = (
            queued.popleft()
            if queued
            else PushResult(
                status=PushResultStatus.SENT,
                provider_message_id=f"fake_push_{message.delivery_id.hex}",
            )
        )
        if result.status in {PushResultStatus.SENT, PushResultStatus.INVALID_TOKEN}:
            self._successful_results[message.idempotency_key] = result
        return result
