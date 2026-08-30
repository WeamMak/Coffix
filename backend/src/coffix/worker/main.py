import asyncio
import signal

from coffix.core.clock import SystemClock
from coffix.core.database import create_database_engine, create_session_factory
from coffix.core.logging import configure_logging
from coffix.core.settings import Settings
from coffix.worker.expiration import run_expiration_loop


async def run_worker(settings: Settings) -> None:
    configure_logging(settings.log_level)
    engine = create_database_engine(settings)
    session_factory = create_session_factory(engine)
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for shutdown_signal in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(shutdown_signal, stop_event.set)

    try:
        await run_expiration_loop(
            session_factory,
            clock=SystemClock(),
            stop_event=stop_event,
        )
    finally:
        await engine.dispose()


def main() -> None:
    asyncio.run(run_worker(Settings()))


if __name__ == "__main__":
    main()
