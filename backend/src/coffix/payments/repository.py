from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from coffix.payments.models import (
    Payment,
    PaymentPhase,
    PaymentState,
    ProviderEventRecord,
    Refund,
    RefundState,
)
from coffix.payments.providers import ProviderEvent


class PaymentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_payment_by_idempotency_key(
        self, idempotency_key: str, *, for_update: bool = False
    ) -> Payment | None:
        statement = select(Payment).where(Payment.idempotency_key == idempotency_key)
        if for_update:
            statement = statement.with_for_update(of=Payment)
        return await self.session.scalar(statement)

    async def get_payment(self, payment_id: UUID) -> Payment | None:
        return await self.session.get(Payment, payment_id)

    async def list_pending_payments(self, *, created_before: datetime, limit: int) -> list[Payment]:
        payments = await self.session.scalars(
            select(Payment)
            .where(
                Payment.state == PaymentState.PENDING,
                Payment.provider_payment_id.is_not(None),
                Payment.created_at <= created_before,
            )
            .order_by(Payment.created_at, Payment.id)
            .limit(limit)
        )
        return list(payments)

    async def create_payment(
        self,
        *,
        owner_id: UUID,
        phase: PaymentPhase,
        amount_agorot: int,
        currency: str,
        provider: str,
        state: PaymentState,
        idempotency_key: str,
        request_fingerprint: str,
    ) -> Payment:
        payment = Payment(
            owner_id=owner_id,
            phase=phase,
            amount_agorot=amount_agorot,
            currency=currency,
            provider=provider,
            state=state,
            idempotency_key=idempotency_key,
            request_fingerprint=request_fingerprint,
        )
        self.session.add(payment)
        await self.session.flush()
        return payment

    async def set_payment_provider_result(
        self,
        payment: Payment,
        *,
        provider_payment_id: str,
        client_secret: str | None = None,
    ) -> None:
        payment.provider_payment_id = provider_payment_id
        payment.provider_client_secret = client_secret
        await self.session.flush()

    async def get_payment_by_provider_id(
        self,
        provider: str,
        provider_payment_id: str,
        *,
        for_update: bool = False,
    ) -> Payment | None:
        statement = select(Payment).where(
            Payment.provider == provider,
            Payment.provider_payment_id == provider_payment_id,
        )
        if for_update:
            statement = statement.with_for_update(of=Payment)
        return await self.session.scalar(statement)

    async def get_refund_by_provider_id(
        self,
        provider: str,
        provider_refund_id: str,
        *,
        for_update: bool = False,
    ) -> Refund | None:
        statement = (
            select(Refund)
            .where(
                Refund.provider == provider,
                Refund.provider_refund_id == provider_refund_id,
            )
            .options(selectinload(Refund.payment))
        )
        if for_update:
            statement = statement.with_for_update(of=Refund)
        return await self.session.scalar(statement)

    async def get_refund_by_idempotency_key(
        self, idempotency_key: str, *, for_update: bool = False
    ) -> Refund | None:
        statement = (
            select(Refund)
            .where(Refund.idempotency_key == idempotency_key)
            .options(selectinload(Refund.payment))
        )
        if for_update:
            statement = statement.with_for_update(of=Refund)
        return await self.session.scalar(statement)

    async def get_refund_for_payment(self, payment_id: UUID) -> Refund | None:
        return await self.session.scalar(
            select(Refund)
            .where(Refund.payment_id == payment_id)
            .options(selectinload(Refund.payment))
        )

    async def list_pending_refunds(self, *, created_before: datetime, limit: int) -> list[Refund]:
        refunds = await self.session.scalars(
            select(Refund)
            .where(
                Refund.state == RefundState.PENDING,
                Refund.provider_refund_id.is_not(None),
                Refund.created_at <= created_before,
            )
            .options(selectinload(Refund.payment))
            .order_by(Refund.created_at, Refund.id)
            .limit(limit)
        )
        return list(refunds)

    async def create_refund(
        self,
        payment: Payment,
        *,
        requested_by: UUID,
        reason: str,
        idempotency_key: str,
        request_fingerprint: str,
    ) -> Refund:
        refund = Refund(
            payment_id=payment.id,
            payment=payment,
            amount_agorot=payment.amount_agorot,
            currency=payment.currency,
            reason=reason,
            provider=payment.provider,
            state=RefundState.PENDING,
            requested_by=requested_by,
            idempotency_key=idempotency_key,
            request_fingerprint=request_fingerprint,
        )
        self.session.add(refund)
        await self.session.flush()
        return refund

    async def set_refund_provider_result(self, refund: Refund, *, provider_refund_id: str) -> None:
        refund.provider_refund_id = provider_refund_id
        await self.session.flush()

    async def insert_provider_event(
        self, event: ProviderEvent, *, received_at: datetime
    ) -> ProviderEventRecord | None:
        event_id = await self.session.scalar(
            insert(ProviderEventRecord)
            .values(
                provider=event.provider,
                external_event_id=event.event_id,
                event_type=event.event_type,
                resource=event.resource,
                provider_object_id=event.provider_object_id,
                payload=event.payload,
                received_at=received_at,
                result_metadata={},
                error_metadata={},
            )
            .on_conflict_do_nothing(
                index_elements=[
                    ProviderEventRecord.provider,
                    ProviderEventRecord.external_event_id,
                ]
            )
            .returning(ProviderEventRecord.id)
        )
        if event_id is None:
            return None
        return await self.session.get(ProviderEventRecord, event_id)

    async def flush(self) -> None:
        await self.session.flush()
