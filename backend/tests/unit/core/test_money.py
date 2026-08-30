from typing import Any

import pytest

from coffix.core.types import Money


def test_money_rejects_negative_amount() -> None:
    with pytest.raises(ValueError, match="non-negative"):
        Money(amount_agorot=-1)


def test_money_rejects_non_ils_currency() -> None:
    invalid_currency: Any = "USD"

    with pytest.raises(ValueError, match="ILS"):
        Money(amount_agorot=100, currency=invalid_currency)
