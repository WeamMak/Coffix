from datetime import UTC, datetime
from uuid import UUID

import pytest
from pydantic import ValidationError

from coffix.api.errors import ApiError
from coffix.core.clock import FakeClock
from coffix.core.ids import IdGenerator
from coffix.machines.models import MachineSource, RegisteredMachine
from coffix.media.models import MediaObject
from coffix.service.models import (
    ServiceLocationMode,
    ServiceRequest,
    ServiceRequestState,
    ServiceType,
)
from coffix.service.schemas import (
    PreferredWindowInput,
    ServiceAddressInput,
    ServiceRequestCreate,
)
from coffix.service.service import ServiceRequestService

NOW = datetime(2026, 8, 31, 10, 0, tzinfo=UTC)
CUSTOMER_ID = UUID("10000000-0000-4000-8000-000000000001")
MACHINE_ID = UUID("20000000-0000-4000-8000-000000000001")
MODEL_ID = UUID("30000000-0000-4000-8000-000000000001")
SERVICE_TYPE_ID = UUID("40000000-0000-4000-8000-000000000001")
REQUEST_ID = UUID("50000000-0000-4000-8000-000000000001")


class FixedIds(IdGenerator):
    def new(self) -> UUID:
        return REQUEST_ID


class FakeServiceStore:
    def __init__(self) -> None:
        self.machine = RegisteredMachine(
            id=MACHINE_ID,
            customer_id=CUSTOMER_ID,
            machine_model_id=MODEL_ID,
            serial_number="SERVICE-42",
            serial_pending=False,
            source=MachineSource.MANUAL,
            source_order_item_id=None,
            source_unit_index=None,
            purchase_date=None,
            warranty_start_date=None,
            warranty_end_date=None,
            warranty_months=None,
        )
        self.service_type = ServiceType(
            id=SERVICE_TYPE_ID,
            label_he="בדיקה ותיקון",
            label_en="Inspection and repair",
            diagnostic_fee_agorot=12_500,
            is_active=True,
            version=1,
        )
        self.created: dict[str, object] | None = None

    async def get_owned_machine(
        self,
        machine_id: UUID,
        customer_id: UUID,
    ) -> RegisteredMachine | None:
        if machine_id == self.machine.id and customer_id == self.machine.customer_id:
            return self.machine
        return None

    async def get_active_service_type_for_model(
        self,
        service_type_id: UUID,
        machine_model_id: UUID,
    ) -> ServiceType | None:
        if (
            service_type_id == self.service_type.id
            and machine_model_id == self.machine.machine_model_id
            and self.service_type.is_active
        ):
            return self.service_type
        return None

    async def get_owned_address(self, address_id: UUID, customer_id: UUID) -> None:
        return None

    async def get_issue_media_for_update(self, media_ids: list[UUID]) -> list[MediaObject]:
        return []

    async def create_request(self, **values: object) -> ServiceRequest:
        self.created = values
        values.pop("media")
        values.pop("actor_id")
        values.pop("now")
        request = ServiceRequest(**values)
        request.history = []
        request.notes = []
        request.media = []
        request.quotes = []
        request.created_at = NOW
        request.updated_at = NOW
        return request

    async def list_for_customer(self, customer_id: UUID) -> list[ServiceRequest]:
        return []

    async def get_for_customer(
        self,
        request_id: UUID,
        customer_id: UUID,
    ) -> ServiceRequest | None:
        return None

    async def get_for_customer_for_update(
        self,
        request_id: UUID,
        customer_id: UUID,
    ) -> ServiceRequest | None:
        return None


def request_data(**changes: object) -> ServiceRequestCreate:
    values: dict[str, object] = {
        "service_type_id": SERVICE_TYPE_ID,
        "description": "The machine loses pressure during extraction.",
        "location_mode": ServiceLocationMode.BRING_IN,
    }
    values.update(changes)
    return ServiceRequestCreate.model_validate(values)


@pytest.mark.asyncio
async def test_request_snapshots_diagnostic_fee_and_shop_address() -> None:
    store = FakeServiceStore()
    service = ServiceRequestService(
        store,
        clock=FakeClock(NOW),
        ids=FixedIds(),
        shop_address={"street": "Dizengoff 1", "city": "Tel Aviv", "country": "IL"},
    )

    request = await service.create(CUSTOMER_ID, MACHINE_ID, request_data())
    store.service_type.diagnostic_fee_agorot = 20_000

    assert request.diagnostic_fee_agorot == 12_500
    assert request.currency == "ILS"
    assert request.address_snapshot == {
        "street": "Dizengoff 1",
        "city": "Tel Aviv",
        "country": "IL",
    }
    assert request.state is ServiceRequestState.AWAITING_DIAGNOSTIC_PAYMENT
    assert store.created is not None


@pytest.mark.asyncio
async def test_request_hides_foreign_machine_and_rejects_unsupported_service_type() -> None:
    store = FakeServiceStore()
    service = ServiceRequestService(
        store,
        clock=FakeClock(NOW),
        ids=FixedIds(),
        shop_address={"city": "Tel Aviv", "country": "IL"},
    )

    with pytest.raises(ApiError) as foreign:
        await service.create(UUID(int=999), MACHINE_ID, request_data())
    assert foreign.value.status == 404
    assert foreign.value.code == "MACHINE_NOT_FOUND"

    store.service_type.is_active = False
    with pytest.raises(ApiError) as unsupported:
        await service.create(CUSTOMER_ID, MACHINE_ID, request_data())
    assert unsupported.value.status == 422
    assert unsupported.value.code == "SERVICE_TYPE_NOT_AVAILABLE"


@pytest.mark.parametrize(
    "values",
    [
        {"location_mode": "pickup"},
        {
            "location_mode": "bring_in",
            "address": {
                "recipient_name": "Customer",
                "phone": "+972501234567",
                "street": "Herzl",
                "building": "1",
                "city": "Haifa",
                "country": "IL",
            },
        },
    ],
)
def test_location_mode_requires_exactly_the_relevant_address(values: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        request_data(**values)


def test_preferred_window_requires_increasing_offset_aware_times() -> None:
    with pytest.raises(ValidationError):
        PreferredWindowInput(
            start=datetime(2026, 9, 1, 10),
            end=datetime(2026, 9, 1, 12),
        )
    with pytest.raises(ValidationError):
        PreferredWindowInput(start=NOW, end=NOW)


def test_one_time_pickup_address_accepts_only_israeli_country() -> None:
    with pytest.raises(ValidationError):
        ServiceAddressInput.model_validate(
            {
                "recipient_name": "Customer",
                "phone": "+972501234567",
                "street": "Herzl",
                "building": "1",
                "city": "Haifa",
                "country": "US",
            }
        )
