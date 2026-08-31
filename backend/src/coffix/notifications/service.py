from dataclasses import dataclass
from typing import Any
from uuid import UUID

from coffix.api.errors import ApiError
from coffix.core.clock import Clock
from coffix.notifications.repository import NotificationRepository
from coffix.notifications.schemas import DeviceTokenRegistration, NotificationRead


@dataclass(frozen=True, slots=True)
class NotificationEvent:
    id: UUID
    event_type: str
    aggregate_type: str
    aggregate_id: UUID
    payload: dict[str, Any]


@dataclass(frozen=True, slots=True)
class NotificationDraft:
    event_id: UUID
    recipient_id: UUID
    type: str
    title_he: str
    body_he: str
    related_entity_type: str
    related_entity_id: UUID


@dataclass(frozen=True, slots=True)
class NotificationTemplate:
    title_he: str
    body_he: str
    include_technician: bool = False


NOTIFICATION_TEMPLATES: dict[str, NotificationTemplate] = {
    "order.created": NotificationTemplate("ההזמנה נוצרה", "ההזמנה התקבלה וממתינה לתשלום."),
    "order.paid": NotificationTemplate("ההזמנה שולמה", "התשלום התקבל וההזמנה אושרה."),
    "payment.order.failed": NotificationTemplate(
        "התשלום על ההזמנה נכשל", "לא הצלחנו להשלים את התשלום. אפשר לנסות שוב."
    ),
    "order.payment_expired": NotificationTemplate(
        "זמן התשלום על ההזמנה הסתיים", "ההזמנה בוטלה והמלאי ששוריין שוחרר."
    ),
    "order.processing": NotificationTemplate("ההזמנה בטיפול", "התחלנו להכין את ההזמנה."),
    "order.shipped": NotificationTemplate("ההזמנה נשלחה", "ההזמנה יצאה למשלוח."),
    "order.delivered": NotificationTemplate("ההזמנה נמסרה", "ההזמנה סומנה כנמסרה."),
    "order.cancelled": NotificationTemplate("ההזמנה בוטלה", "ההזמנה בוטלה."),
    "order.refunded": NotificationTemplate(
        "ההחזר על ההזמנה הושלם", "ההחזר המלא אושר."
    ),
    "payment.refund.failed": NotificationTemplate(
        "ההחזר על ההזמנה נכשל", "ההחזר לא הושלם ונדרש טיפול של הצוות."
    ),
    "service.request.created": NotificationTemplate(
        "בקשת השירות נפתחה", "בקשת השירות התקבלה וממתינה לתשלום האבחון."
    ),
    "service.request.awaiting_admin_review": NotificationTemplate(
        "התשלום לאבחון התקבל", "בקשת השירות הועברה לבדיקת הצוות."
    ),
    "payment.diagnostic.failed": NotificationTemplate(
        "התשלום לאבחון נכשל", "לא הצלחנו להשלים את תשלום האבחון."
    ),
    "service.request.scheduled": NotificationTemplate(
        "נקבע מועד לשירות", "נקבע מועד לבדיקת המכונה ושובץ טכנאי.", include_technician=True
    ),
    "service.request.received": NotificationTemplate(
        "המכונה התקבלה לבדיקה", "המכונה התקבלה במעבדת השירות."
    ),
    "service.request.diagnosing": NotificationTemplate(
        "אבחון המכונה החל", "הטכנאי התחיל לאבחן את המכונה."
    ),
    "service.request.awaiting_additional_decision": NotificationTemplate(
        "התקבלה הצעת מחיר נוספת", "נדרשת החלטה לגבי עלות נוספת לפני המשך התיקון."
    ),
    "service.request.awaiting_additional_payment": NotificationTemplate(
        "הצעת המחיר אושרה", "ההצעה אושרה וממתינה לתשלום נוסף."
    ),
    "payment.additional.failed": NotificationTemplate(
        "התשלום הנוסף נכשל", "לא הצלחנו להשלים את התשלום הנוסף."
    ),
    "service.request.repair_in_progress": NotificationTemplate(
        "תיקון המכונה החל", "הטכנאי התחיל בתיקון המכונה."
    ),
    "service.request.ready_for_return": NotificationTemplate(
        "המכונה מוכנה להחזרה", "הטיפול הסתיים והמכונה מוכנה להחזרה."
    ),
    "service.request.completed": NotificationTemplate(
        "בקשת השירות הושלמה", "בקשת השירות הושלמה."
    ),
    "service.request.cancelled": NotificationTemplate(
        "בקשת השירות בוטלה", "בקשת השירות בוטלה."
    ),
}


def notification_drafts_for(event: NotificationEvent) -> tuple[NotificationDraft, ...]:
    template = NOTIFICATION_TEMPLATES.get(event.event_type)
    if template is None:
        return ()
    customer_id = _recipient_id(event.payload, "customer_id")
    recipients = [customer_id]
    if template.include_technician and event.payload.get("technician_id") is not None:
        recipients.append(_recipient_id(event.payload, "technician_id"))
    return tuple(
        NotificationDraft(
            event_id=event.id,
            recipient_id=recipient_id,
            type=event.event_type,
            title_he=template.title_he,
            body_he=template.body_he,
            related_entity_type=event.aggregate_type,
            related_entity_id=event.aggregate_id,
        )
        for recipient_id in dict.fromkeys(recipients)
    )


def _recipient_id(payload: dict[str, Any], field: str) -> UUID:
    value = payload.get(field)
    if not isinstance(value, str):
        raise ValueError(f"notification event requires {field}")
    try:
        return UUID(value)
    except ValueError as exc:
        raise ValueError(f"notification event has invalid {field}") from exc


class NotificationService:
    def __init__(self, repository: NotificationRepository, *, clock: Clock) -> None:
        self.repository = repository
        self.clock = clock

    async def list_for_recipient(
        self,
        recipient_id: UUID,
        *,
        limit: int,
        offset: int,
    ) -> list[NotificationRead]:
        notifications = await self.repository.list_for_recipient(
            recipient_id,
            limit=limit,
            offset=offset,
        )
        return [NotificationRead.model_validate(item) for item in notifications]

    async def unread_count(self, recipient_id: UUID) -> int:
        return await self.repository.unread_count(recipient_id)

    async def mark_read(self, recipient_id: UUID, notification_id: UUID) -> NotificationRead:
        notification = await self.repository.get_owned_for_update(notification_id, recipient_id)
        if notification is None:
            raise ApiError(
                status=404,
                code="NOTIFICATION_NOT_FOUND",
                title="Notification not found",
            )
        if notification.read_at is None:
            notification.read_at = self.clock.now()
        return NotificationRead.model_validate(notification)

    async def register_device_token(
        self,
        user_id: UUID,
        data: DeviceTokenRegistration,
    ):
        return await self.repository.register_device_token(
            user_id=user_id,
            token=data.token.strip(),
            platform=data.platform,
            registered_at=self.clock.now(),
        )
