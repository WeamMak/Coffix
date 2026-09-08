"""Staff cookie transport; native clients keep using the body-token endpoints."""

from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, Request, Response

from coffix.api.errors import ApiError
from coffix.auth.router import (
    GENERIC_OTP_MESSAGE,
    ClockDep,
    IdGeneratorDep,
    OtpProviderDep,
    RateLimiterDep,
    SessionDep,
    request_signals,
    service_for,
)
from coffix.auth.schemas import AuthTokens, OtpRequest, OtpRequestAccepted, OtpVerify, WebSession
from coffix.auth.service import AuthService
from coffix.auth.tokens import decode_access_token

COOKIE_NAME = "coffix_web_refresh"
COOKIE_PATH = "/api/v1/auth/web"


def dashboard_origin(url: str) -> str:
    parsed = urlsplit(url)
    return f"{parsed.scheme}://{parsed.netloc}"


def require_web_origin(request: Request) -> None:
    expected_origin = dashboard_origin(request.app.state.settings.admin_public_url)
    if (
        request.headers.get("origin") != expected_origin
        or request.headers.get("x-csrf-protection") != "1"
        or request.headers.get("sec-fetch-site") == "cross-site"
    ):
        raise ApiError(status=403, code="web_origin_denied", title="Dashboard origin required")


router = APIRouter(
    prefix=COOKIE_PATH, tags=["web authentication"], dependencies=[Depends(require_web_origin)]
)


def get_auth_service(
    request: Request,
    session: SessionDep,
    otp_provider: OtpProviderDep,
    rate_limiter: RateLimiterDep,
    clock: ClockDep,
    ids: IdGeneratorDep,
) -> AuthService:
    return service_for(request, session, otp_provider, rate_limiter, clock, ids)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


def cookie_session(tokens: AuthTokens, response: Response, service: AuthService) -> WebSession:
    claims = decode_access_token(
        tokens.access_token,
        public_key=service.settings.jwt_public_key,
        now=service.clock.now(),
    )
    if claims.role not in ("admin", "technician"):
        raise ApiError(status=403, code="staff_required", title="Staff access required")
    response.set_cookie(
        COOKIE_NAME,
        tokens.refresh_token,
        max_age=service.settings.refresh_token_ttl_days * 86400,
        path=COOKIE_PATH,
        secure=True,
        httponly=True,
        samesite="strict",
    )
    response.headers["Cache-Control"] = "no-store"
    return WebSession(
        access_token=tokens.access_token,
        user_id=claims.user_id,
        role="admin" if claims.role == "admin" else "technician",
    )


@router.post("/otp/request", status_code=202)
async def request_web_otp(
    data: OtpRequest, request: Request, service: AuthServiceDep
) -> OtpRequestAccepted:
    await service.request_otp(data.phone, request_signals(request))
    return OtpRequestAccepted(message=GENERIC_OTP_MESSAGE)


@router.post("/otp/verify")
async def verify_web_otp(
    data: OtpVerify, request: Request, response: Response, service: AuthServiceDep
) -> WebSession:
    tokens = await service.verify_otp(
        data.phone, data.code, request_signals(request), staff_only=True
    )
    return cookie_session(tokens, response, service)


@router.post("/refresh")
async def refresh_web_session(
    request: Request, response: Response, service: AuthServiceDep
) -> WebSession:
    tokens = await service.refresh(request.cookies.get(COOKIE_NAME, ""), staff_only=True)
    return cookie_session(tokens, response, service)


@router.post("/logout", status_code=204)
async def logout_web_session(request: Request, service: AuthServiceDep) -> Response:
    await service.logout(request.cookies.get(COOKIE_NAME, ""))
    response = Response(status_code=204, headers={"Cache-Control": "no-store"})
    response.delete_cookie(
        COOKIE_NAME, path=COOKIE_PATH, secure=True, httponly=True, samesite="strict"
    )
    return response
