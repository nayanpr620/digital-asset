"""
Google Cloud Storage integration for Digital Asset Protection Platform.
Handles upload/download of video files, frames, and audio to GCS.
Falls back to local filesystem when GCS is not configured.

Set GCS_BUCKET_NAME env var to enable Google Cloud Storage.
Optionally set GOOGLE_APPLICATION_CREDENTIALS for local dev.
"""
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

GCS_BUCKET_NAME = os.environ.get("GCS_BUCKET_NAME", "")
USE_GCS = bool(GCS_BUCKET_NAME)

_gcs_client = None
_gcs_bucket = None


def _get_bucket():
    """Lazy-init GCS client and bucket."""
    global _gcs_client, _gcs_bucket
    if _gcs_bucket is None:
        from google.cloud import storage
        _gcs_client = storage.Client()
        _gcs_bucket = _gcs_client.bucket(GCS_BUCKET_NAME)
        logger.info(f"GCS bucket initialized: {GCS_BUCKET_NAME}")
    return _gcs_bucket


def upload_to_gcs(local_path: str, gcs_path: str, content_type: Optional[str] = None) -> str:
    """
    Upload a local file to GCS.
    Returns the GCS URI (gs://bucket/path).
    """
    if not USE_GCS:
        return local_path

    try:
        bucket = _get_bucket()
        blob = bucket.blob(gcs_path)

        if content_type:
            blob.content_type = content_type

        blob.upload_from_filename(local_path)
        gcs_uri = f"gs://{GCS_BUCKET_NAME}/{gcs_path}"
        logger.info(f"Uploaded to GCS: {gcs_uri}")
        return gcs_uri
    except Exception as e:
        logger.error(f"GCS upload failed for {local_path}: {e}")
        return local_path


def upload_bytes_to_gcs(data: bytes, gcs_path: str, content_type: str = "application/octet-stream") -> str:
    """Upload raw bytes to GCS. Returns GCS URI."""
    if not USE_GCS:
        return ""

    try:
        bucket = _get_bucket()
        blob = bucket.blob(gcs_path)
        blob.content_type = content_type
        blob.upload_from_string(data)
        gcs_uri = f"gs://{GCS_BUCKET_NAME}/{gcs_path}"
        logger.info(f"Uploaded bytes to GCS: {gcs_uri}")
        return gcs_uri
    except Exception as e:
        logger.error(f"GCS bytes upload failed: {e}")
        return ""


def download_from_gcs(gcs_path: str, local_path: str) -> Optional[str]:
    """Download a file from GCS to local path. Returns local path or None."""
    if not USE_GCS:
        return local_path if os.path.exists(local_path) else None

    try:
        bucket = _get_bucket()
        blob = bucket.blob(gcs_path)
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        blob.download_to_filename(local_path)
        logger.info(f"Downloaded from GCS: {gcs_path} → {local_path}")
        return local_path
    except Exception as e:
        logger.error(f"GCS download failed for {gcs_path}: {e}")
        return None


def get_signed_url(gcs_path: str, expiration_minutes: int = 60) -> Optional[str]:
    """Generate a signed URL for temporary access to a GCS object."""
    if not USE_GCS:
        return None

    try:
        import datetime
        bucket = _get_bucket()
        blob = bucket.blob(gcs_path)
        url = blob.generate_signed_url(
            expiration=datetime.timedelta(minutes=expiration_minutes),
            method="GET",
        )
        return url
    except Exception as e:
        logger.error(f"Signed URL generation failed for {gcs_path}: {e}")
        return None


def delete_from_gcs(gcs_path: str) -> bool:
    """Delete a file from GCS. Returns True on success."""
    if not USE_GCS:
        return True

    try:
        bucket = _get_bucket()
        blob = bucket.blob(gcs_path)
        blob.delete()
        logger.info(f"Deleted from GCS: {gcs_path}")
        return True
    except Exception as e:
        logger.warning(f"GCS delete failed for {gcs_path}: {e}")
        return False


def delete_prefix_from_gcs(prefix: str) -> int:
    """Delete all objects with a given prefix from GCS. Returns count deleted."""
    if not USE_GCS:
        return 0

    try:
        bucket = _get_bucket()
        blobs = list(bucket.list_blobs(prefix=prefix))
        count = 0
        for blob in blobs:
            blob.delete()
            count += 1
        logger.info(f"Deleted {count} objects with prefix: {prefix}")
        return count
    except Exception as e:
        logger.warning(f"GCS prefix delete failed for {prefix}: {e}")
        return 0


def upload_asset_files(video_id: str, file_path: str, frame_paths: list, audio_path: Optional[str] = None) -> dict:
    """
    Upload all asset files to GCS after processing.
    Returns dict with GCS paths for storage in the database.
    """
    if not USE_GCS:
        return {
            "file_path": file_path,
            "frame_paths": frame_paths,
            "storage_type": "local",
        }

    result = {
        "storage_type": "gcs",
        "gcs_paths": {},
    }

    # Upload video file
    ext = os.path.splitext(file_path)[1]
    gcs_video_path = f"assets/{video_id}/video{ext}"
    result["file_path"] = upload_to_gcs(file_path, gcs_video_path, "video/mp4")
    result["gcs_paths"]["video"] = gcs_video_path

    # Upload frames
    gcs_frame_paths = []
    for i, fp in enumerate(frame_paths):
        gcs_frame_path = f"assets/{video_id}/frames/frame_{i:04d}.png"
        upload_to_gcs(fp, gcs_frame_path, "image/png")
        gcs_frame_paths.append(gcs_frame_path)
    result["frame_paths"] = gcs_frame_paths
    result["gcs_paths"]["frames_prefix"] = f"assets/{video_id}/frames/"

    # Upload audio if exists
    if audio_path and os.path.exists(audio_path):
        gcs_audio_path = f"assets/{video_id}/audio.wav"
        upload_to_gcs(audio_path, gcs_audio_path, "audio/wav")
        result["gcs_paths"]["audio"] = gcs_audio_path

    logger.info(f"Asset {video_id} files uploaded to GCS ({len(gcs_frame_paths)} frames)")
    return result


def get_gcs_health() -> dict:
    """Check GCS connectivity and return health status."""
    if not USE_GCS:
        return {
            "enabled": False,
            "status": "disabled",
            "message": "GCS_BUCKET_NAME not configured — using local storage",
        }

    try:
        bucket = _get_bucket()
        bucket.exists()
        return {
            "enabled": True,
            "status": "healthy",
            "bucket": GCS_BUCKET_NAME,
            "message": "Connected to Google Cloud Storage",
        }
    except Exception as e:
        return {
            "enabled": True,
            "status": "error",
            "bucket": GCS_BUCKET_NAME,
            "message": f"GCS connection error: {str(e)}",
        }
