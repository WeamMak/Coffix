from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.auth.providers import OtpProvider
from coffix.auth.schemas import (
    AuthTokens,
    LogoutRequest,
    OtpRequest,
    OtpRequestAccepted,
    OtpVerify,
    RefreshRequest,
)
from coffix.auth.service import AuthService, RequestSignals, SessionRepository
from coffix.core.clock import Clock
from coffix.core.database import get_session
from coffix.core.ids import IdGenerator
from coffix.core.rate_limit import RateLimiter
from coffix.users.repository import UserRepository

GENERIC_OTP_MESSAGE = "If the phone number is eligible, a verification code was sent."

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


def get_otp_provider(request: Request) -> OtpProvider:
    return request.app.state.otp_provider


def get_rate_limiter(request: Request) -> RateLimiter:
    return request.app.state.rate_limiter


def get_clock(request: Request) -> Clock:
    return request.app.state.clock


def get_id_generator(request: Request) -> IdGenerator:
    return request.app.state.id_generator


OtpProviderDep = Annotated[OtpProvider, Depends(get_otp_provider)]
RateLimiterDep = Annotated[RateLimiter, Depends(get_rate_limiter)]
ClockDep = Annotated[Clock, Depends(get_clock)]
IdGeneratorDep = Annotated[IdGenerator, Depends(get_id_generator)]


def request_signals(request: Request) -> RequestSignals:
    return RequestSignals(
        ip_address=request.client.host if request.client is not None else "unknown",
        device_signal=request.headers.get("X-Device-ID"),
    )


def service_for(
    request: Request,
    session: AsyncSession,
    otp_provider: OtpProvider,
    rate_limiter: RateLimiter,
    clock: Clock,
    ids: IdGenerator,
) -> AuthService:
    return AuthService(
        users=UserRepository(session),
        sessions=SessionRepository(session),
        otp_provider=otp_provider,
        rate_limiter=rate_limiter,
        clock=clock,
        ids=ids,
        settings=request.app.state.settings,
    )


@router.post("/otp/request", status_code=status.HTTP_202_ACCEPTED)
async def request_otp(
    data: OtpRequest,
    request: Request,
    session: SessionDep,
    otp_provider: OtpProviderDep,
    rate_limiter: RateLimiterDep,
    clock: ClockDep,
    ids: IdGeneratorDep,
) -> OtpRequestAccepted:
    await service_for(request, session, otp_provider, rate_limiter, clock, ids).request_otp(
        data.phone,
        request_signals(request),
    )
    return OtpRequestAccepted(message=GENERIC_OTP_MESSAGE)


@router.post("/otp/verify")
async def verify_otp(
    data: OtpVerify,
    request: Request,
    session: SessionDep,
    otp_provider: OtpProviderDep,
    rate_limiter: RateLimiterDep,
    clock: ClockDep,
    ids: IdGeneratorDep,
) -> AuthTokens:
    return await service_for(request, session, otp_provider, rate_limiter, clock, ids).verify_otp(
        data.phone,
        data.code,
        request_signals(request),
    )


@router.post("/refresh")
async def refresh(
    data: RefreshRequest,
    request: Request,
    session: SessionDep,
    otp_provider: OtpProviderDep,
    rate_limiter: RateLimiterDep,
    clock: ClockDep,
    ids: IdGeneratorDep,
) -> AuthTokens:
    return await service_for(request, session, otp_provider, rate_limiter, clock, ids).refresh(
        data.refresh_token
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    data: LogoutRequest,
    request: Request,
    session: SessionDep,
    otp_provider: OtpProviderDep,
    rate_limiter: RateLimiterDep,
    clock: ClockDep,
    ids: IdGeneratorDep,
) -> Response:
    await service_for(request, session, otp_provider, rate_limiter, clock, ids).logout(
        data.refresh_token
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
