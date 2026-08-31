from datetime import UTC, date, datetime
from uuid import UUID

import pytest

from coffix.api.errors import ApiError
from coffix.machines.models import MachineModel, MachineSource, RegisteredMachine
from coffix.machines.schemas import MachineCreate, MachineSerialUpdate
from coffix.machines.service import CustomerMachineService, normalize_machine_serial
from coffix.media.models import MediaObject
from coffix.media.store import MediaPurpose

MODEL_ID = UUID("11111111-2222-4333-8444-555555555555")
CUSTOMER_ID = UUID("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")


class FakeMachineStore:
    def __init__(
        self,
        model: MachineModel | None,
        *,
        owned_machine: RegisteredMachine | None = None,
    ) -> None:
        self.model = model
        self.created: list[RegisteredMachine] = [owned_machine] if owned_machine is not None else []

    async def get_active_model(self, model_id: UUID) -> MachineModel | None:
        if self.model is None or self.model.id != model_id or not self.model.is_active:
            return None
        return self.model

    async def get_model(self, model_id: UUID) -> MachineModel | None:
        if self.model is None or self.model.id != model_id:
            return None
        return self.model

    async def lock_serial(self, machine_model_id: UUID, serial_number: str) -> None:
        return None

    async def get_by_model_serial(
        self,
        machine_model_id: UUID,
        serial_number: str,
    ) -> RegisteredMachine | None:
        return next(
            (
                machine
                for machine in self.created
                if machine.machine_model_id == machine_model_id
                and machine.serial_number == serial_number
            ),
            None,
        )

    async def create_manual_registration(
        self,
        *,
        customer_id: UUID,
        machine_model_id: UUID,
        serial_number: str,
        purchase_date: date | None,
    ) -> RegisteredMachine:
        machine = RegisteredMachine(
            id=UUID("99999999-8888-4777-8666-555555555555"),
            customer_id=customer_id,
            machine_model_id=machine_model_id,
            serial_number=serial_number,
            serial_pending=False,
            source=MachineSource.MANUAL,
            source_order_item_id=None,
            source_unit_index=None,
            purchase_date=purchase_date,
            warranty_start_date=None,
            warranty_end_date=None,
            warranty_months=None,
        )
        self.created.append(machine)
        return machine

    async def get_for_customer_for_update(
        self,
        machine_id: UUID,
        customer_id: UUID,
    ) -> RegisteredMachine | None:
        return next(
            (
                machine
                for machine in self.created
                if machine.id == machine_id and machine.customer_id == customer_id
            ),
            None,
        )

    async def assign_serial(
        self,
        machine: RegisteredMachine,
        serial_number: str,
    ) -> RegisteredMachine:
        machine.serial_number = serial_number
        machine.serial_pending = False
        return machine


class FakeMediaStore:
    def __init__(self, media: MediaObject | None = None) -> None:
        self.media = media

    async def get_registration_media_for_update(
        self,
        media_id: UUID,
    ) -> MediaObject | None:
        if self.media is None or self.media.id != media_id:
            return None
        return self.media

    async def attach_to_collection(self, media: MediaObject, collection_id: UUID) -> None:
        media.collection_id = collection_id

    async def list_machine_registration_media(
        self,
        *,
        owner_id: UUID,
        collection_ids: list[UUID],
    ) -> dict[UUID, list[UUID]]:
        if (
            self.media is None
            or self.media.owner_id != owner_id
            or self.media.collection_id not in collection_ids
        ):
            return {}
        assert self.media.collection_id is not None
        return {self.media.collection_id: [self.media.id]}


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("  ab-123  ", "AB-123"),
        ("ab 123", "AB123"),
        ("ｍｘ－４２", "MX-42"),
    ],
)
def test_machine_serial_normalization_is_stable(raw: str, expected: str) -> None:
    assert normalize_machine_serial(raw) == expected


@pytest.mark.parametrize("raw", ["", "   ", "A" * 161])
def test_machine_serial_normalization_rejects_empty_or_oversized_values(raw: str) -> None:
    with pytest.raises(ValueError, match="serial"):
        normalize_machine_serial(raw)


@pytest.mark.asyncio
async def test_manual_registration_has_no_coffix_warranty() -> None:
    machines = FakeMachineStore(
        MachineModel(
            id=MODEL_ID,
            manufacturer="Coffix",
            model_name="Manual One",
            serial_pattern=r"^CFX-[0-9]{4}$",
            default_warranty_months=24,
            is_active=True,
        )
    )
    service = CustomerMachineService(machines, FakeMediaStore())

    registered = await service.create_manual(
        CUSTOMER_ID,
        MachineCreate(
            machine_model_id=MODEL_ID,
            serial_number=" cfx-0042 ",
            purchase_date=date(2025, 5, 6),
        ),
    )

    assert registered.machine.serial_number == "CFX-0042"
    assert registered.machine.serial_pending is False
    assert registered.machine.source is MachineSource.MANUAL
    assert registered.machine.purchase_date == date(2025, 5, 6)
    assert registered.machine.warranty_start_date is None
    assert registered.machine.warranty_end_date is None
    assert registered.machine.warranty_months is None
    assert registered.media_ids == ()
    assert registered.service_history == ()


@pytest.mark.asyncio
async def test_manual_registration_attaches_completed_owned_machine_photo() -> None:
    machine_model = MachineModel(
        id=MODEL_ID,
        manufacturer="Coffix",
        model_name="Manual Photo",
        serial_pattern=None,
        default_warranty_months=12,
        is_active=True,
    )
    media_id = UUID("12345678-1234-4234-8234-123456789012")
    media = MediaObject(
        id=media_id,
        upload_id=UUID("22345678-1234-4234-8234-123456789012"),
        owner_id=CUSTOMER_ID,
        purpose=MediaPurpose.MACHINE_REGISTRATION,
        collection_id=None,
        object_key="media/photo",
        content_type="image/jpeg",
        size_bytes=100,
        created_at=datetime(2026, 8, 31, tzinfo=UTC),
        updated_at=datetime(2026, 8, 31, tzinfo=UTC),
    )
    service = CustomerMachineService(
        FakeMachineStore(machine_model),
        FakeMediaStore(media),
    )

    registered = await service.create_manual(
        CUSTOMER_ID,
        MachineCreate(
            machine_model_id=MODEL_ID,
            serial_number="photo-42",
            media_id=media_id,
        ),
    )

    assert registered.media_ids == (media_id,)
    assert media.collection_id == registered.machine.id


@pytest.mark.asyncio
async def test_duplicate_serial_error_does_not_disclose_existing_owner() -> None:
    model = MachineModel(
        id=MODEL_ID,
        manufacturer="Coffix",
        model_name="Duplicate",
        serial_pattern=None,
        default_warranty_months=12,
        is_active=True,
    )
    existing = RegisteredMachine(
        id=UUID("32345678-1234-4234-8234-123456789012"),
        customer_id=UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
        machine_model_id=MODEL_ID,
        serial_number="DUP-42",
        serial_pending=False,
        source=MachineSource.MANUAL,
        source_order_item_id=None,
        source_unit_index=None,
        purchase_date=None,
        warranty_start_date=None,
        warranty_end_date=None,
        warranty_months=None,
    )
    service = CustomerMachineService(
        FakeMachineStore(model, owned_machine=existing),
        FakeMediaStore(),
    )

    with pytest.raises(ApiError) as error:
        await service.create_manual(
            CUSTOMER_ID,
            MachineCreate(machine_model_id=MODEL_ID, serial_number=" dup-42 "),
        )

    assert error.value.status == 409
    assert error.value.code == "MACHINE_SERIAL_ALREADY_REGISTERED"
    assert str(existing.customer_id) not in str(error.value)


@pytest.mark.asyncio
async def test_customer_completes_order_serial_without_changing_warranty_snapshot() -> None:
    model = MachineModel(
        id=MODEL_ID,
        manufacturer="Coffix",
        model_name="Purchased",
        serial_pattern=r"^ORDER-[0-9]{4}$",
        default_warranty_months=36,
        is_active=False,
    )
    purchased = RegisteredMachine(
        id=UUID("42345678-1234-4234-8234-123456789012"),
        customer_id=CUSTOMER_ID,
        machine_model_id=MODEL_ID,
        serial_number=None,
        serial_pending=True,
        source=MachineSource.ORDER,
        source_order_item_id=UUID("52345678-1234-4234-8234-123456789012"),
        source_unit_index=1,
        purchase_date=date(2026, 1, 2),
        warranty_start_date=date(2026, 1, 2),
        warranty_end_date=date(2027, 7, 2),
        warranty_months=18,
    )
    service = CustomerMachineService(
        FakeMachineStore(model, owned_machine=purchased),
        FakeMediaStore(),
    )

    updated = await service.complete_serial(
        CUSTOMER_ID,
        purchased.id,
        MachineSerialUpdate(serial_number=" order-0042 "),
    )

    assert updated.machine.serial_number == "ORDER-0042"
    assert updated.machine.serial_pending is False
    assert updated.machine.warranty_months == 18
    assert updated.machine.warranty_start_date == date(2026, 1, 2)
    assert updated.machine.warranty_end_date == date(2027, 7, 2)
