import re
from uuid import uuid4

from starlette.datastructures import MutableHeaders
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from coffix.core.logging import correlation_id_context

CORRELATION_HEADER = "X-Correlation-ID"
CORRELATION_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")


class CorrelationIdMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        supplied_id = request.headers.get(CORRELATION_HEADER, "")
        correlation_id = (
            supplied_id if CORRELATION_PATTERN.fullmatch(supplied_id) else str(uuid4())
        )
        scope.setdefault("state", {})["correlation_id"] = correlation_id

        async def send_with_correlation_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers[CORRELATION_HEADER] = correlation_id
            await send(message)

        token = correlation_id_context.set(correlation_id)
        try:
            await self.app(scope, receive, send_with_correlation_id)
        finally:
            correlation_id_context.reset(token)
