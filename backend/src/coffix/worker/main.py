import asyncio
import signal

import httpx

from coffix.core.clock import SystemClock
from coffix.core.database import create_database_engine, create_session_factory
from coffix.core.logging import configure_logging
from coffix.core.redis import create_redis_client
from coffix.core.settings import PushProvider as PushProviderMode
from coffix.core.settings import Settings
from coffix.health.checks import WorkerHealthReporter
from coffix.media.service import run_media_cleanup_loop
from coffix.media.store import create_media_store
from coffix.notifications.adapters.fake import FakePushProvider
from coffix.notifications.adapters.fcm import FcmPushProvider
from coffix.worker.expiration import run_expiration_loop
from coffix.worker.notifications import run_notification_delivery_loop
from coffix.worker.outbox import run_outbox_loop


async def run_worker(settings: Settings) -> None:
    configure_logging(settings.log_level)
    engine = create_database_engine(settings)
    session_factory = create_session_factory(engine)
    clock = SystemClock()
    media_store = await create_media_store(settings, clock)
    redis_client = create_redis_client(settings)
    health_reporter = WorkerHealthReporter(redis_client, clock)
    push_client: httpx.AsyncClient | None = None
    if settings.push_provider is PushProviderMode.FAKE:
        push_provider = FakePushProvider()
    else:
        project_id = settings.fcm_project_id
        credentials_path = settings.google_application_credentials
        if project_id is None or credentials_path is None:
            raise RuntimeError("FCM push provider is not configured")
        push_client = httpx.AsyncClient(timeout=10.0)
        push_provider = FcmPushProvider(
            project_id=project_id,
            credentials_path=credentials_path,
            client=push_client,
            clock=clock,
        )
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for shutdown_signal in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(shutdown_signal, stop_event.set)

    try:
        await asyncio.gather(
            run_expiration_loop(
                session_factory,
                clock=clock,
                stop_event=stop_event,
                on_pass=lambda summary: health_reporter.record_expiration(),
            ),
            run_media_cleanup_loop(
                session_factory,
                store=media_store,
                clock=clock,
                stop_event=stop_event,
            ),
            run_outbox_loop(
                session_factory,
                clock=clock,
                stop_event=stop_event,
            ),
            run_notification_delivery_loop(
                session_factory,
                provider=push_provider,
                clock=clock,
                stop_event=stop_event,
            ),
            health_reporter.run(stop_event),
        )
    finally:
        if push_client is not None:
            await push_client.aclose()
        await redis_client.aclose()
        await engine.dispose()


def main() -> None:
    asyncio.run(run_worker(Settings()))


if __name__ == "__main__":
    main()
