"""
Video processing utilities.
Extracts frames (pHash) and audio fingerprints (Chromaprint) from video files.
"""
import os
import subprocess
import logging
from typing import List, Tuple, Optional

import imagehash
from PIL import Image

logger = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


def ensure_dirs():
    for d in ["uploads", "frames", "audio", "downloads"]:
        os.makedirs(os.path.join(DATA_DIR, d), exist_ok=True)


def get_video_duration(video_path: str) -> float:
    """Get video duration in seconds using FFprobe."""
    try:
        cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
    except Exception as e:
        logger.error(f"Duration error: {e}")
    return 0.0


def extract_frames(video_path: str, output_dir: str, interval: int = 2) -> List[Tuple[str, float]]:
    """Extract frames every `interval` seconds. Returns [(path, timestamp), ...]."""
    os.makedirs(output_dir, exist_ok=True)
    pattern = os.path.join(output_dir, "frame_%04d.png")

    cmd = [
        "ffmpeg", "-i", video_path,
        "-vf", f"fps=1/{interval}",
        "-q:v", "2", "-y", pattern
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        logger.error(f"Frame extraction failed: {result.stderr[:300]}")
        return []

    frames = []
    for f in sorted(os.listdir(output_dir)):
        if f.startswith("frame_") and f.endswith(".png"):
            idx = int(f.replace("frame_", "").replace(".png", "")) - 1
            frames.append((os.path.join(output_dir, f), float(idx * interval)))
    logger.info(f"Extracted {len(frames)} frames from {os.path.basename(video_path)}")
    return frames


def extract_specific_frames(video_path: str, output_dir: str, count: int = 5) -> List[str]:
    """Extract `count` evenly-spaced frames from a video."""
    os.makedirs(output_dir, exist_ok=True)
    duration = get_video_duration(video_path)
    if duration <= 0:
        duration = 30.0

    interval = duration / (count + 1)
    paths = []
    for i in range(1, count + 1):
        ts = interval * i
        out = os.path.join(output_dir, f"frame_{i}.png")
        cmd = [
            "ffmpeg", "-ss", str(ts), "-i", video_path,
            "-vframes", "1", "-q:v", "2", "-y", out
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if r.returncode == 0 and os.path.exists(out):
            paths.append(out)
    return paths


def generate_phash(image_path: str, hash_size: int = 16) -> Optional[str]:
    """Generate perceptual hash for an image. Returns hex string."""
    try:
        img = Image.open(image_path)
        return str(imagehash.phash(img, hash_size=hash_size))
    except Exception as e:
        logger.error(f"pHash error for {image_path}: {e}")
        return None


def generate_frame_hashes(frame_paths: List[str]) -> List[str]:
    """Generate pHash for each frame path. Returns list of hex hash strings."""
    hashes = []
    for p in frame_paths:
        h = generate_phash(p)
        if h:
            hashes.append(h)
    return hashes


def extract_audio(video_path: str, output_path: str) -> Optional[str]:
    """Extract audio as WAV. Returns output path or None."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    cmd = [
        "ffmpeg", "-i", video_path,
        "-vn", "-acodec", "pcm_s16le",
        "-ar", "44100", "-ac", "1", "-y", output_path
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if r.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 0:
        return output_path
    logger.error(f"Audio extraction failed: {r.stderr[:200]}")
    return None


def generate_audio_fingerprint(audio_path: str) -> Optional[str]:
    """Generate Chromaprint fingerprint using fpcalc. Returns raw fingerprint string."""
    try:
        cmd = ["fpcalc", "-raw", audio_path]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if r.returncode != 0:
            logger.error(f"fpcalc failed: {r.stderr[:200]}")
            return None

        for line in r.stdout.strip().split("\n"):
            if line.startswith("FINGERPRINT="):
                fp = line.split("=", 1)[1]
                logger.info(f"Audio fingerprint generated ({len(fp)} chars)")
                return fp
        return None
    except FileNotFoundError:
        logger.error("fpcalc not found. Install: brew install chromaprint")
        return None
    except Exception as e:
        logger.error(f"Audio fingerprint error: {e}")
        return None


def process_uploaded_video(file_path: str, video_id: str) -> dict:
    """
    Full processing pipeline for an uploaded video.
    Returns dict with frame_hashes and audio_fingerprint.
    """
    ensure_dirs()

    frames_dir = os.path.join(DATA_DIR, "frames", video_id)
    frames = extract_frames(file_path, frames_dir, interval=2)
    frame_paths = [p for p, _ in frames]
    frame_hashes = generate_frame_hashes(frame_paths)

    audio_path = os.path.join(DATA_DIR, "audio", f"{video_id}.wav")
    audio_file = extract_audio(file_path, audio_path)
    audio_fp = None
    if audio_file:
        audio_fp = generate_audio_fingerprint(audio_file)

    duration = get_video_duration(file_path)

    return {
        "video_id": video_id,
        "frame_hashes": frame_hashes,
        "audio_fingerprint": audio_fp,
        "frame_count": len(frame_hashes),
        "duration": duration,
        "frame_paths": frame_paths,
    }
