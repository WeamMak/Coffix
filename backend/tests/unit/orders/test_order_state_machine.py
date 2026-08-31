import pytest

from coffix.orders.models import OrderState
from coffix.orders.state_machine import (
    OrderAction,
    OrderTransitionError,
    allowed_admin_actions,
    next_order_state,
)


@pytest.mark.parametrize(
    ("current", "action", "expected"),
    [
        (OrderState.PENDING_PAYMENT, OrderAction.PAYMENT_CONFIRMED, OrderState.PAID),
        (OrderState.PENDING_PAYMENT, OrderAction.PAYMENT_EXPIRED, OrderState.PAYMENT_EXPIRED),
        (OrderState.PENDING_PAYMENT, OrderAction.CANCEL, OrderState.CANCELLED),
        (OrderState.PAID, OrderAction.PROCESS, OrderState.PROCESSING),
        (OrderState.PROCESSING, OrderAction.SHIP, OrderState.SHIPPED),
        (OrderState.SHIPPED, OrderAction.DELIVER, OrderState.DELIVERED),
        (OrderState.PAID, OrderAction.REFUND_CONFIRMED, OrderState.REFUNDED),
        (OrderState.PROCESSING, OrderAction.REFUND_CONFIRMED, OrderState.REFUNDED),
        (OrderState.SHIPPED, OrderAction.REFUND_CONFIRMED, OrderState.REFUNDED),
        (OrderState.DELIVERED, OrderAction.REFUND_CONFIRMED, OrderState.REFUNDED),
    ],
)
def test_order_state_machine_accepts_only_the_documented_transitions(
    current: OrderState,
    action: OrderAction,
    expected: OrderState,
) -> None:
    assert next_order_state(current, action) is expected


def test_order_state_machine_rejects_skips_and_terminal_state_changes() -> None:
    invalid = [
        (OrderState.PENDING_PAYMENT, OrderAction.PROCESS),
        (OrderState.PAID, OrderAction.SHIP),
        (OrderState.PROCESSING, OrderAction.DELIVER),
        (OrderState.CANCELLED, OrderAction.PAYMENT_CONFIRMED),
        (OrderState.PAYMENT_EXPIRED, OrderAction.PAYMENT_CONFIRMED),
        (OrderState.REFUNDED, OrderAction.PROCESS),
    ]

    for state, action in invalid:
        with pytest.raises(OrderTransitionError, match="cannot"):
            next_order_state(state, action)


def test_admin_actions_do_not_offer_customer_cancellation_or_premature_commands() -> None:
    assert allowed_admin_actions(OrderState.PENDING_PAYMENT) == frozenset({"cancel"})
    assert allowed_admin_actions(OrderState.PAID) == frozenset({"process", "refund"})
    assert allowed_admin_actions(OrderState.PROCESSING) == frozenset({"ship", "refund"})
    assert allowed_admin_actions(OrderState.SHIPPED) == frozenset({"deliver", "refund"})
    assert allowed_admin_actions(OrderState.DELIVERED) == frozenset({"refund"})
    assert allowed_admin_actions(OrderState.CANCELLED) == frozenset()
