from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from coffix.machines.models import MachineSource, RegisteredMachine
from coffix.orders.models import Order, OrderItem


class MachineRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_order_for_registration(self, order_id: UUID) -> Order | None:
        return await self.session.scalar(
            select(Order)
            .where(Order.id == order_id)
            .options(selectinload(Order.items))
            .with_for_update(of=Order)
        )

    async def list_for_order(self, order_id: UUID) -> list[RegisteredMachine]:
        machines = await self.session.scalars(
            select(RegisteredMachine)
            .join(OrderItem, OrderItem.id == RegisteredMachine.source_order_item_id)
            .where(OrderItem.order_id == order_id)
            .order_by(
                RegisteredMachine.source_order_item_id,
                RegisteredMachine.source_unit_index,
            )
        )
        return list(machines)

    async def create_order_registration(
        self,
        *,
        customer_id: UUID,
        machine_model_id: UUID,
        order_item_id: UUID,
        source_unit_index: int,
        purchase_date: date,
        warranty_months: int,
        warranty_end_date: date,
    ) -> RegisteredMachine:
        machine = RegisteredMachine(
            customer_id=customer_id,
            machine_model_id=machine_model_id,
            serial_number=None,
            serial_pending=True,
            source=MachineSource.ORDER,
            source_order_item_id=order_item_id,
            source_unit_index=source_unit_index,
            purchase_date=purchase_date,
            warranty_start_date=purchase_date,
            warranty_end_date=warranty_end_date,
            warranty_months=warranty_months,
        )
        self.session.add(machine)
        await self.session.flush()
        return machine
