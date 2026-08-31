import calendar
import re
import unicodedata
from dataclasses import dataclass
from datetime import date
from typing import Protocol
from uuid import UUID

from coffix.api.errors import ApiError
from coffix.core.clock import Clock
from coffix.core.types import MachineId, OrderId
from coffix.machines.models import MachineModel, RegisteredMachine
from coffix.machines.repository import MachineRepository
from coffix.machines.schemas import (
    MachineCreate,
    MachineSerialUpdate,
    MachineServiceHistoryRead,
)
from coffix.media.models import MediaObject
from coffix.media.store import MediaPurpose
from coffix.orders.models import OrderState


def normalize_machine_serial(raw_serial: str) -> str:
    normalized = unicodedata.normalize("NFKC", raw_serial)
    normalized = "".join(normalized.split()).upper()
    if not normalized or len(normalized) > 160:
        raise ValueError("machine serial must contain between 1 and 160 characters")
    return normalized


class CustomerMachineStore(Protocol):
    async def get_active_model(self, model_id: UUID) -> MachineModel | None: ...

    async def get_model(self, model_id: UUID) -> MachineModel | None: ...

    async def lock_serial(self, machine_model_id: UUID, serial_number: str) -> None: ...

    async def get_by_model_serial(
        self,
        machine_model_id: UUID,
        serial_number: str,
    ) -> RegisteredMachine | None: ...

    async def create_manual_registration(
        self,
        *,
        customer_id: UUID,
        machine_model_id: UUID,
        serial_number: str,
        purchase_date: date | None,
    ) -> RegisteredMachine: ...

    async def get_for_customer_for_update(
        self,
        machine_id: UUID,
        customer_id: UUID,
    ) -> RegisteredMachine | None: ...

    async def assign_serial(
        self,
        machine: RegisteredMachine,
        serial_number: str,
    ) -> RegisteredMachine: ...

    async def list_for_customer_with_models(
        self,
        customer_id: UUID,
    ) -> list[tuple[RegisteredMachine, MachineModel]]: ...

    async def get_for_customer_with_model(
        self,
        machine_id: UUID,
        customer_id: UUID,
    ) -> tuple[RegisteredMachine, MachineModel] | None: ...


class MachineMediaStore(Protocol):
    async def get_registration_media_for_update(self, media_id: UUID) -> MediaObject | None: ...

    async def attach_to_collection(self, media: MediaObject, collection_id: UUID) -> None: ...

    async def list_machine_registration_media(
        self,
        *,
        owner_id: UUID,
        collection_ids: list[UUID],
    ) -> dict[UUID, list[UUID]]: ...


@dataclass(frozen=True, slots=True)
class MachineView:
    machine: RegisteredMachine
    model: MachineModel
    media_ids: tuple[UUID, ...] = ()
    service_history: tuple[MachineServiceHistoryRead, ...] = ()


class CustomerMachineService:
    def __init__(
        self,
        machines: CustomerMachineStore,
        media: MachineMediaStore,
    ) -> None:
        self.machines = machines
        self.media = media

    async def list_owned(self, customer_id: UUID) -> list[MachineView]:
        rows = await self.machines.list_for_customer_with_models(customer_id)
        media = await self.media.list_machine_registration_media(
            owner_id=customer_id,
            collection_ids=[machine.id for machine, _ in rows],
        )
        return [
            MachineView(
                machine=machine,
                model=model,
                media_ids=tuple(media.get(machine.id, ())),
            )
            for machine, model in rows
        ]

    async def get_owned(self, customer_id: UUID, machine_id: UUID) -> MachineView:
        row = await self.machines.get_for_customer_with_model(machine_id, customer_id)
        if row is None:
            raise ApiError(status=404, code="MACHINE_NOT_FOUND", title="Machine not found")
        machine, model = row
        media = await self.media.list_machine_registration_media(
            owner_id=customer_id,
            collection_ids=[machine.id],
        )
        return MachineView(
            machine=machine,
            model=model,
            media_ids=tuple(media.get(machine.id, ())),
        )

    async def create_manual(self, customer_id: UUID, data: MachineCreate) -> MachineView:
        machine_model = await self.machines.get_active_model(data.machine_model_id)
        if machine_model is None:
            raise ApiError(
                status=422,
                code="MACHINE_MODEL_NOT_AVAILABLE",
                title="Machine model is not available for registration",
            )
        serial_number = self._validated_serial(data.serial_number, machine_model.serial_pattern)
        media = None
        if data.media_id is not None:
            media = await self.media.get_registration_media_for_update(data.media_id)
            if (
                media is None
                or media.owner_id != customer_id
                or media.purpose is not MediaPurpose.MACHINE_REGISTRATION
                or media.collection_id is not None
                or not media.content_type.startswith("image/")
            ):
                raise ApiError(
                    status=422,
                    code="MACHINE_MEDIA_NOT_AVAILABLE",
                    title="Machine registration photo is not available",
                )
        await self.machines.lock_serial(machine_model.id, serial_number)
        if await self.machines.get_by_model_serial(machine_model.id, serial_number) is not None:
            raise ApiError(
                status=409,
                code="MACHINE_SERIAL_ALREADY_REGISTERED",
                title="Machine serial is already registered",
            )
        machine = await self.machines.create_manual_registration(
            customer_id=customer_id,
            machine_model_id=machine_model.id,
            serial_number=serial_number,
            purchase_date=data.purchase_date,
        )
        if media is not None:
            await self.media.attach_to_collection(media, machine.id)
        return MachineView(
            machine=machine,
            model=machine_model,
            media_ids=(media.id,) if media is not None else (),
        )

    async def complete_serial(
        self,
        customer_id: UUID,
        machine_id: UUID,
        data: MachineSerialUpdate,
    ) -> MachineView:
        machine = await self.machines.get_for_customer_for_update(machine_id, customer_id)
        if machine is None:
            raise ApiError(status=404, code="MACHINE_NOT_FOUND", title="Machine not found")
        if not machine.serial_pending:
            raise ApiError(
                status=409,
                code="MACHINE_SERIAL_ALREADY_COMPLETED",
                title="Machine serial has already been completed",
            )
        machine_model = await self.machines.get_model(machine.machine_model_id)
        if machine_model is None:
            raise RuntimeError("registered machine references a missing model")
        serial_number = self._validated_serial(data.serial_number, machine_model.serial_pattern)
        await self.machines.lock_serial(machine_model.id, serial_number)
        if await self.machines.get_by_model_serial(machine_model.id, serial_number) is not None:
            raise ApiError(
                status=409,
                code="MACHINE_SERIAL_ALREADY_REGISTERED",
                title="Machine serial is already registered",
            )
        machine = await self.machines.assign_serial(machine, serial_number)
        media = await self.media.list_machine_registration_media(
            owner_id=customer_id,
            collection_ids=[machine.id],
        )
        return MachineView(
            machine=machine,
            model=machine_model,
            media_ids=tuple(media.get(machine.id, ())),
        )

    @staticmethod
    def _validated_serial(raw_serial: str, serial_pattern: str | None) -> str:
        try:
            serial_number = normalize_machine_serial(raw_serial)
        except ValueError as exc:
            raise ApiError(
                status=422,
                code="MACHINE_SERIAL_INVALID",
                title="Machine serial is invalid",
            ) from exc
        if serial_pattern is not None:
            try:
                matches = re.fullmatch(serial_pattern, serial_number) is not None
            except re.error as exc:
                raise RuntimeError("machine model has an invalid serial pattern") from exc
            if not matches:
                raise ApiError(
                    status=422,
                    code="MACHINE_SERIAL_INVALID",
                    title="Machine serial does not match the selected model",
                )
        return serial_number


def calculate_warranty_end(purchase_date: date, warranty_months: int) -> date:
    if warranty_months < 0:
        raise ValueError("warranty months must be non-negative")
    month_index = purchase_date.month - 1 + warranty_months
    year = purchase_date.year + month_index // 12
    month = month_index % 12 + 1
    day = min(purchase_date.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


class MachineRegistrationService:
    def __init__(self, machines: MachineRepository, *, clock: Clock) -> None:
        self.machines = machines
        self.clock = clock

    async def register_order_machines(self, order_id: OrderId) -> list[MachineId]:
        order = await self.machines.get_order_for_registration(order_id)
        if order is None:
            raise ApiError(status=404, code="ORDER_NOT_FOUND", title="Order not found")
        if order.state is not OrderState.PAID:
            raise ApiError(
                status=409,
                code="ORDER_NOT_PAID",
                title="Machines can only be registered for a paid order",
            )
        existing = await self.machines.list_for_order(order.id)
        registrations = {
            (machine.source_order_item_id, machine.source_unit_index): machine
            for machine in existing
        }
        purchase_date = self.clock.now().date()
        for item in order.items:
            if item.machine_model_id is None:
                continue
            warranty_months = item.machine_warranty_months
            if warranty_months is None:
                warranty_months = 12
            for unit_index in range(1, item.quantity + 1):
                key = (item.id, unit_index)
                if key in registrations:
                    continue
                registrations[key] = await self.machines.create_order_registration(
                    customer_id=order.customer_id,
                    machine_model_id=item.machine_model_id,
                    order_item_id=item.id,
                    source_unit_index=unit_index,
                    purchase_date=purchase_date,
                    warranty_months=warranty_months,
                    warranty_end_date=calculate_warranty_end(purchase_date, warranty_months),
                )
        return [
            machine.id
            for machine in sorted(
                registrations.values(),
                key=lambda machine: (
                    str(machine.source_order_item_id),
                    machine.source_unit_index or 0,
                ),
            )
        ]
