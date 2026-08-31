import pytest

from coffix.orders.service import calculate_order_totals


def test_order_totals_use_integer_server_prices_and_flat_shipping() -> None:
    totals = calculate_order_totals([(2900, 2), (450, 3)], shipping_fee_agorot=3000)

    assert totals.subtotal_agorot == 7150
    assert totals.shipping_agorot == 3000
    assert totals.total_agorot == 10150
    assert totals.currency == "ILS"


@pytest.mark.parametrize(
    ("lines", "shipping_fee"),
    [([(-1, 1)], 3000), ([(100, 0)], 3000), ([(100, 1)], -1), ([(100.5, 1)], 3000)],
)
def test_order_totals_reject_invalid_money_or_quantities(
    lines: list[tuple[object, int]], shipping_fee: int
) -> None:
    with pytest.raises(ValueError):
        calculate_order_totals(lines, shipping_fee_agorot=shipping_fee)
