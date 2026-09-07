"""Versioned intake choices and Israel-local preferred windows."""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.api.errors import ApiError
from coffix.service.models import ServiceIntakeSettings
from coffix.service.schemas import IntakeSettings, IntakeSlot, PreferredWindowInput, UrgencyOption


def default_intake_settings() -> IntakeSettings:
    return IntakeSettings(
        urgencies=[
            UrgencyOption(
                id="normal", name_he="רגיל", description_he="תוך 3–5 ימי עסקים", surcharge_percent=0
            ),
            UrgencyOption(
                id="urgent", name_he="דחוף", description_he="תוך 24 שעות", surcharge_percent=30
            ),
        ],
        weekdays=[0, 1, 2, 3, 6],
        slots=[IntakeSlot(start="08:00", end="12:00"), IntakeSlot(start="12:00", end="17:00")],
    )


async def read_settings(session: AsyncSession) -> IntakeSettings:
    row = await session.get(ServiceIntakeSettings, 1)
    if row is None:
        raise RuntimeError("Service intake settings have not been migrated")
    return IntakeSettings(version=row.version, **row.settings)


async def update_settings(session: AsyncSession, data: IntakeSettings) -> IntakeSettings:
    row = await session.scalar(
        select(ServiceIntakeSettings).where(ServiceIntakeSettings.id == 1).with_for_update()
    )
    if row is None:
        raise RuntimeError("Service intake settings have not been migrated")
    if row.version != data.version:
        raise ApiError(
            status=409,
            code="SERVICE_INTAKE_VERSION_CONFLICT",
            title="Intake settings changed; reload before saving",
        )
    row.settings = data.model_dump(mode="json", exclude={"version"})
    row.version += 1
    await session.flush()
    return IntakeSettings(version=row.version, **row.settings)


def preferred_windows(settings: IntakeSettings, now: datetime) -> list[PreferredWindowInput]:
    zone = ZoneInfo("Asia/Jerusalem")
    today = now.astimezone(zone).date()
    windows = []
    for offset in range(settings.horizon_days):
        day = today + timedelta(days=offset)
        if day.weekday() not in settings.weekdays:
            continue
        for slot in sorted(settings.slots, key=lambda item: item.start):
            start = datetime.combine(day, time.fromisoformat(slot.start), zone)
            end = datetime.combine(day, time.fromisoformat(slot.end), zone)
            if start > now:
                windows.append(PreferredWindowInput(start=start, end=end))
    return windows


def with_urgency(base_agorot: int, percent: int) -> int:
    # Integer half-up rounding; never floats or client-calculated charges.
    return (base_agorot * (100 + percent) + 50) // 100
