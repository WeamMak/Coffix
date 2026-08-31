from datetime import date, datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.orm import Mapped, mapped_column

from coffix.core.database import Base


class MachineModel(Base):
    __tablename__ = "machine_models"
    __table_args__ = (
        CheckConstraint(
            "default_warranty_months >= 0",
            name="non_negative_default_warranty_months",
        ),
        UniqueConstraint("manufacturer", "model_name", name="manufacturer_model_name"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    manufacturer: Mapped[str] = mapped_column(String(120))
    model_name: Mapped[str] = mapped_column(String(120))
    serial_pattern: Mapped[str | None] = mapped_column(String(255))
    default_warranty_months: Mapped[int] = mapped_column(default=12, server_default="12")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class MachineSource(StrEnum):
    MANUAL = "manual"
    ORDER = "order"


machine_source_type = SqlEnum(
    MachineSource,
    name="machine_source",
    native_enum=False,
    create_constraint=False,
    validate_strings=True,
    values_callable=lambda sources: [source.value for source in sources],
)


class RegisteredMachine(Base):
    __tablename__ = "registered_machines"
    __table_args__ = (
        CheckConstraint("source IN ('manual', 'order')", name="valid_source"),
        CheckConstraint(
            "serial_pending OR serial_number IS NOT NULL",
            name="serial_present_or_pending",
        ),
        CheckConstraint(
            "source_unit_index IS NULL OR source_unit_index > 0",
            name="positive_source_unit_index",
        ),
        CheckConstraint(
            "warranty_months IS NULL OR warranty_months >= 0",
            name="non_negative_warranty_months",
        ),
        CheckConstraint(
            "warranty_start_date IS NULL OR warranty_end_date >= warranty_start_date",
            name="valid_warranty_period",
        ),
        CheckConstraint(
            "(source = 'order' AND source_order_item_id IS NOT NULL "
            "AND source_unit_index IS NOT NULL AND purchase_date IS NOT NULL "
            "AND warranty_start_date IS NOT NULL AND warranty_end_date IS NOT NULL "
            "AND warranty_months IS NOT NULL) OR "
            "(source = 'manual' AND source_order_item_id IS NULL "
            "AND source_unit_index IS NULL AND warranty_start_date IS NULL "
            "AND warranty_end_date IS NULL AND warranty_months IS NULL)",
            name="source_fields_consistent",
        ),
        UniqueConstraint("machine_model_id", "serial_number", name="model_serial"),
        UniqueConstraint(
            "source_order_item_id",
            "source_unit_index",
            name="source_order_item_unit",
        ),
        Index("ix_registered_machines_customer_created", "customer_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    customer_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    machine_model_id: Mapped[UUID] = mapped_column(
        ForeignKey("machine_models.id", ondelete="RESTRICT"), index=True
    )
    serial_number: Mapped[str | None] = mapped_column(String(160))
    serial_pending: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    source: Mapped[MachineSource] = mapped_column(machine_source_type)
    source_order_item_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("order_items.id", ondelete="RESTRICT"), index=True
    )
    source_unit_index: Mapped[int | None] = mapped_column(Integer)
    purchase_date: Mapped[date | None] = mapped_column(Date)
    warranty_start_date: Mapped[date | None] = mapped_column(Date)
    warranty_end_date: Mapped[date | None] = mapped_column(Date)
    warranty_months: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
