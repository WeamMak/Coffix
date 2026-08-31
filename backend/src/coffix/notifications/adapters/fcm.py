import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Protocol

import httpx
import jwt

from coffix.core.clock import Clock, SystemClock
from coffix.notifications.providers import (
    PushMessage,
    PushResult,
    PushResultStatus,
)

FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token"


class AccessTokenProvider(Protocol):
    async def get_access_token(self) -> str: ...


@dataclass(slots=True)
class ServiceAccountAccessTokenProvider:
    credentials_path: str
    client: httpx.AsyncClient
    clock: Clock
    _access_token: str | None = None
    _expires_at: datetime | None = None

    async def get_access_token(self) -> str:
        now = self.clock.now()
        if (
            self._access_token is not None
            and self._expires_at is not None
            and self._expires_at > now + timedelta(minutes=1)
        ):
            return self._access_token
        credentials = self._credentials()
        token_uri = str(credentials.get("token_uri") or DEFAULT_TOKEN_URI)
        assertion = jwt.encode(
            {
                "iss": credentials["client_email"],
                "sub": credentials["client_email"],
                "aud": token_uri,
                "scope": FCM_SCOPE,
                "iat": int(now.timestamp()),
                "exp": int((now + timedelta(hours=1)).timestamp()),
            },
            str(credentials["private_key"]),
            algorithm="RS256",
        )
        response = await self.client.post(
            token_uri,
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": assertion,
            },
        )
        response.raise_for_status()
        body = response.json()
        access_token = body.get("access_token")
        if not isinstance(access_token, str) or not access_token:
            raise RuntimeError("Google OAuth response did not include an access token")
        expires_in = body.get("expires_in", 3600)
        if not isinstance(expires_in, int) or expires_in <= 0:
            expires_in = 3600
        self._access_token = access_token
        self._expires_at = now + timedelta(seconds=expires_in)
        return access_token

    def _credentials(self) -> dict[str, Any]:
        try:
            value = json.loads(Path(self.credentials_path).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise RuntimeError("FCM service-account credentials could not be loaded") from exc
        if not isinstance(value, dict) or not all(
            isinstance(value.get(field), str) and value[field]
            for field in ("client_email", "private_key")
        ):
            raise RuntimeError("FCM service-account credentials are invalid")
        return value


class FcmPushProvider:
    name = "fcm"
    base_url = "https://fcm.googleapis.com"

    def __init__(
        self,
        *,
        project_id: str,
        access_token_provider: AccessTokenProvider | None = None,
        credentials_path: str | None = None,
        client: httpx.AsyncClient | None = None,
        clock: Clock | None = None,
    ) -> None:
        self.project_id = project_id
        self.client = client
        if access_token_provider is not None:
            self.access_token_provider = access_token_provider
        else:
            if credentials_path is None or client is None:
                raise ValueError("FCM credentials path and HTTP client are required")
            self.access_token_provider = ServiceAccountAccessTokenProvider(
                credentials_path=credentials_path,
                client=client,
                clock=clock or SystemClock(),
            )

    async def send(self, message: PushMessage) -> PushResult:
        if self.client is None:
            raise RuntimeError("FCM HTTP client is not configured")
        access_token = await self.access_token_provider.get_access_token()
        response = await self.client.post(
            f"{self.base_url}/v1/projects/{self.project_id}/messages:send",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "message": {
                    "token": message.device_token,
                    "notification": {"title": message.title, "body": message.body},
                    "data": message.data,
                    "android": {"collapse_key": message.idempotency_key},
                    "apns": {"headers": {"apns-collapse-id": str(message.delivery_id)}},
                }
            },
        )
        body = self._response_json(response)
        if response.is_success:
            provider_message_id = body.get("name")
            if not isinstance(provider_message_id, str):
                return PushResult(
                    status=PushResultStatus.RETRYABLE_FAILURE,
                    error_code="MALFORMED_RESPONSE",
                )
            return PushResult(
                status=PushResultStatus.SENT,
                provider_message_id=provider_message_id,
            )
        error_code = self._fcm_error_code(body) or f"HTTP_{response.status_code}"
        if error_code in {"UNREGISTERED", "SENDER_ID_MISMATCH"}:
            return PushResult(
                status=PushResultStatus.INVALID_TOKEN,
                error_code=error_code,
            )
        return PushResult(
            status=PushResultStatus.RETRYABLE_FAILURE,
            error_code=error_code,
        )

    @staticmethod
    def _response_json(response: httpx.Response) -> dict[str, Any]:
        try:
            body = response.json()
        except ValueError:
            return {}
        return body if isinstance(body, dict) else {}

    @staticmethod
    def _fcm_error_code(body: dict[str, Any]) -> str | None:
        error = body.get("error")
        if not isinstance(error, dict):
            return None
        details = error.get("details")
        if isinstance(details, list):
            for detail in details:
                if isinstance(detail, dict) and isinstance(detail.get("errorCode"), str):
                    return str(detail["errorCode"])
        status = error.get("status")
        return str(status) if isinstance(status, str) else None
