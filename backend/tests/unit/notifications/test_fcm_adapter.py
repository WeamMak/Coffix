from uuid import uuid4

import httpx
import pytest

from coffix.notifications.adapters.fcm import FcmPushProvider
from coffix.notifications.providers import PushMessage, PushResultStatus


class StaticAccessTokenProvider:
    async def get_access_token(self) -> str:
        return "test-access-token"


def message() -> PushMessage:
    return PushMessage(
        delivery_id=uuid4(),
        notification_id=uuid4(),
        device_token="secret-device-token",
        title="עדכון",
        body="יש עדכון חדש.",
        data={"type": "order.shipped"},
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status_code", "response_json", "expected"),
    [
        (200, {"name": "projects/coffix/messages/message-1"}, PushResultStatus.SENT),
        (
            404,
            {
                "error": {
                    "status": "NOT_FOUND",
                    "details": [
                        {
                            "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
                            "errorCode": "UNREGISTERED",
                        }
                    ],
                }
            },
            PushResultStatus.INVALID_TOKEN,
        ),
        (503, {"error": {"status": "UNAVAILABLE"}}, PushResultStatus.RETRYABLE_FAILURE),
    ],
)
async def test_fcm_adapter_maps_provider_results_without_exposing_token(
    status_code: int,
    response_json: dict[str, object],
    expected: PushResultStatus,
) -> None:
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(status_code, json=response_json)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await FcmPushProvider(
            project_id="coffix-test",
            access_token_provider=StaticAccessTokenProvider(),
            client=client,
        ).send(message())

    assert result.status is expected
    assert captured[0].headers["authorization"] == "Bearer test-access-token"
    assert captured[0].url.path == "/v1/projects/coffix-test/messages:send"
