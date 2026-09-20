import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.core.config import settings

ALLOWED_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_BYTES = 6 * 1024 * 1024


def save_image(upload: UploadFile, folder: str) -> str:
    """Store an uploaded image and return its public URL."""
    ext = ALLOWED_TYPES.get(upload.content_type or "")
    if not ext:
        raise HTTPException(415, "Please upload a JPG, PNG or WebP photo.")
    data = upload.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Photo is too large (max 6 MB).")
    key = f"{folder}/{uuid.uuid4().hex}{ext}"

    if settings.STORAGE_BACKEND == "s3":  # pragma: no cover - needs cloud credentials
        import boto3

        boto3.client("s3", region_name=settings.S3_REGION).put_object(
            Bucket=settings.S3_BUCKET, Key=key, Body=data, ContentType=upload.content_type
        )
        base = settings.S3_PUBLIC_BASE_URL or f"https://{settings.S3_BUCKET}.s3.amazonaws.com"
        return f"{base}/{key}"

    path = Path(settings.MEDIA_DIR) / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return f"/media/{key}"
