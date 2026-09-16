"""Disposable worker process for crash/restart drills; never a deployed entrypoint."""

import asyncio
import json
import sys
from dataclasses import asdict
from datetime import datetime

from e2e.server import create_e2e_app

from coffix.core.clock import FakeClock
from coffix.core.database import create_database_engine, create_session_factory
from coffix.core.settings import Settings
from coffix.notifications.repository import OutboxRepository
from coffix.worker.expiration import run_expiration_pass
from coffix.worker.outbox import OUTBOX_LEASE, run_outbox_pass


async def main():
    settings = Settings(_env_file=None)
    create_e2e_app(settings)  # Enforce the exact same run/database/media/Redis guards.
    clock = FakeClock(datetime.fromisoformat(sys.argv[2]))
    engine = create_database_engine(settings)
    factory = create_session_factory(engine)
    try:
        if sys.argv[1] == "claim":
            async with factory() as session, session.begin():
                ids = await OutboxRepository(session).claim_batch(
                    now=clock.now(), batch_size=100, lease_timeout=OUTBOX_LEASE
                )
            # Readiness marker is emitted only AFTER the claim transaction commits.
            print(json.dumps({"claimed": len(ids)}), flush=True)
            await asyncio.Event().wait()
        elif sys.argv[1] == "outbox":
            result = await run_outbox_pass(factory, clock=clock, batch_size=100)
            print(json.dumps(asdict(result)), flush=True)
        elif sys.argv[1] == "expiration":
            result = await run_expiration_pass(factory, clock=clock, batch_size=5)
            print(json.dumps(asdict(result)), flush=True)
        else:
            raise ValueError("Unknown worker drill")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
