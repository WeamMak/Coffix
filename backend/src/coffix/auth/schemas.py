from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    expires_at: datetime
    revoked_at: datetime | None


class AuthTokens(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"


class OtpRequest(BaseModel):
    phone: str = Field(min_length=9, max_length=24)


class OtpRequestAccepted(BaseModel):
    message: str


class OtpVerify(BaseModel):
    phone: str = Field(min_length=9, max_length=24)
    code: str = Field(pattern=r"^\d{6}$")


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=1)
