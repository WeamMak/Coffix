from urllib.parse import parse_qs

import httpx
import pytest

from coffix.auth.adapters.twilio import TwilioOtpProvider


@pytest.mark.asyncio
async def test_twilio_verify_adapter_contract_without_network() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/Verifications"):
            return httpx.Response(201, json={"sid": "VE123", "status": "pending"})
        return httpx.Response(200, json={"sid": "VE123", "status": "approved"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        provider = TwilioOtpProvider(
            account_sid="AC123",
            auth_token="secret",
            verify_service_sid="VA123",
            client=client,
        )

        verification_id = await provider.request_code("+972501234567")
        approved = await provider.verify_code("+972501234567", "123456")

    request_form = parse_qs(requests[0].content.decode())
    check_form = parse_qs(requests[1].content.decode())
    assert verification_id == "VE123"
    assert approved is True
    assert requests[0].url == httpx.URL(
        "https://verify.twilio.com/v2/Services/VA123/Verifications"
    )
    assert requests[1].url == httpx.URL(
        "https://verify.twilio.com/v2/Services/VA123/VerificationCheck"
    )
    assert requests[0].headers["authorization"].startswith("Basic ")
    assert request_form == {"To": ["+972501234567"], "Channel": ["sms"]}
    assert check_form == {"To": ["+972501234567"], "Code": ["123456"]}


@pytest.mark.asyncio
async def test_twilio_adapter_maps_unapproved_check_to_false() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(200, json={"status": "pending"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        provider = TwilioOtpProvider(
            account_sid="AC123",
            auth_token="secret",
            verify_service_sid="VA123",
            client=client,
        )
        assert await provider.verify_code("+972501234567", "000000") is False
