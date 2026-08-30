from datetime import UTC, datetime
from uuid import uuid4

import pytest

from coffix.inventory.models import ReservationState, StockReservation
from coffix.inventory.service import InventoryConflict, calculate_reservation


def test_unlimited_stock_accepts_any_non_negative_quantity_without_a_reservation() -> None:
    result = calculate_reservation(
        stock_quantity=None,
        reserved_by_others=999,
        current_quantity=0,
        desired_quantity=250,
    )

    assert result.is_tracked is False
    assert result.quantity == 250
    assert result.reserved_quantity == 0
    assert result.available_quantity is None


@pytest.mark.parametrize(
    ("current_quantity", "desired_quantity", "expected_available"),
    [(0, 4, 6), (4, 7, 3), (7, 2, 8), (2, 0, 10)],
)
def test_tracked_stock_supports_create_increase_decrease_and_removal(
    current_quantity: int,
    desired_quantity: int,
    expected_available: int,
) -> None:
    result = calculate_reservation(
        stock_quantity=10,
        reserved_by_others=0,
        current_quantity=current_quantity,
        desired_quantity=desired_quantity,
    )

    assert result.is_tracked is True
    assert result.quantity == desired_quantity
    assert result.reserved_quantity == desired_quantity
    assert result.available_quantity == expected_available


def test_tracked_stock_rejects_quantity_above_authoritative_availability() -> None:
    with pytest.raises(InventoryConflict) as raised:
        calculate_reservation(
            stock_quantity=10,
            reserved_by_others=8,
            current_quantity=1,
            desired_quantity=3,
        )

    assert raised.value.status == 409
    assert raised.value.code == "INSUFFICIENT_STOCK"


def test_release_and_consume_state_transitions_are_idempotent() -> None:
    now = datetime(2026, 8, 31, 9, 0, tzinfo=UTC)
    released = StockReservation(
        sku_id=uuid4(),
        cart_id=uuid4(),
        quantity=2,
        expires_at=now,
        state=ReservationState.ACTIVE,
    )
    consumed = StockReservation(
        sku_id=uuid4(),
        order_id=uuid4(),
        quantity=3,
        expires_at=now,
        state=ReservationState.ACTIVE,
    )

    assert released.release(now) is True
    assert released.release(now) is False
    assert released.state is ReservationState.RELEASED
    assert consumed.consume(now) is True
    assert consumed.consume(now) is False
    assert consumed.state is ReservationState.CONSUMED
