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
