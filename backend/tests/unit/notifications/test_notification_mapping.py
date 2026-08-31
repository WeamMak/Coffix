from uuid import uuid4

import pytest

from coffix.notifications.service import NotificationEvent, notification_drafts_for


@pytest.mark.parametrize(
    ("event_type", "title_he"),
    [
        ("order.created", "ההזמנה נוצרה"),
        ("order.paid", "ההזמנה שולמה"),
        ("payment.order.failed", "התשלום על ההזמנה נכשל"),
        ("order.payment_expired", "זמן התשלום על ההזמנה הסתיים"),
        ("order.processing", "ההזמנה בטיפול"),
        ("order.shipped", "ההזמנה נשלחה"),
        ("order.delivered", "ההזמנה נמסרה"),
        ("order.cancelled", "ההזמנה בוטלה"),
        ("order.refunded", "ההחזר על ההזמנה הושלם"),
        ("payment.refund.failed", "ההחזר על ההזמנה נכשל"),
        ("service.request.created", "בקשת השירות נפתחה"),
        ("service.request.awaiting_admin_review", "התשלום לאבחון התקבל"),
        ("payment.diagnostic.failed", "התשלום לאבחון נכשל"),
        ("service.request.scheduled", "נקבע מועד לשירות"),
        ("service.request.received", "המכונה התקבלה לבדיקה"),
        ("service.request.diagnosing", "אבחון המכונה החל"),
        ("service.request.awaiting_additional_decision", "התקבלה הצעת מחיר נוספת"),
        ("service.request.awaiting_additional_payment", "הצעת המחיר אושרה"),
        ("payment.additional.failed", "התשלום הנוסף נכשל"),
        ("service.request.repair_in_progress", "תיקון המכונה החל"),
        ("service.request.ready_for_return", "המכונה מוכנה להחזרה"),
        ("service.request.completed", "בקשת השירות הושלמה"),
        ("service.request.cancelled", "בקשת השירות בוטלה"),
    ],
)
def test_material_customer_events_always_create_hebrew_in_app_notification(
    event_type: str,
    title_he: str,
) -> None:
    customer_id = uuid4()
    event = NotificationEvent(
        id=uuid4(),
        event_type=event_type,
        aggregate_type=(
            "order"
            if event_type.startswith(("order.", "payment.order"))
            else "service_request"
        ),
        aggregate_id=uuid4(),
        payload={"customer_id": str(customer_id)},
    )

    drafts = notification_drafts_for(event)

    assert len(drafts) == 1
    assert drafts[0].recipient_id == customer_id
    assert drafts[0].type == event_type
    assert drafts[0].title_he == title_he
    assert drafts[0].body_he
    assert drafts[0].related_entity_type == event.aggregate_type
    assert drafts[0].related_entity_id == event.aggregate_id


def test_scheduling_event_notifies_customer_and_assigned_technician() -> None:
    customer_id = uuid4()
    technician_id = uuid4()
    event = NotificationEvent(
        id=uuid4(),
        event_type="service.request.scheduled",
        aggregate_type="service_request",
        aggregate_id=uuid4(),
        payload={
            "customer_id": str(customer_id),
            "technician_id": str(technician_id),
        },
    )

    drafts = notification_drafts_for(event)

    assert {draft.recipient_id for draft in drafts} == {customer_id, technician_id}


def test_unknown_events_are_ignored_but_supported_events_require_a_recipient() -> None:
    unknown = NotificationEvent(
        id=uuid4(),
        event_type="catalog.product.updated",
        aggregate_type="product",
        aggregate_id=uuid4(),
        payload={},
    )
    assert notification_drafts_for(unknown) == ()

    supported = NotificationEvent(
        id=uuid4(),
        event_type="order.shipped",
        aggregate_type="order",
        aggregate_id=uuid4(),
        payload={},
    )
    with pytest.raises(ValueError, match="customer_id"):
        notification_drafts_for(supported)
