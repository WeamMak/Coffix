from enum import StrEnum

from coffix.orders.models import OrderState


class OrderAction(StrEnum):
    PAYMENT_CONFIRMED = "payment_confirmed"
    PAYMENT_EXPIRED = "payment_expired"
    PROCESS = "process"
    SHIP = "ship"
    DELIVER = "deliver"
    CANCEL = "cancel"
    REFUND_CONFIRMED = "refund_confirmed"


class OrderTransitionError(ValueError):
    pass


TRANSITIONS = {
    (OrderState.PENDING_PAYMENT, OrderAction.PAYMENT_CONFIRMED): OrderState.PAID,
    (OrderState.PENDING_PAYMENT, OrderAction.PAYMENT_EXPIRED): OrderState.PAYMENT_EXPIRED,
    (OrderState.PENDING_PAYMENT, OrderAction.CANCEL): OrderState.CANCELLED,
    (OrderState.PAID, OrderAction.PROCESS): OrderState.PROCESSING,
    (OrderState.PROCESSING, OrderAction.SHIP): OrderState.SHIPPED,
    (OrderState.SHIPPED, OrderAction.DELIVER): OrderState.DELIVERED,
    (OrderState.PAID, OrderAction.REFUND_CONFIRMED): OrderState.REFUNDED,
    (OrderState.PROCESSING, OrderAction.REFUND_CONFIRMED): OrderState.REFUNDED,
    (OrderState.SHIPPED, OrderAction.REFUND_CONFIRMED): OrderState.REFUNDED,
    (OrderState.DELIVERED, OrderAction.REFUND_CONFIRMED): OrderState.REFUNDED,
}

ADMIN_ACTIONS: dict[OrderState, frozenset[str]] = {
    OrderState.PENDING_PAYMENT: frozenset({"cancel"}),
    OrderState.PAID: frozenset({"process", "refund"}),
    OrderState.PROCESSING: frozenset({"ship", "refund"}),
    OrderState.SHIPPED: frozenset({"deliver", "refund"}),
    OrderState.DELIVERED: frozenset({"refund"}),
    OrderState.PAYMENT_EXPIRED: frozenset(),
    OrderState.CANCELLED: frozenset(),
    OrderState.REFUNDED: frozenset(),
}


def next_order_state(current: OrderState, action: OrderAction) -> OrderState:
    try:
        return TRANSITIONS[(current, action)]
    except KeyError as exc:
        raise OrderTransitionError(f"{action.value} cannot be applied to {current.value}") from exc


def allowed_admin_actions(state: OrderState) -> frozenset[str]:
    return ADMIN_ACTIONS[state]
