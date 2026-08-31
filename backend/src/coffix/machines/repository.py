from datetime import date
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from coffix.machines.models import MachineModel, MachineSource, RegisteredMachine
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

    async def get_active_model(self, model_id: UUID) -> MachineModel | None:
        return await self.session.scalar(
            select(MachineModel).where(
                MachineModel.id == model_id,
                MachineModel.is_active.is_(True),
            )
        )

    async def get_model(self, model_id: UUID) -> MachineModel | None:
        return await self.session.get(MachineModel, model_id)

    async def lock_serial(self, machine_model_id: UUID, serial_number: str) -> None:
        await self.session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:lock_key, 0))"),
            {"lock_key": f"machine-serial:{machine_model_id}:{serial_number}"},
        )

    async def get_by_model_serial(
        self,
        machine_model_id: UUID,
        serial_number: str,
    ) -> RegisteredMachine | None:
        return await self.session.scalar(
            select(RegisteredMachine).where(
                RegisteredMachine.machine_model_id == machine_model_id,
                RegisteredMachine.serial_number == serial_number,
            )
        )

    async def get_by_model_serial_for_admin(
        self,
        machine_model_id: UUID,
        serial_number: str,
    ) -> RegisteredMachine | None:
        return await self.session.scalar(
            select(RegisteredMachine)
            .where(
                RegisteredMachine.machine_model_id == machine_model_id,
                RegisteredMachine.serial_number == serial_number,
            )
            .with_for_update()
        )

    async def release_serial_for_admin(self, machine: RegisteredMachine) -> None:
        machine.serial_number = None
        machine.serial_pending = True
        await self.session.flush()

    async def transfer_ownership_for_admin(
        self,
        machine: RegisteredMachine,
        customer_id: UUID,
    ) -> None:
        machine.customer_id = customer_id
        await self.session.flush()

    async def create_manual_registration(
        self,
        *,
        customer_id: UUID,
        machine_model_id: UUID,
        serial_number: str,
        purchase_date: date | None,
    ) -> RegisteredMachine:
        machine = RegisteredMachine(
            customer_id=customer_id,
            machine_model_id=machine_model_id,
            serial_number=serial_number,
            serial_pending=False,
            source=MachineSource.MANUAL,
            source_order_item_id=None,
            source_unit_index=None,
            purchase_date=purchase_date,
            warranty_start_date=None,
            warranty_end_date=None,
            warranty_months=None,
        )
        self.session.add(machine)
        await self.session.flush()
        return machine

    async def get_for_customer_for_update(
        self,
        machine_id: UUID,
        customer_id: UUID,
    ) -> RegisteredMachine | None:
        return await self.session.scalar(
            select(RegisteredMachine)
            .where(
                RegisteredMachine.id == machine_id,
                RegisteredMachine.customer_id == customer_id,
            )
            .with_for_update()
        )

    async def list_for_customer_with_models(
        self,
        customer_id: UUID,
    ) -> list[tuple[RegisteredMachine, MachineModel]]:
        rows = await self.session.execute(
            select(RegisteredMachine, MachineModel)
            .join(MachineModel, MachineModel.id == RegisteredMachine.machine_model_id)
            .where(RegisteredMachine.customer_id == customer_id)
            .order_by(RegisteredMachine.created_at.desc(), RegisteredMachine.id)
        )
        return list(rows.tuples())

    async def get_for_customer_with_model(
        self,
        machine_id: UUID,
        customer_id: UUID,
    ) -> tuple[RegisteredMachine, MachineModel] | None:
        row = (
            await self.session.execute(
                select(RegisteredMachine, MachineModel)
                .join(MachineModel, MachineModel.id == RegisteredMachine.machine_model_id)
                .where(
                    RegisteredMachine.id == machine_id,
                    RegisteredMachine.customer_id == customer_id,
                )
            )
        ).one_or_none()
        if row is None:
            return None
        return row[0], row[1]

    async def assign_serial(
        self,
        machine: RegisteredMachine,
        serial_number: str,
    ) -> RegisteredMachine:
        machine.serial_number = serial_number
        machine.serial_pending = False
        await self.session.flush()
        await self.session.refresh(machine)
        return machine

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
