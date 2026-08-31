from __future__ import annotations

import asyncio
import hashlib
import hmac
from datetime import timedelta
from pathlib import Path, PurePosixPath
from urllib.parse import urlencode
from uuid import UUID

from coffix.core.clock import Clock
from coffix.media.store import (
    StoredMedia,
    UploadRequest,
    UploadTarget,
    object_key_for_upload,
)


class LocalMediaStore:
    def __init__(
        self,
        *,
        root: str | Path,
        api_public_url: str,
        signing_secret: str,
        clock: Clock,
        ttl_seconds: int,
    ) -> None:
        self.root = Path(root).resolve()
        self.api_public_url = api_public_url.rstrip("/")
        self.signing_secret = signing_secret.encode()
        self.clock = clock
        self.ttl_seconds = ttl_seconds

    async def create_upload(self, request: UploadRequest) -> UploadTarget:
        return UploadTarget(
            url=f"{self.api_public_url}/api/v1/media/uploads/{request.upload_id}/content",
            method="PUT",
            headers={"Content-Type": request.content_type},
            expires_at=self.clock.now() + self._ttl(),
        )

    def object_key_for(self, upload_id: UUID) -> str:
        return object_key_for_upload(upload_id)

    async def put_upload(
        self,
        upload_id: UUID,
        *,
        content: bytes,
        content_type: str,
    ) -> None:
        object_key = self.object_key_for(upload_id)
        path = self._path_for(object_key)
        await asyncio.to_thread(self._write, path, content, content_type)

    async def complete_upload(self, upload_id: UUID) -> StoredMedia:
        object_key = self.object_key_for(upload_id)
        path = self._path_for(object_key)
        try:
            content_type, size_bytes, header = await asyncio.to_thread(self._inspect, path)
        except FileNotFoundError as exc:
            raise ValueError("uploaded object was not found") from exc
        return StoredMedia(
            object_key=object_key,
            content_type=content_type,
            size_bytes=size_bytes,
            header=header,
        )

    async def create_download_url(self, object_key: str) -> str:
        self._path_for(object_key)
        expires = int(self.clock.now().timestamp()) + self.ttl_seconds
        signature = self._sign(object_key, expires)
        query = urlencode(
            {"key": object_key, "expires": str(expires), "signature": signature}
        )
        return f"{self.api_public_url}/api/v1/media/local/content?{query}"

    async def read_download(
        self,
        *,
        object_key: str,
        expires: int,
        signature: str,
    ) -> bytes:
        path, _ = await self.open_download(
            object_key=object_key,
            expires=expires,
            signature=signature,
        )
        try:
            return await asyncio.to_thread(path.read_bytes)
        except FileNotFoundError as exc:
            raise ValueError("stored object was not found") from exc

    async def open_download(
        self,
        *,
        object_key: str,
        expires: int,
        signature: str,
    ) -> tuple[Path, str]:
        if int(self.clock.now().timestamp()) >= expires:
            raise ValueError("download URL has expired")
        expected = self._sign(object_key, expires)
        if not hmac.compare_digest(expected, signature):
            raise ValueError("invalid download signature")
        path = self._path_for(object_key)
        try:
            content_type = await asyncio.to_thread(
                self._metadata_path(path).read_text,
                encoding="utf-8",
            )
            await asyncio.to_thread(path.stat)
        except FileNotFoundError as exc:
            raise ValueError("stored object was not found") from exc
        return path, content_type

    async def delete_object(self, object_key: str) -> None:
        path = self._path_for(object_key)
        await asyncio.to_thread(self._delete, path)

    def _path_for(self, object_key: str) -> Path:
        key = PurePosixPath(object_key)
        if (
            key.is_absolute()
            or not key.parts
            or any(part in {"", ".", ".."} for part in key.parts)
            or "\\" in object_key
        ):
            raise ValueError("invalid object key")
        path = (self.root / Path(*key.parts)).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("invalid object key")
        return path

    def _sign(self, object_key: str, expires: int) -> str:
        return hmac.new(
            self.signing_secret,
            f"{object_key}\n{expires}".encode(),
            hashlib.sha256,
        ).hexdigest()

    def _ttl(self) -> timedelta:
        return timedelta(seconds=self.ttl_seconds)

    @staticmethod
    def _metadata_path(path: Path) -> Path:
        return path.with_name(f"{path.name}.content-type")

    @classmethod
    def _write(cls, path: Path, content: bytes, content_type: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        cls._metadata_path(path).write_text(content_type, encoding="utf-8")

    @classmethod
    def _inspect(cls, path: Path) -> tuple[str, int, bytes]:
        content_type = cls._metadata_path(path).read_text(encoding="utf-8")
        with path.open("rb") as stored:
            header = stored.read(32)
        return content_type, path.stat().st_size, header

    @classmethod
    def _delete(cls, path: Path) -> None:
        path.unlink(missing_ok=True)
        cls._metadata_path(path).unlink(missing_ok=True)
