from datetime import UTC, datetime, timedelta
from io import BytesIO
from uuid import UUID

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from coffix.core.clock import FakeClock
from coffix.core.settings import Settings
from coffix.media.adapters.s3 import S3MediaStore
from coffix.media.store import UploadRequest, create_media_store

NOW = datetime(2026, 8, 31, 14, 0, tzinfo=UTC)
UPLOAD_ID = UUID("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")
JPEG = b"\xff\xd8\xff\xe0photo-data"


class FakeS3Client:
    def __init__(self, *, is_public: bool = False) -> None:
        self.is_public = is_public
        self.deleted: list[dict[str, str]] = []
        self.presigned: list[tuple[str, dict[str, object], int]] = []

    def generate_presigned_url(
        self,
        operation: str,
        *,
        Params: dict[str, object],
        ExpiresIn: int,
    ) -> str:
        self.presigned.append((operation, Params, ExpiresIn))
        return f"https://s3.test/{operation}/{Params['Key']}"

    def head_object(self, **_kwargs: str) -> dict[str, object]:
        return {"ContentLength": len(JPEG), "ContentType": "image/jpeg"}

    def get_object(self, **_kwargs: str) -> dict[str, object]:
        return {"Body": BytesIO(JPEG)}

    def delete_object(self, **kwargs: str) -> None:
        self.deleted.append(kwargs)

    def get_public_access_block(self, **_kwargs: str) -> dict[str, object]:
        return {
            "PublicAccessBlockConfiguration": {
                "BlockPublicAcls": True,
                "IgnorePublicAcls": True,
                "BlockPublicPolicy": True,
                "RestrictPublicBuckets": True,
            }
        }

    def get_bucket_policy_status(self, **_kwargs: str) -> dict[str, object]:
        return {"PolicyStatus": {"IsPublic": self.is_public}}

    def get_bucket_acl(self, **_kwargs: str) -> dict[str, object]:
        return {"Grants": []}


@pytest.mark.asyncio
async def test_s3_store_presigns_private_encrypted_upload_and_download() -> None:
    client = FakeS3Client()
    store = S3MediaStore(
        client=client,
        bucket="private-media",
        prefix="test/",
        clock=FakeClock(NOW),
        ttl_seconds=120,
    )

    await store.validate_private_bucket()
    target = await store.create_upload(
        UploadRequest(
            upload_id=UPLOAD_ID,
            content_type="image/jpeg",
            size_bytes=len(JPEG),
        )
    )
    stored = await store.complete_upload(UPLOAD_ID)
    download_url = await store.create_download_url(stored.object_key)

    assert target.method == "PUT"
    assert target.expires_at == NOW + timedelta(seconds=120)
    assert target.headers == {
        "Content-Type": "image/jpeg",
        "x-amz-server-side-encryption": "AES256",
    }
    assert stored.object_key.startswith("test/media/")
    assert stored.header == JPEG
    assert download_url.startswith("https://s3.test/get_object/test/media/")
    assert client.presigned[0][0] == "put_object"
    assert client.presigned[0][1]["Bucket"] == "private-media"
    assert client.presigned[0][1]["ServerSideEncryption"] == "AES256"


@pytest.mark.asyncio
async def test_production_s3_store_rejects_public_bucket_and_key_traversal() -> None:
    store = S3MediaStore(
        client=FakeS3Client(is_public=True),
        bucket="public-media",
        prefix="prod/",
        clock=FakeClock(NOW),
        ttl_seconds=120,
    )

    with pytest.raises(ValueError, match="private"):
        await store.validate_private_bucket()
    with pytest.raises(ValueError, match="object key"):
        await store.create_download_url("../secret")


@pytest.mark.asyncio
async def test_production_store_factory_fails_closed_for_public_bucket(monkeypatch) -> None:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public_pem = private_key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    settings = Settings(
        app_env="prod",
        otp_provider="twilio",
        otp_dev_code=None,
        twilio_account_sid="account",
        twilio_auth_token="token",
        twilio_verify_service_sid="service",
        jwt_private_key=private_pem,
        jwt_public_key=public_pem,
        media_storage_backend="s3",
        media_s3_bucket="public-media",
        media_s3_prefix="prod/",
    )
    monkeypatch.setattr("boto3.client", lambda _service: FakeS3Client(is_public=True))

    with pytest.raises(ValueError, match="private"):
        await create_media_store(settings, FakeClock(NOW))
