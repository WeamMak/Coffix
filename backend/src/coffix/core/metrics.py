from collections import defaultdict
from dataclasses import dataclass, field
from time import monotonic

from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from coffix.inventory.service import InventoryMetricEvent


@dataclass(slots=True)
class MetricsRegistry:
    counters: dict[tuple[str, tuple[tuple[str, str], ...]], int] = field(
        default_factory=lambda: defaultdict(int)
    )
    observations: dict[tuple[str, tuple[tuple[str, str], ...]], list[float]] = field(
        default_factory=lambda: defaultdict(list)
    )

    def increment(self, name: str, *, labels: dict[str, str] | None = None) -> None:
        self.counters[(name, _labels(labels))] += 1

    def observe(
        self,
        name: str,
        value: float,
        *,
        labels: dict[str, str] | None = None,
    ) -> None:
        self.observations[(name, _labels(labels))].append(value)

    def record(self, event: InventoryMetricEvent) -> None:
        labels = {"kind": event.kind}
        if event.code is not None:
            labels["code"] = event.code
        self.increment("inventory_events_total", labels=labels)
        if event.quantity:
            self.observe("inventory_event_quantity", float(event.quantity), labels=labels)


class MetricsMiddleware:
    def __init__(self, app: ASGIApp, registry: MetricsRegistry) -> None:
        self.app = app
        self.registry = registry

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = monotonic()
        status_code = 500

        async def send_with_metrics(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = int(message["status"])
            await send(message)

        try:
            await self.app(scope, receive, send_with_metrics)
        finally:
            request = Request(scope)
            route = scope.get("route")
            route_path = getattr(route, "path", request.url.path)
            labels = {
                "method": request.method,
                "route": str(route_path),
                "status": str(status_code),
            }
            self.registry.increment("api_requests_total", labels=labels)
            self.registry.observe(
                "api_request_duration_seconds",
                monotonic() - started,
                labels=labels,
            )


def _labels(labels: dict[str, str] | None) -> tuple[tuple[str, str], ...]:
    return tuple(sorted((labels or {}).items()))
