from __future__ import annotations

import asyncio
from datetime import timedelta
from pathlib import PurePosixPath
from typing import Any, Protocol
from uuid import UUID

from botocore.exceptions import ClientError

from coffix.core.clock import Clock
from coffix.media.store import (
    StoredMedia,
    UploadRequest,
    UploadTarget,
    object_key_for_upload,
)

PUBLIC_S3_GROUP_SUFFIXES = ("/AllUsers", "/AuthenticatedUsers")


class S3Client(Protocol):
    def generate_presigned_url(
        self,
        operation: str,
        *,
        Params: dict[str, object],
        ExpiresIn: int,
    ) -> str: ...

    def head_object(self, **kwargs: str) -> dict[str, Any]: ...

    def get_object(self, **kwargs: str) -> dict[str, Any]: ...

    def delete_object(self, **kwargs: str) -> Any: ...

    def get_public_access_block(self, **kwargs: str) -> dict[str, Any]: ...

    def get_bucket_policy_status(self, **kwargs: str) -> dict[str, Any]: ...

    def get_bucket_acl(self, **kwargs: str) -> dict[str, Any]: ...


class S3MediaStore:
    def __init__(
        self,
        *,
        client: S3Client,
        bucket: str,
        prefix: str,
        clock: Clock,
        ttl_seconds: int,
    ) -> None:
        self.client = client
        self.bucket = bucket
        normalized_prefix = prefix.strip("/")
        if normalized_prefix:
            self._validate_key(normalized_prefix)
        self.prefix = f"{normalized_prefix}/" if normalized_prefix else ""
        self.clock = clock
        self.ttl_seconds = ttl_seconds

    async def validate_private_bucket(self) -> None:
        public_access, policy_status, acl = await asyncio.gather(
            asyncio.to_thread(self.client.get_public_access_block, Bucket=self.bucket),
            asyncio.to_thread(self.client.get_bucket_policy_status, Bucket=self.bucket),
            asyncio.to_thread(self.client.get_bucket_acl, Bucket=self.bucket),
        )
        block = public_access.get("PublicAccessBlockConfiguration", {})
        required_blocks = (
            "BlockPublicAcls",
            "IgnorePublicAcls",
            "BlockPublicPolicy",
            "RestrictPublicBuckets",
        )
        policy_is_public = bool(policy_status.get("PolicyStatus", {}).get("IsPublic"))
        acl_is_public = any(self._is_public_grant(grant) for grant in acl.get("Grants", []))
        if not all(block.get(name) is True for name in required_blocks):
            raise ValueError("S3 media bucket must block all public access")
        if policy_is_public or acl_is_public:
            raise ValueError("S3 media bucket must be private")

    async def create_upload(self, request: UploadRequest) -> UploadTarget:
        object_key = self.object_key_for(request.upload_id)
        parameters: dict[str, object] = {
            "Bucket": self.bucket,
            "Key": object_key,
            "ContentType": request.content_type,
            "ContentLength": request.size_bytes,
            "ServerSideEncryption": "AES256",
        }
        url = self.client.generate_presigned_url(
            "put_object",
            Params=parameters,
            ExpiresIn=self.ttl_seconds,
        )
        return UploadTarget(
            url=url,
            method="PUT",
            headers={
                "Content-Type": request.content_type,
                "x-amz-server-side-encryption": "AES256",
            },
            expires_at=self.clock.now() + timedelta(seconds=self.ttl_seconds),
        )

    async def complete_upload(self, upload_id: UUID) -> StoredMedia:
        object_key = self.object_key_for(upload_id)
        try:
            head, header = await asyncio.gather(
                asyncio.to_thread(
                    self.client.head_object,
                    Bucket=self.bucket,
                    Key=object_key,
                ),
                asyncio.to_thread(self._read_header, object_key),
            )
        except ClientError as exc:
            error = exc.response.get("Error", {})
            response = exc.response.get("ResponseMetadata", {})
            if error.get("Code") in {"404", "NoSuchKey", "NotFound"} or response.get(
                "HTTPStatusCode"
            ) == 404:
                raise ValueError("uploaded object was not found") from exc
            raise
        return StoredMedia(
            object_key=object_key,
            content_type=str(head.get("ContentType", "")),
            size_bytes=int(head.get("ContentLength", 0)),
            header=header,
        )

    async def create_download_url(self, object_key: str) -> str:
        self._validate_owned_key(object_key)
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": object_key},
            ExpiresIn=self.ttl_seconds,
        )

    async def delete_object(self, object_key: str) -> None:
        self._validate_owned_key(object_key)
        await asyncio.to_thread(
            self.client.delete_object,
            Bucket=self.bucket,
            Key=object_key,
        )

    def object_key_for(self, upload_id: UUID) -> str:
        return f"{self.prefix}{object_key_for_upload(upload_id)}"

    def _validate_owned_key(self, object_key: str) -> None:
        self._validate_key(object_key)
        if self.prefix and not object_key.startswith(self.prefix):
            raise ValueError("invalid object key")

    @staticmethod
    def _validate_key(object_key: str) -> None:
        key = PurePosixPath(object_key)
        if (
            key.is_absolute()
            or not key.parts
            or any(part in {"", ".", ".."} for part in key.parts)
            or "\\" in object_key
        ):
            raise ValueError("invalid object key")

    def _read_header(self, object_key: str) -> bytes:
        response = self.client.get_object(
            Bucket=self.bucket,
            Key=object_key,
            Range="bytes=0-31",
        )
        body = response["Body"]
        try:
            return bytes(body.read(32))
        finally:
            close = getattr(body, "close", None)
            if callable(close):
                close()

    @staticmethod
    def _is_public_grant(grant: Any) -> bool:
        if not isinstance(grant, dict):
            return False
        grantee = grant.get("Grantee", {})
        if not isinstance(grantee, dict):
            return False
        uri = str(grantee.get("URI", ""))
        return uri.endswith(PUBLIC_S3_GROUP_SUFFIXES)
