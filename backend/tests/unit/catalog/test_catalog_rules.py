from uuid import uuid4

import pytest
from pydantic import ValidationError

from coffix.catalog.schemas import MachineModelCreate, ProductListParams, SkuCreate, SkuUpdate


def test_sku_price_is_non_negative_ils_and_stock_is_nullable() -> None:
    unlimited = SkuCreate(sku_code="BEANS-1KG", price_agorot=8900, stock_quantity=None)
    tracked = SkuCreate(sku_code="BEANS-250G", price_agorot=2900, stock_quantity=7)

    assert unlimited.currency == "ILS"
    assert unlimited.stock_quantity is None
    assert tracked.stock_quantity == 7

    with pytest.raises(ValidationError):
        SkuCreate(sku_code="NEGATIVE-PRICE", price_agorot=-1)
    with pytest.raises(ValidationError):
        SkuCreate.model_validate(
            {"sku_code": "USD-SKU", "price_agorot": 100, "currency": "USD"}
        )
    with pytest.raises(ValidationError):
        SkuCreate(sku_code="NEGATIVE-STOCK", price_agorot=100, stock_quantity=-1)


def test_catalog_query_uses_bounded_pagination_and_explicit_filter_sort_fields() -> None:
    category_id = uuid4()
    query = ProductListParams(
        page=2,
        limit=25,
        category_id=category_id,
        featured=True,
        product_type="coffee_machine",
        sort_by="name_he",
        sort_direction="desc",
    )

    assert query.category_id == category_id
    assert query.offset == 25

    with pytest.raises(ValidationError):
        ProductListParams(limit=101)
    with pytest.raises(ValidationError):
        ProductListParams.model_validate({"sort_by": "price_agorot"})
    with pytest.raises(ValidationError):
        ProductListParams.model_validate(
            {"page": 1, "limit": 20, "arbitrary_filter": "unsafe"}
        )


def test_generic_sku_updates_cannot_mutate_stock() -> None:
    assert "stock_quantity" not in SkuUpdate.model_fields


def test_machine_model_warranty_defaults_to_twelve_months() -> None:
    model = MachineModelCreate(manufacturer="Lelit", model_name="Bianca V3")

    assert model.default_warranty_months == 12
