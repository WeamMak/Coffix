import pytest

from coffix.media.service import MediaPolicy, MediaPolicyError
from coffix.media.store import MediaPurpose


@pytest.fixture
def policy() -> MediaPolicy:
    return MediaPolicy(
        max_image_bytes=10_485_760,
        max_video_bytes=104_857_600,
        max_service_files=5,
    )


def test_media_policy_accepts_supported_image_and_video_limits(policy: MediaPolicy) -> None:
    policy.validate_upload(
        purpose=MediaPurpose.SERVICE_ISSUE,
        content_type="image/jpeg",
        size_bytes=10_485_760,
        existing_service_files=4,
    )


@pytest.mark.parametrize(
    ("content_type", "size_bytes", "existing_count", "code"),
    [
        ("image/gif", 100, 0, "MEDIA_TYPE_NOT_ALLOWED"),
        ("image/jpeg", 10_485_761, 0, "MEDIA_TOO_LARGE"),
        ("video/mp4", 104_857_601, 0, "MEDIA_TOO_LARGE"),
        ("image/png", 0, 0, "MEDIA_SIZE_INVALID"),
        ("image/png", 100, 5, "MEDIA_FILE_LIMIT_REACHED"),
    ],
)
def test_media_policy_rejects_type_size_and_service_count(
    policy: MediaPolicy,
    content_type: str,
    size_bytes: int,
    existing_count: int,
    code: str,
) -> None:
    with pytest.raises(MediaPolicyError) as error:
        policy.validate_upload(
            purpose=MediaPurpose.SERVICE_ISSUE,
            content_type=content_type,
            size_bytes=size_bytes,
            existing_service_files=existing_count,
        )

    assert error.value.code == code


@pytest.mark.parametrize(
    ("content_type", "header"),
    [
        ("image/jpeg", b"\xff\xd8\xff\xe0more"),
        ("image/png", b"\x89PNG\r\n\x1a\nmore"),
        ("image/heic", b"\x00\x00\x00\x18ftypheicmore"),
        ("video/mp4", b"\x00\x00\x00\x18ftypmp42more"),
    ],
)
def test_media_policy_accepts_matching_file_signatures(
    policy: MediaPolicy,
    content_type: str,
    header: bytes,
) -> None:
    policy.validate_signature(content_type=content_type, header=header)


def test_media_policy_rejects_mime_signature_mismatch(policy: MediaPolicy) -> None:
    with pytest.raises(MediaPolicyError) as error:
        policy.validate_signature(
            content_type="image/jpeg",
            header=b"\x89PNG\r\n\x1a\nmore",
        )

    assert error.value.code == "MEDIA_SIGNATURE_MISMATCH"
    policy.validate_upload(
        purpose=MediaPurpose.SERVICE_ISSUE,
        content_type="video/mp4",
        size_bytes=104_857_600,
        existing_service_files=4,
    )
