from fastapi import APIRouter, Request
from pydantic import BaseModel, ValidationError

from coffix.api.errors import ApiError
from coffix.auth.policies import CustomerActorDep

router = APIRouter(prefix="/api/v1/app-info", tags=["profile"])


class ShopAddress(BaseModel):
    street: str | None = None
    building: str | None = None
    city: str | None = None
    postal_code: str | None = None
    country: str = "IL"


class AppInformation(BaseModel):
    phone: str | None
    whatsapp: str | None
    opening_hours: str | None
    address: ShopAddress
    privacy_policy_url: str | None
    service_terms_url: str | None


@router.get("")
def get_app_information(request: Request, actor: CustomerActorDep) -> AppInformation:
    settings = request.app.state.settings
    try:
        address = ShopAddress.model_validate_json(settings.shop_address_json)
    except ValidationError as exc:
        raise ApiError(
            status=503, code="app_info_unavailable", title="Shop details unavailable"
        ) from exc
    return AppInformation(
        phone=settings.shop_phone,
        whatsapp=settings.shop_whatsapp,
        opening_hours=settings.shop_hours,
        address=address,
        privacy_policy_url=settings.privacy_policy_url,
        service_terms_url=settings.service_terms_url,
    )
