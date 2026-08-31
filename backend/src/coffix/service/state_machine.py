from enum import StrEnum

from coffix.service.models import ServiceRequestState


class ServiceAction(StrEnum):
    CANCEL = "cancel"
    DIAGNOSTIC_PAYMENT_CONFIRMED = "diagnostic_payment_confirmed"
    SCHEDULE = "schedule"
    RECEIVE = "receive"
    START_DIAGNOSIS = "start_diagnosis"
    REQUEST_ADDITIONAL_DECISION = "request_additional_decision"
    ACCEPT_ADDITIONAL_QUOTE = "accept_additional_quote"
    DECLINE_ADDITIONAL_QUOTE = "decline_additional_quote"
    ADDITIONAL_PAYMENT_CONFIRMED = "additional_payment_confirmed"
    START_REPAIR = "start_repair"
    READY_FOR_RETURN = "ready_for_return"
    COMPLETE = "complete"


class ServiceActor(StrEnum):
    CUSTOMER = "customer"
    ADMIN = "admin"
    TECHNICIAN = "technician"
    SYSTEM = "system"


class ServiceTransitionError(ValueError):
    pass


TRANSITIONS: dict[
    tuple[ServiceRequestState, ServiceAction, ServiceActor],
    ServiceRequestState,
] = {
    (
        ServiceRequestState.AWAITING_DIAGNOSTIC_PAYMENT,
        ServiceAction.CANCEL,
        ServiceActor.CUSTOMER,
    ): ServiceRequestState.CANCELLED,
    (
        ServiceRequestState.AWAITING_DIAGNOSTIC_PAYMENT,
        ServiceAction.CANCEL,
        ServiceActor.ADMIN,
    ): ServiceRequestState.CANCELLED,
    (
        ServiceRequestState.AWAITING_DIAGNOSTIC_PAYMENT,
        ServiceAction.CANCEL,
        ServiceActor.SYSTEM,
    ): ServiceRequestState.CANCELLED,
    (
        ServiceRequestState.AWAITING_DIAGNOSTIC_PAYMENT,
        ServiceAction.DIAGNOSTIC_PAYMENT_CONFIRMED,
        ServiceActor.SYSTEM,
    ): ServiceRequestState.AWAITING_ADMIN_REVIEW,
    (
        ServiceRequestState.AWAITING_ADMIN_REVIEW,
        ServiceAction.SCHEDULE,
        ServiceActor.ADMIN,
    ): ServiceRequestState.SCHEDULED,
    (
        ServiceRequestState.SCHEDULED,
        ServiceAction.RECEIVE,
        ServiceActor.ADMIN,
    ): ServiceRequestState.RECEIVED,
    (
        ServiceRequestState.SCHEDULED,
        ServiceAction.RECEIVE,
        ServiceActor.TECHNICIAN,
    ): ServiceRequestState.RECEIVED,
    (
        ServiceRequestState.RECEIVED,
        ServiceAction.START_DIAGNOSIS,
        ServiceActor.ADMIN,
    ): ServiceRequestState.DIAGNOSING,
    (
        ServiceRequestState.RECEIVED,
        ServiceAction.START_DIAGNOSIS,
        ServiceActor.TECHNICIAN,
    ): ServiceRequestState.DIAGNOSING,
    (
        ServiceRequestState.DIAGNOSING,
        ServiceAction.REQUEST_ADDITIONAL_DECISION,
        ServiceActor.ADMIN,
    ): ServiceRequestState.AWAITING_ADDITIONAL_DECISION,
    (
        ServiceRequestState.DIAGNOSING,
        ServiceAction.START_REPAIR,
        ServiceActor.ADMIN,
    ): ServiceRequestState.REPAIR_IN_PROGRESS,
    (
        ServiceRequestState.AWAITING_ADDITIONAL_DECISION,
        ServiceAction.ACCEPT_ADDITIONAL_QUOTE,
        ServiceActor.CUSTOMER,
    ): ServiceRequestState.AWAITING_ADDITIONAL_PAYMENT,
    (
        ServiceRequestState.AWAITING_ADDITIONAL_DECISION,
        ServiceAction.DECLINE_ADDITIONAL_QUOTE,
        ServiceActor.CUSTOMER,
    ): ServiceRequestState.CANCELLED,
    (
        ServiceRequestState.AWAITING_ADDITIONAL_PAYMENT,
        ServiceAction.ADDITIONAL_PAYMENT_CONFIRMED,
        ServiceActor.SYSTEM,
    ): ServiceRequestState.REPAIR_IN_PROGRESS,
    (
        ServiceRequestState.REPAIR_IN_PROGRESS,
        ServiceAction.READY_FOR_RETURN,
        ServiceActor.ADMIN,
    ): ServiceRequestState.READY_FOR_RETURN,
    (
        ServiceRequestState.REPAIR_IN_PROGRESS,
        ServiceAction.READY_FOR_RETURN,
        ServiceActor.TECHNICIAN,
    ): ServiceRequestState.READY_FOR_RETURN,
    (
        ServiceRequestState.READY_FOR_RETURN,
        ServiceAction.COMPLETE,
        ServiceActor.ADMIN,
    ): ServiceRequestState.COMPLETED,
}

PUBLIC_ACTIONS: dict[
    tuple[ServiceRequestState, ServiceActor],
    frozenset[str],
] = {
    (
        ServiceRequestState.AWAITING_DIAGNOSTIC_PAYMENT,
        ServiceActor.CUSTOMER,
    ): frozenset({"cancel", "pay_diagnostic"}),
    (
        ServiceRequestState.AWAITING_ADDITIONAL_DECISION,
        ServiceActor.CUSTOMER,
    ): frozenset({"accept_quote", "decline_quote"}),
    (
        ServiceRequestState.AWAITING_ADDITIONAL_PAYMENT,
        ServiceActor.CUSTOMER,
    ): frozenset({"pay_additional"}),
    (
        ServiceRequestState.AWAITING_DIAGNOSTIC_PAYMENT,
        ServiceActor.ADMIN,
    ): frozenset({"cancel"}),
    (
        ServiceRequestState.AWAITING_ADMIN_REVIEW,
        ServiceActor.ADMIN,
    ): frozenset({"schedule"}),
    (ServiceRequestState.SCHEDULED, ServiceActor.ADMIN): frozenset({"receive"}),
    (ServiceRequestState.RECEIVED, ServiceActor.ADMIN): frozenset({"start_diagnosis"}),
    (
        ServiceRequestState.DIAGNOSING,
        ServiceActor.ADMIN,
    ): frozenset({"quote", "start_repair"}),
    (
        ServiceRequestState.REPAIR_IN_PROGRESS,
        ServiceActor.ADMIN,
    ): frozenset({"ready_for_return"}),
    (
        ServiceRequestState.READY_FOR_RETURN,
        ServiceActor.ADMIN,
    ): frozenset({"complete"}),
    (ServiceRequestState.SCHEDULED, ServiceActor.TECHNICIAN): frozenset({"receive"}),
    (
        ServiceRequestState.RECEIVED,
        ServiceActor.TECHNICIAN,
    ): frozenset({"start_diagnosis"}),
    (
        ServiceRequestState.REPAIR_IN_PROGRESS,
        ServiceActor.TECHNICIAN,
    ): frozenset({"ready_for_return"}),
}


def next_service_state(
    current: ServiceRequestState,
    action: ServiceAction,
    actor: ServiceActor,
) -> ServiceRequestState:
    try:
        return TRANSITIONS[(current, action, actor)]
    except KeyError as exc:
        raise ServiceTransitionError(
            f"{actor.value} cannot {action.value} from {current.value}"
        ) from exc


def allowed_service_actions(
    state: ServiceRequestState,
    actor: ServiceActor,
) -> frozenset[str]:
    return PUBLIC_ACTIONS.get((state, actor), frozenset())
