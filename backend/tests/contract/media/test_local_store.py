from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse
from uuid import UUID

import pytest

from coffix.core.clock import FakeClock
from coffix.media.adapters.local import LocalMediaStore
from coffix.media.store import UploadRequest, object_key_for_upload

NOW = datetime(2026, 8, 31, 14, 0, tzinfo=UTC)
UPLOAD_ID = UUID("11111111-2222-4333-8444-555555555555")
JPEG = b"\xff\xd8\xff\xe0" + b"photo-data"


@pytest.mark.asyncio
async def test_local_store_upload_complete_and_short_lived_download(tmp_path) -> None:
    clock = FakeClock(NOW)
    store = LocalMediaStore(
        root=tmp_path,
        api_public_url="http://test",
        signing_secret="test-media-secret",
        clock=clock,
        ttl_seconds=60,
    )

    target = await store.create_upload(
        UploadRequest(
            upload_id=UPLOAD_ID,
            content_type="image/jpeg",
            size_bytes=len(JPEG),
        )
    )
    await store.put_upload(
        UPLOAD_ID,
        content=JPEG,
        content_type="image/jpeg",
    )
    stored = await store.complete_upload(UPLOAD_ID)
    download_url = await store.create_download_url(stored.object_key)
    parsed = urlparse(download_url)
    query = parse_qs(parsed.query)
    downloaded = await store.read_download(
        object_key=query["key"][0],
        expires=int(query["expires"][0]),
        signature=query["signature"][0],
    )

    assert target.method == "PUT"
    assert target.url == f"http://test/api/v1/media/uploads/{UPLOAD_ID}/content"
    assert target.headers == {"Content-Type": "image/jpeg"}
    assert target.expires_at == NOW + timedelta(seconds=60)
    assert stored.object_key == object_key_for_upload(UPLOAD_ID)
    assert stored.size_bytes == len(JPEG)
    assert stored.content_type == "image/jpeg"
    assert stored.header == JPEG
    assert downloaded == JPEG

    clock.advance(timedelta(seconds=61))
    with pytest.raises(ValueError, match="expired"):
        await store.read_download(
            object_key=query["key"][0],
            expires=int(query["expires"][0]),
            signature=query["signature"][0],
        )


@pytest.mark.asyncio
async def test_local_store_rejects_object_key_traversal(tmp_path) -> None:
    store = LocalMediaStore(
        root=tmp_path,
        api_public_url="http://test",
        signing_secret="test-media-secret",
        clock=FakeClock(NOW),
        ttl_seconds=60,
    )

    with pytest.raises(ValueError, match="object key"):
        await store.create_download_url("../private.txt")
