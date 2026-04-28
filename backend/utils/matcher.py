"""
Matching engine for Digital Asset Protection.
Compares fingerprints of uploaded video against sampled YouTube videos.

Visual: Hamming distance on pHash → normalized to [0,1]
Audio: Bit-level comparison of Chromaprint raw fingerprints → [0,1]
Confidence: 0.6 * visual + 0.4 * audio
"""
import logging
from typing import List, Dict

import imagehash

logger = logging.getLogger(__name__)

PHASH_WEIGHT = 0.6
AUDIO_WEIGHT = 0.4


def hamming_distance(hash1: str, hash2: str) -> int:
    """Hamming distance between two hex hash strings."""
    try:
        h1 = imagehash.hex_to_hash(hash1)
        h2 = imagehash.hex_to_hash(hash2)
        return h1 - h2
    except Exception:
        try:
            i1, i2 = int(hash1, 16), int(hash2, 16)
            return bin(i1 ^ i2).count('1')
        except Exception:
            return 256


def visual_similarity(query_hashes: List[str], target_hashes: List[str], max_bits: int = 256) -> float:
    """
    Compute visual similarity between two sets of pHashes.
    For each query hash, find best match in target. Return average.
    """
    if not query_hashes or not target_hashes:
        return 0.0

    best_sims = []
    for qh in query_hashes:
        best = 0.0
        for th in target_hashes:
            dist = hamming_distance(qh, th)
            sim = max(0.0, 1.0 - (dist / max_bits))
            best = max(best, sim)
        best_sims.append(best)

    return sum(best_sims) / len(best_sims)


def audio_similarity(fp1: str, fp2: str) -> float:
    """
    Compare two Chromaprint raw fingerprints.
    Raw fingerprints are comma-separated 32-bit integers.
    """
    if not fp1 or not fp2:
        return 0.0

    try:
        vals1 = [int(x) for x in fp1.split(",")]
        vals2 = [int(x) for x in fp2.split(",")]

        min_len = min(len(vals1), len(vals2))
        if min_len == 0:
            return 0.0

        total_bits = 0
        matching_bits = 0
        for i in range(min_len):
            xor = vals1[i] ^ vals2[i]
            diff = bin(xor & 0xFFFFFFFF).count('1')
            total_bits += 32
            matching_bits += (32 - diff)

        sim = matching_bits / total_bits if total_bits > 0 else 0.0

        # Penalize length mismatch
        length_ratio = min_len / max(len(vals1), len(vals2))
        sim *= length_ratio

        return sim
    except Exception as e:
        logger.error(f"Audio similarity error: {e}")
        return 0.0


def compute_confidence(v_sim: float, a_sim: float) -> float:
    """confidence = 0.6 * visual + 0.4 * audio"""
    return round(PHASH_WEIGHT * v_sim + AUDIO_WEIGHT * a_sim, 4)


def determine_match_type(v_sim: float, a_sim: float) -> str:
    """Determine what kind of match this is based on individual similarities."""
    v_strong = v_sim >= 0.6
    a_strong = a_sim >= 0.6
    if v_strong and a_strong:
        return "Audio + Visual"
    elif v_strong:
        return "Visual Only"
    elif a_strong:
        return "Audio Only"
    else:
        return "Partial"


def confidence_label(score: float) -> str:
    if score >= 0.75:
        return "High"
    elif score >= 0.50:
        return "Medium"
    else:
        return "Low"


def match_against_youtube(
    source_fingerprint: dict,
    youtube_videos: List[Dict],
    min_confidence: float = 0.15,
) -> List[Dict]:
    """
    Match uploaded video fingerprint against all sampled YouTube videos.
    Returns list of matches sorted by confidence (descending).
    """
    src_hashes = source_fingerprint.get("frame_hashes", [])
    src_audio = source_fingerprint.get("audio_fingerprint")

    results = []
    for yt in youtube_videos:
        if not yt.get("sampled"):
            continue

        yt_hashes = yt.get("frame_hashes", [])
        yt_audio = yt.get("audio_fingerprint")

        v_sim = visual_similarity(src_hashes, yt_hashes)
        a_sim = audio_similarity(src_audio, yt_audio)
        conf = compute_confidence(v_sim, a_sim)

        if conf >= min_confidence:
            results.append({
                "title": yt.get("title", ""),
                "thumbnail": yt.get("thumbnail", ""),
                "url": yt.get("url", ""),
                "channel": yt.get("channel", ""),
                "youtube_id": yt.get("youtube_id", ""),
                "confidence": conf,
                "confidence_label": confidence_label(conf),
                "visual_similarity": round(v_sim, 4),
                "audio_similarity": round(a_sim, 4),
                "match_type": determine_match_type(v_sim, a_sim),
                "category": "",  # filled by Gemini later
                "search_query": yt.get("search_query", ""),
            })

            logger.info(
                f"Match: {yt.get('title', '')[:50]} — "
                f"conf={conf:.3f} (v={v_sim:.3f}, a={a_sim:.3f})"
            )

    results.sort(key=lambda x: x["confidence"], reverse=True)
    return results
