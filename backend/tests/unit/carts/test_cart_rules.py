from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from coffix.carts.models import Cart, CartStatus
from coffix.carts.service import calculate_cart_totals


def test_cart_totals_use_server_price_snapshots_and_integer_agorot() -> None:
    totals = calculate_cart_totals([(2900, 2), (8900, 1)])

    assert totals.subtotal_agorot == 14_700
    assert totals.total_quantity == 3
    assert totals.currency == "ILS"


def test_cart_totals_reject_invalid_price_or_quantity() -> None:
    with pytest.raises(ValueError):
        calculate_cart_totals([(-1, 1)])
    with pytest.raises(ValueError):
        calculate_cart_totals([(1000, 0)])


def test_cart_activity_refresh_and_expiry_are_deterministic_and_idempotent() -> None:
    now = datetime(2026, 8, 31, 10, 0, tzinfo=UTC)
    cart = Cart(
        customer_id=uuid4(),
        status=CartStatus.ACTIVE,
        last_activity_at=now,
        expires_at=now + timedelta(hours=1),
        version=1,
    )

    cart.refresh_activity(now + timedelta(minutes=10), ttl_seconds=3600)

    assert cart.last_activity_at == now + timedelta(minutes=10)
    assert cart.expires_at == now + timedelta(minutes=70)
    assert cart.version == 2
    assert cart.is_expired(now + timedelta(minutes=69)) is False
    assert cart.is_expired(now + timedelta(minutes=70)) is True
    assert cart.expire(now + timedelta(minutes=70)) is True
    assert cart.expire(now + timedelta(minutes=70)) is False
    assert cart.status is CartStatus.EXPIRED
