from datetime import date

import pytest

from coffix.machines.service import calculate_warranty_end


@pytest.mark.parametrize(
    ("purchase_date", "warranty_months", "expected_end"),
    [
        (date(2026, 8, 31), 12, date(2027, 8, 31)),
        (date(2028, 1, 31), 1, date(2028, 2, 29)),
        (date(2028, 2, 29), 12, date(2029, 2, 28)),
        (date(2026, 8, 31), 0, date(2026, 8, 31)),
    ],
)
def test_warranty_end_uses_calendar_months_and_clamps_month_end(
    purchase_date: date,
    warranty_months: int,
    expected_end: date,
) -> None:
    assert calculate_warranty_end(purchase_date, warranty_months) == expected_end


def test_warranty_end_rejects_negative_duration() -> None:
    with pytest.raises(ValueError, match="non-negative"):
        calculate_warranty_end(date(2026, 8, 31), -1)
