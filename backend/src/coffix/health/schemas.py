from typing import Literal

from pydantic import BaseModel, ConfigDict


class HealthSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LiveHealthRead(HealthSchema):
    status: Literal["live"] = "live"
    version: str


class HealthCheckRead(HealthSchema):
    status: Literal["ok", "failed"]
    detail: str | None = None
    latency_ms: float | None = None


class ReadinessRead(HealthSchema):
    status: Literal["ready", "not_ready"]
    version: str
    checks: dict[str, HealthCheckRead]
