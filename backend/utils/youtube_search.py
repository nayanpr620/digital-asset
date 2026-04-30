"""
YouTube search and video sampling module.
Uses YouTube Data API v3 to find potential pirated content,
then downloads samples (frames + audio) via yt-dlp for fingerprinting.
"""
import os
import subprocess
import logging
from typing import List, Dict, Optional

from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


def get_youtube_service():
    api_key = os.environ.get("YOUTUBE_API_KEY", "")
    if not api_key:
        raise ValueError("YOUTUBE_API_KEY not set")
    return build("youtube", "v3", developerKey=api_key)


def search_youtube(query: str, max_results: int = 5) -> List[Dict]:
    """
    Search YouTube for videos matching query.
    Returns list of dicts with video info.
    """
    logger.info(f"YouTube search: '{query}' (max {max_results})")
    results = []

    try:
        youtube = get_youtube_service()
        request = youtube.search().list(
            q=query,
            part="snippet",
            type="video",
            maxResults=max_results,
            order="relevance",
        )
        response = request.execute()

        for item in response.get("items", []):
            vid_id = item["id"]["videoId"]
            snippet = item["snippet"]
            thumbs = snippet.get("thumbnails", {})
            thumb_url = (
                thumbs.get("high", {}).get("url")
                or thumbs.get("medium", {}).get("url")
                or thumbs.get("default", {}).get("url", "")
            )
            results.append({
                "youtube_id": vid_id,
                "title": snippet.get("title", ""),
                "channel": snippet.get("channelTitle", ""),
                "thumbnail": thumb_url,
                "published_at": snippet.get("publishedAt", ""),
                "url": f"https://www.youtube.com/watch?v={vid_id}",
            })
    except Exception as e:
        logger.warning(f"YouTube Data API failed (likely quota exceeded): {e}. Falling back to yt-dlp scraper.")
        try:
            import subprocess, json
            cmd = ["yt-dlp", f"ytsearch{max_results}:{query}", "--dump-json", "--no-warnings", "--ignore-errors"]
            out = subprocess.check_output(cmd, timeout=45).decode('utf-8')
            for line in out.strip().split('\n'):
                if not line.strip(): continue
                try:
                    v = json.loads(line)
                    results.append({
                        "youtube_id": v.get("id"),
                        "title": v.get("title", ""),
                        "channel": v.get("uploader", ""),
                        "thumbnail": f"https://img.youtube.com/vi/{v.get('id')}/hqdefault.jpg",
                        "published_at": "",
                        "url": f"https://www.youtube.com/watch?v={v.get('id')}",
                    })
                except json.JSONDecodeError:
                    pass
        except Exception as fallback_err:
            logger.error(f"Fallback search also failed: {fallback_err}")
            
    logger.info(f"Found {len(results)} videos for '{query}'")
    return results


def search_multiple_queries(queries: List[str], max_per_query: int = 3) -> List[Dict]:
    """Run multiple search queries and deduplicate results."""
    seen_ids = set()
    all_results = []

    for query in queries:
        try:
            results = search_youtube(query, max_per_query)
            for r in results:
                if r["youtube_id"] not in seen_ids:
                    seen_ids.add(r["youtube_id"])
                    r["search_query"] = query
                    all_results.append(r)
        except Exception as e:
            logger.error(f"Search failed for '{query}': {e}")

    logger.info(f"Total unique videos found: {len(all_results)}")
    return all_results


def download_video(youtube_id: str, output_dir: str) -> Optional[str]:
    """Download YouTube video via pytubefix to bypass Datacenter IP and PO token blocks. Returns path or None."""
    os.makedirs(output_dir, exist_ok=True)
    
    # We use pytubefix because yt-dlp gets blocked by PO Token or "Bot Check" on GCP IPs.
    # pytubefix with ANDROID_VR client bypasses this organically.
    try:
        from pytubefix import YouTube
        
        url = f"https://www.youtube.com/watch?v={youtube_id}"
        # Using WEB client automatically generates PO Tokens using nodejs-wheel-binaries
        # This completely bypasses Datacenter IP bot detection and 403 Forbidden errors.
        yt = YouTube(url, client='WEB')
        
        # Get the lowest resolution progressive stream to save bandwidth
        stream = yt.streams.filter(progressive=True, file_extension='mp4').order_by('resolution').first()
        
        if not stream:
            logger.warning(f"No valid mp4 stream found for {youtube_id}")
            return None
            
        # Download to output_dir
        logger.info(f"Downloading stream for {youtube_id}...")
        downloaded_file = stream.download(output_path=output_dir, filename=f"{youtube_id}.mp4")
        
        if os.path.exists(downloaded_file):
            logger.info(f"Successfully downloaded {youtube_id} to {downloaded_file}")
            return downloaded_file
            
        return None
        
    except Exception as e:
        logger.error(f"🚨 YOUTUBE DOWNLOAD ERROR for {youtube_id}: {e}")
        return None


def sample_youtube_video(video_info: dict) -> dict:
    """
    Download a YouTube video and extract frames + audio for fingerprinting.
    If the video download is blocked by YouTube's Datacenter IP BotGuard, 
    it falls back to downloading the thumbnails for visual fingerprinting.
    Returns the video_info dict augmented with frame_hashes and audio_fingerprint.
    """
    from utils.video_processing import (
        extract_specific_frames, generate_frame_hashes,
        extract_audio, generate_audio_fingerprint
    )
    import urllib.request

    yt_id = video_info["youtube_id"]
    dl_dir = os.path.join(DATA_DIR, "downloads", yt_id)
    os.makedirs(dl_dir, exist_ok=True)

    video_path = download_video(yt_id, dl_dir)
    
    if not video_path:
        logger.warning(f"Video download blocked for {yt_id}. Falling back to Thumbnail Visual Fingerprinting.")
        # Fallback: Download thumbnails directly (bypasses all bot protections)
        frames_dir = os.path.join(dl_dir, "frames")
        os.makedirs(frames_dir, exist_ok=True)
        
        fallback_hashes = []
        try:
            # Download maxresdefault and hqdefault to use as frames
            for res in ["maxresdefault", "hqdefault", "mqdefault", "sddefault"]:
                url = f"https://img.youtube.com/vi/{yt_id}/{res}.jpg"
                out_path = os.path.join(frames_dir, f"{res}.jpg")
                try:
                    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(req, timeout=5) as response, open(out_path, 'wb') as out_file:
                        out_file.write(response.read())
                    if os.path.exists(out_path):
                        fallback_hashes.extend(generate_frame_hashes([out_path]))
                except Exception:
                    continue
                    
            video_info["frame_hashes"] = list(set(fallback_hashes)) # deduplicate
            video_info["audio_fingerprint"] = None
            video_info["sampled"] = len(video_info["frame_hashes"]) > 0
            
            if video_info["sampled"]:
                logger.info(f"Fallback successful for {yt_id}: Generated {len(video_info['frame_hashes'])} visual hashes from thumbnails.")
            else:
                logger.error(f"Fallback failed for {yt_id}: Could not fetch any thumbnails.")
                
        except Exception as e:
            logger.error(f"Error during thumbnail fallback for {yt_id}: {e}")
            video_info["frame_hashes"] = []
            video_info["audio_fingerprint"] = None
            video_info["sampled"] = False
            
        return video_info

    try:
        # Normal extraction for successful downloads
        frames_dir = os.path.join(dl_dir, "frames")
        frame_paths = extract_specific_frames(video_path, frames_dir, count=5)
        video_info["frame_hashes"] = generate_frame_hashes(frame_paths)

        # Extract audio
        audio_path = os.path.join(dl_dir, f"{yt_id}.wav")
        audio_file = extract_audio(video_path, audio_path)
        video_info["audio_fingerprint"] = None
        if audio_file:
            video_info["audio_fingerprint"] = generate_audio_fingerprint(audio_file)

        video_info["sampled"] = True
        logger.info(
            f"Sampled {yt_id}: {len(video_info['frame_hashes'])} hashes, "
            f"audio={'yes' if video_info['audio_fingerprint'] else 'no'}"
        )
    finally:
        # Clean up downloaded video file to save space
        if video_path and os.path.exists(video_path):
            try:
                os.remove(video_path)
            except OSError:
                pass

    return video_info
