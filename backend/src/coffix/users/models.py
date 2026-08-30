from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, func, text
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.orm import Mapped, mapped_column

from coffix.core.database import Base


class Role(StrEnum):
    CUSTOMER = "customer"
    ADMIN = "admin"
    TECHNICIAN = "technician"


role_type = SqlEnum(
    Role,
    name="user_role",
    native_enum=False,
    create_constraint=False,
    validate_strings=True,
    values_callable=lambda roles: [role.value for role in roles],
)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('customer', 'admin', 'technician')",
            name="valid_role",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    phone_e164: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    role: Mapped[Role] = mapped_column(role_type)
    display_name: Mapped[str | None] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Address(Base):
    __tablename__ = "addresses"
    __table_args__ = (
        CheckConstraint("country = 'IL'", name="country_is_il"),
        Index(
            "uq_addresses_default_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("is_default"),
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    recipient_name: Mapped[str] = mapped_column(String(120))
    phone_e164: Mapped[str] = mapped_column(String(16))
    street: Mapped[str] = mapped_column(String(120))
    building: Mapped[str] = mapped_column(String(30))
    apartment: Mapped[str | None] = mapped_column(String(30))
    city: Mapped[str] = mapped_column(String(80))
    postal_code: Mapped[str | None] = mapped_column(String(12))
    country: Mapped[str] = mapped_column(String(2), default="IL", server_default="IL")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
