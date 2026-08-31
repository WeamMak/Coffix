import calendar
from datetime import date

from coffix.api.errors import ApiError
from coffix.core.clock import Clock
from coffix.core.types import MachineId, OrderId
from coffix.machines.repository import MachineRepository
from coffix.orders.models import OrderState


def calculate_warranty_end(purchase_date: date, warranty_months: int) -> date:
    if warranty_months < 0:
        raise ValueError("warranty months must be non-negative")
    month_index = purchase_date.month - 1 + warranty_months
    year = purchase_date.year + month_index // 12
    month = month_index % 12 + 1
    day = min(purchase_date.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


class MachineRegistrationService:
    def __init__(self, machines: MachineRepository, *, clock: Clock) -> None:
        self.machines = machines
        self.clock = clock

    async def register_order_machines(self, order_id: OrderId) -> list[MachineId]:
        order = await self.machines.get_order_for_registration(order_id)
        if order is None:
            raise ApiError(status=404, code="ORDER_NOT_FOUND", title="Order not found")
        if order.state is not OrderState.PAID:
            raise ApiError(
                status=409,
                code="ORDER_NOT_PAID",
                title="Machines can only be registered for a paid order",
            )
        existing = await self.machines.list_for_order(order.id)
        registrations = {
            (machine.source_order_item_id, machine.source_unit_index): machine
            for machine in existing
        }
        purchase_date = self.clock.now().date()
        for item in order.items:
            if item.machine_model_id is None:
                continue
            warranty_months = item.machine_warranty_months
            if warranty_months is None:
                warranty_months = 12
            for unit_index in range(1, item.quantity + 1):
                key = (item.id, unit_index)
                if key in registrations:
                    continue
                registrations[key] = await self.machines.create_order_registration(
                    customer_id=order.customer_id,
                    machine_model_id=item.machine_model_id,
                    order_item_id=item.id,
                    source_unit_index=unit_index,
                    purchase_date=purchase_date,
                    warranty_months=warranty_months,
                    warranty_end_date=calculate_warranty_end(purchase_date, warranty_months),
                )
        return [
            machine.id
            for machine in sorted(
                registrations.values(),
                key=lambda machine: (
                    str(machine.source_order_item_id),
                    machine.source_unit_index or 0,
                ),
            )
        ]
