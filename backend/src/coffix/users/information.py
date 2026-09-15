from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.auth.policies import CustomerActorDep
from coffix.core.database import get_session
from coffix.shop.schemas import ShopAddress
from coffix.shop.service import read_shop_settings

router = APIRouter(prefix="/api/v1/app-info", tags=["profile"])


class AppInformation(BaseModel):
    phone: str | None
    whatsapp: str | None
    email: str | None
    opening_hours: str | None
    address: ShopAddress
    privacy_policy_url: str | None
    service_terms_url: str | None


@router.get("")
async def get_app_information(
    request: Request,
    actor: CustomerActorDep,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AppInformation:
    shop = await read_shop_settings(session)
    settings = request.app.state.settings
    return AppInformation(
        phone=shop.phone,
        whatsapp=shop.whatsapp,
        email=shop.email,
        opening_hours=shop.opening_hours,
        address=shop.shop_address,
        privacy_policy_url=settings.privacy_policy_url,
        service_terms_url=settings.service_terms_url,
    )
