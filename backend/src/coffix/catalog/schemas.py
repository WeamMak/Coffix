from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

Currency = Literal["ILS"]
ProductSortField = Literal["created_at", "name_he"]
SortDirection = Literal["asc", "desc"]


class CatalogSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CategoryCreate(CatalogSchema):
    name_he: str = Field(min_length=1, max_length=120)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)
    image_key: str | None = Field(default=None, max_length=512)
    icon_key: str | None = Field(default=None, min_length=1, max_length=50)
    sort_order: int = Field(default=0, ge=0)
    is_active: bool = True


class CategoryUpdate(CatalogSchema):
    name_he: str | None = Field(default=None, min_length=1, max_length=120)
    slug: str | None = Field(
        default=None,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
        max_length=80,
    )
    image_key: str | None = Field(default=None, max_length=512)
    icon_key: str | None = Field(default=None, min_length=1, max_length=50)
    sort_order: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class CategoryRead(CatalogSchema):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: UUID
    name_he: str
    slug: str
    image_key: str | None
    icon_key: str | None
    sort_order: int
    is_active: bool


class CatalogCategoryRead(CatalogSchema):
    id: UUID
    name_he: str
    slug: str
    sort_order: int
    is_active: bool
    image_url: str | None = None
    icon_key: str | None = None
    product_count: int


class ProductCreate(CatalogSchema):
    category_id: UUID
    name_he: str = Field(min_length=1, max_length=160)
    description_he: str = Field(min_length=1, max_length=5000)
    admin_label_en: str | None = Field(default=None, max_length=160)
    product_type: str = Field(min_length=1, max_length=40)
    is_featured: bool = False
    is_active: bool = True


class ProductUpdate(CatalogSchema):
    category_id: UUID | None = None
    name_he: str | None = Field(default=None, min_length=1, max_length=160)
    description_he: str | None = Field(default=None, min_length=1, max_length=5000)
    admin_label_en: str | None = Field(default=None, max_length=160)
    product_type: str | None = Field(default=None, min_length=1, max_length=40)
    is_featured: bool | None = None
    is_active: bool | None = None


class SkuCreate(CatalogSchema):
    sku_code: str = Field(min_length=1, max_length=80)
    attributes: dict[str, str] = Field(default_factory=dict)
    price_agorot: int = Field(ge=0)
    currency: Currency = "ILS"
    stock_quantity: int | None = Field(default=None, ge=0)
    is_active: bool = True
    machine_model_id: UUID | None = None


class SkuUpdate(CatalogSchema):
    sku_code: str | None = Field(default=None, min_length=1, max_length=80)
    attributes: dict[str, str] | None = None
    price_agorot: int | None = Field(default=None, ge=0)
    currency: Currency | None = None
    is_active: bool | None = None
    machine_model_id: UUID | None = None


class SkuRead(CatalogSchema):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: UUID
    sku_code: str
    attributes: dict[str, str]
    price_agorot: int
    currency: Currency
    stock_quantity: int | None
    is_active: bool
    machine_model_id: UUID | None


class ProductRead(CatalogSchema):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: UUID
    category_id: UUID
    name_he: str
    description_he: str
    admin_label_en: str | None
    product_type: str
    is_featured: bool
    is_active: bool
    skus: list[SkuRead]
    created_at: datetime
    updated_at: datetime


class CatalogProductMediaRead(CatalogSchema):
    id: UUID
    sku_id: UUID | None
    media_type: str
    sort_order: int
    alt_text_he: str
    url: str


class CatalogProductRead(CatalogSchema):
    id: UUID
    category_id: UUID
    name_he: str
    description_he: str
    product_type: str
    is_featured: bool
    is_active: bool
    skus: list[SkuRead]
    media: list[CatalogProductMediaRead]
    created_at: datetime
    updated_at: datetime


class ProductListParams(CatalogSchema):
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)
    category_id: UUID | None = None
    featured: bool | None = None
    product_type: str | None = Field(default=None, min_length=1, max_length=40)
    q: str | None = Field(default=None, max_length=160)
    sort_by: ProductSortField = "created_at"
    sort_direction: SortDirection = "desc"

    @computed_field
    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit

    @field_validator("q", mode="before")
    @classmethod
    def normalize_query(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        normalized = value.strip()
        return normalized or None


class ProductListRead(CatalogSchema):
    items: list[ProductRead]
    page: int
    limit: int
    total: int


class CatalogProductListRead(CatalogSchema):
    items: list[CatalogProductRead]
    page: int
    limit: int
    total: int


class MachineModelCreate(CatalogSchema):
    manufacturer: str = Field(min_length=1, max_length=120)
    model_name: str = Field(min_length=1, max_length=120)
    serial_pattern: str | None = Field(default=None, max_length=255)
    default_warranty_months: int = Field(default=12, ge=0)
    is_active: bool = True


class MachineModelUpdate(CatalogSchema):
    manufacturer: str | None = Field(default=None, min_length=1, max_length=120)
    model_name: str | None = Field(default=None, min_length=1, max_length=120)
    serial_pattern: str | None = Field(default=None, max_length=255)
    default_warranty_months: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class MachineModelRead(CatalogSchema):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: UUID
    manufacturer: str
    model_name: str
    serial_pattern: str | None
    default_warranty_months: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
