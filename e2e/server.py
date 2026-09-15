"""Test-only entrypoint. The deployed API never imports this module."""

import asyncio
import hmac
import os
import re
import shutil
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated
from uuid import NAMESPACE_URL, uuid5

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.engine import make_url

from coffix.api.app import create_app
from coffix.api.errors import ApiError
from coffix.auth.adapters.fake import FakeOtpProvider
from coffix.core.clock import FakeClock
from coffix.core.database import Base, CommandSessionDep
from coffix.core.settings import Settings
from coffix.media.store import create_media_store
from coffix.notifications.adapters.fake import FakePushProvider
from coffix.notifications.providers import PushResult, PushResultStatus
from coffix.payments.adapters.fake import FakePaymentProvider
from coffix.payments.router import service_for
from coffix.service.intake_config import default_intake_settings
from coffix.service.models import ServiceIntakeSettings
from coffix.shop.bootstrap import initialize_shop_settings
from coffix.users.models import Role, User
from coffix.worker.expiration import run_expiration_pass
from coffix.worker.notifications import run_notification_delivery_pass
from coffix.worker.outbox import run_outbox_pass

START = datetime(2026, 1, 5, 10, tzinfo=UTC)


class Advance(BaseModel):
    seconds: int = Field(ge=0, le=604800)


class PushOutcome(BaseModel):
    device_token: str = Field(min_length=1, max_length=4096)
    status: PushResultStatus


def create_e2e_app(settings: Settings | None = None):
    settings = settings or Settings(_env_file=None)
    run_id = os.environ.get("COFFIX_E2E_RUN_ID", "")
    database = make_url(settings.database_url)
    redis = make_url(settings.redis_url)
    media_root = Path(settings.media_local_root).resolve()
    if (
        not re.fullmatch(r"[a-f0-9]{16}", run_id)
        or database.database != f"coffix_e2e_{run_id}"
        or media_root != Path(f"/tmp/coffix-e2e-{run_id}/media")
        or settings.e2e_control_secret is None
        or settings.app_env != "test"
        or database.username != "coffix_e2e"
        or database.host != "127.0.0.1"
        or redis.host != "127.0.0.1"
        or redis.password != settings.e2e_control_secret.get_secret_value()
    ):
        raise ValueError("E2E runner requires isolated database, media and secret")
    secret = settings.e2e_control_secret.get_secret_value()
    otp_code = settings.otp_dev_code
    assert otp_code is not None
    app = create_app(settings)
    clock = FakeClock(START)
    lock = asyncio.Lock()
    original_lifespan = app.router.lifespan_context

    async def reset_data():
        async with app.state.database_engine.begin() as connection:
            tables = ", ".join(f'"{name}"' for name in Base.metadata.tables)
            await connection.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        await app.state.redis.flushdb()
        if media_root.exists():
            await asyncio.to_thread(shutil.rmtree, media_root)
        media_root.mkdir(parents=True, exist_ok=True)
        clock.current = START
        app.state.push_provider = FakePushProvider()
        app.state.otp_provider = FakeOtpProvider(otp_code)
        async with app.state.session_factory() as session, session.begin():
            await initialize_shop_settings(session, settings)
            session.add(
                ServiceIntakeSettings(
                    id=1,
                    version=1,
                    settings=default_intake_settings().model_dump(mode="json", exclude={"version"}),
                )
            )
            for index, role in enumerate((Role.ADMIN, Role.TECHNICIAN, Role.CUSTOMER), 1):
                session.add(
                    User(
                        id=uuid5(NAMESPACE_URL, f"coffix-e2e/{role}"),
                        phone_e164=f"+97250000000{index}",
                        role=role,
                        display_name={
                            Role.ADMIN: "מנהלת בדיקה",
                            Role.TECHNICIAN: "טכנאי בדיקה",
                            Role.CUSTOMER: "לקוח בדיקה",
                        }[role],
                        is_active=True,
                        created_at=START,
                        updated_at=START,
                    )
                )
        return {"now": clock.now().isoformat(), "seed": "coffix-e2e-v1"}

    @asynccontextmanager
    async def lifespan(application):
        async with original_lifespan(application):
            app.state.clock = clock
            app.state.media_store = await create_media_store(settings, clock)
            app.state.payment_provider = FakePaymentProvider(signing_secret=secret)
            await reset_data()
            yield

    app.router.lifespan_context = lifespan

    async def authorize(x_e2e_secret: Annotated[str | None, Header()] = None):
        if not hmac.compare_digest(x_e2e_secret or "", secret):
            raise ApiError(status=403, code="E2E_FORBIDDEN", title="Test control denied")

    router = APIRouter(
        prefix="/api/v1/__e2e",
        dependencies=[Depends(authorize)],
        include_in_schema=False,
    )

    @router.post("/reset")
    async def reset():
        async with lock:
            return await reset_data()

    @router.get("/clock")
    async def read_clock():
        return {"now": clock.now().isoformat()}

    @router.post("/clock")
    async def advance(data: Advance):
        async with lock:
            clock.advance(timedelta(seconds=data.seconds))
            return {"now": clock.now().isoformat()}

    @router.post("/payments")
    async def payment(
        request: Request,
        session: CommandSessionDep,
        signature: Annotated[str, Header(alias="Stripe-Signature")],
    ):
        try:
            event = app.state.payment_provider.verify_webhook(await request.body(), signature)
            parts = dict(part.split("=", 1) for part in signature.split(","))
            timestamp = int(parts["t"])
            if abs(clock.now().timestamp() - timestamp) > 300:
                raise ValueError("stale signature")
        except (ValueError, KeyError, TypeError) as exc:
            raise ApiError(
                status=400, code="INVALID_WEBHOOK_SIGNATURE", title="Invalid signature"
            ) from exc
        result = await service_for(request, session).process_event(event)
        return {"result": result.result}

    @router.post("/push")
    async def push(data: PushOutcome):
        app.state.push_provider.queue_result(data.device_token, PushResult(status=data.status))
        return {"queued": True}

    @router.post("/workers")
    async def workers():
        async with lock:
            factory = app.state.session_factory
            expiration = await run_expiration_pass(factory, clock=clock, batch_size=1000)
            outbox = await run_outbox_pass(factory, clock=clock, batch_size=1000)
            delivery = await run_notification_delivery_pass(
                factory, clock=clock, provider=app.state.push_provider, batch_size=1000
            )
            return {"expiration": expiration, "outbox": outbox, "delivery": delivery}

    app.include_router(router)
    return app
