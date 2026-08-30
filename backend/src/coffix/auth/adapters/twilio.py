import httpx


class TwilioOtpProvider:
    base_url = "https://verify.twilio.com/v2"

    def __init__(
        self,
        *,
        account_sid: str,
        auth_token: str,
        verify_service_sid: str,
        client: httpx.AsyncClient,
    ) -> None:
        self.auth = httpx.BasicAuth(account_sid, auth_token)
        self.verify_service_sid = verify_service_sid
        self.client = client

    @property
    def service_url(self) -> str:
        return f"{self.base_url}/Services/{self.verify_service_sid}"

    async def request_code(self, phone_e164: str) -> str:
        response = await self.client.post(
            f"{self.service_url}/Verifications",
            data={"To": phone_e164, "Channel": "sms"},
            auth=self.auth,
        )
        response.raise_for_status()
        return str(response.json()["sid"])

    async def verify_code(self, phone_e164: str, code: str) -> bool:
        response = await self.client.post(
            f"{self.service_url}/VerificationCheck",
            data={"To": phone_e164, "Code": code},
            auth=self.auth,
        )
        response.raise_for_status()
        return response.json().get("status") == "approved"
