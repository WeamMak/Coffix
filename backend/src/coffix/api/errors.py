import logging
from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)


class ApiError(Exception):
    def __init__(
        self,
        *,
        status: int,
        code: str,
        title: str,
        detail: str | None = None,
        errors: dict[str, list[str]] | None = None,
    ) -> None:
        super().__init__(detail or title)
        self.status = status
        self.code = code
        self.title = title
        self.detail = detail
        self.errors = errors


def problem_response(
    request: Request,
    *,
    status: int,
    code: str,
    title: str,
    detail: str | None = None,
    errors: dict[str, list[str]] | None = None,
) -> JSONResponse:
    content: dict[str, Any] = {
        "type": f"https://coffix.app/problems/{code}",
        "title": title,
        "status": status,
        "code": code,
        "correlationId": getattr(request.state, "correlation_id", "unknown"),
    }
    if detail is not None:
        content["detail"] = detail
    if errors:
        content["errors"] = errors
    return JSONResponse(status_code=status, content=content, media_type="application/problem+json")


async def api_error_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, ApiError):
        raise exc
    return problem_response(
        request,
        status=exc.status,
        code=exc.code,
        title=exc.title,
        detail=exc.detail,
        errors=exc.errors,
    )


async def http_error_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, HTTPException):
        raise exc
    code = "not_found" if exc.status_code == 404 else "http_error"
    title = "Resource not found" if exc.status_code == 404 else "Request failed"
    detail = exc.detail if isinstance(exc.detail, str) and exc.status_code != 404 else None
    return problem_response(request, status=exc.status_code, code=code, title=title, detail=detail)


async def validation_error_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, RequestValidationError):
        raise exc
    errors: dict[str, list[str]] = {}
    for error in exc.errors():
        location = ".".join(str(part) for part in error["loc"])
        errors.setdefault(location, []).append(str(error["msg"]))
    return problem_response(
        request,
        status=422,
        code="validation_error",
        title="Request validation failed",
        errors=errors,
    )


async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled API error", exc_info=exc)
    return problem_response(
        request,
        status=500,
        code="internal_error",
        title="Internal server error",
    )
