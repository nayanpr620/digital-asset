"""
Digital Asset Protection Platform v4 — FastAPI Backend
All 9 features implemented:
  1. Gemini Anomaly Detection     2. DMCA Takedown Generator
  3. Side-by-Side Comparison      4. Digital Auth Certificate
  5. Scheduled Auto-Monitoring    6. WebSocket Live Updates
  7. Export Reports (CSV)         8. Confidence Threshold Tuning
  9. Channel Risk Scoring
+ Google Cloud Storage integration
+ Batch Scan All Assets
+ Enhanced System Health
"""
import os, uuid, json, time, csv, io, shutil, logging, threading, asyncio
from datetime import datetime, timezone
from typing import Optional
from contextlib import asynccontextmanager

from dotenv import load_dotenv
_dotenv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(dotenv_path=_dotenv_path, override=False)

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, BackgroundTasks, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import StreamingResponse, JSONResponse

from utils.video_processing import process_uploaded_video, ensure_dirs, DATA_DIR
from utils.gemini_helper import generate_search_queries, classify_matches, analyze_anomalies, generate_takedown_notice
from utils.youtube_search import search_multiple_queries, sample_youtube_video
from utils.matcher import match_against_youtube
from utils.database import *
from utils.database import user_ctx
from utils.storage import (
    USE_GCS, upload_asset_files, delete_prefix_from_gcs,
    get_gcs_health
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

# ── Max upload size: 500 MB ──
MAX_UPLOAD_BYTES = 500 * 1024 * 1024

# ── WebSocket connections for live updates (Feature 6) ──
ws_clients: dict[str, list[WebSocket]] = {}  # user_id -> [WebSocket, ...]
broadcast_loop: Optional[asyncio.AbstractEventLoop] = None

def _cleanup_processed_files(file_path: str, frame_paths: Optional[list[str]] = None):
    """Remove uploaded media artifacts when registration fails or an asset is deleted."""
    media_token = os.path.basename(file_path).split("_", 1)[0] if file_path else ""
    frame_dir = os.path.dirname(frame_paths[0]) if frame_paths and frame_paths[0] else ""

    try:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
    except OSError as e:
        logger.warning(f"Failed to remove uploaded file {file_path}: {e}")

    if frame_dir and os.path.isdir(frame_dir):
        try:
            shutil.rmtree(frame_dir)
        except OSError as e:
            logger.warning(f"Failed to remove frame directory {frame_dir}: {e}")
    elif media_token:
        fallback_frame_dir = os.path.join(DATA_DIR, "frames", media_token)
        if os.path.isdir(fallback_frame_dir):
            try:
                shutil.rmtree(fallback_frame_dir)
            except OSError as e:
                logger.warning(f"Failed to remove frame directory {fallback_frame_dir}: {e}")

    if media_token:
        audio_path = os.path.join(DATA_DIR, "audio", f"{media_token}.wav")
        if os.path.exists(audio_path):
            try:
                os.remove(audio_path)
            except OSError as e:
                logger.warning(f"Failed to remove extracted audio {audio_path}: {e}")

    # Also clean up from GCS if enabled
    if USE_GCS and media_token:
        try:
            delete_prefix_from_gcs(f"assets/{media_token}/")
        except Exception as e:
            logger.warning(f"Failed to clean GCS for {media_token}: {e}")


async def broadcast_to_user(user_id: str, msg: dict):
    """Send message only to specific user."""
    if user_id not in ws_clients:
        return
    dead_connections = []
    for ws in ws_clients[user_id][:]:
        try:
            await ws.send_json(msg)
        except Exception as e:
            logger.debug(f"WebSocket send failed: {e}")
            dead_connections.append(ws)
    
    # Clean up dead connections
    for ws in dead_connections:
        try:
            ws_clients[user_id].remove(ws)
        except (ValueError, KeyError):
            pass

def broadcast_sync(msg: dict, user_id: str = None):
    """Thread-safe broadcast to specific user."""
    if not broadcast_loop or not broadcast_loop.is_running():
        return
    if not user_id:
        user_id = user_ctx.get()
    if not user_id:
        return
    try:
        asyncio.run_coroutine_threadsafe(broadcast_to_user(user_id, msg), broadcast_loop)
    except Exception as e:
        logger.warning(f"WebSocket broadcast failed: {e}")

# ── Scheduled monitor thread (Feature 5) ──
def _scheduler_loop():
    while True:
        try:
            due = get_due_schedules()
            for s in due:
                logger.info(f"Scheduled scan for asset {s['asset_id']}")
                scan_id = create_scan(s["asset_id"], scan_type="scheduled")
                _run_scan(s["asset_id"], scan_id)
                update_schedule_run(s["id"], s["interval_hours"])
        except Exception as e:
            logger.error(f"Scheduler error: {e}")
        time.sleep(60)


# ── Lifespan (replaces deprecated @app.on_event) ──
@asynccontextmanager
async def lifespan(app: FastAPI):
    global broadcast_loop
    ensure_dirs()
    init_db()
    rebuild_channel_risks()
    broadcast_loop = asyncio.get_running_loop()
    threading.Thread(target=_scheduler_loop, daemon=True).start()
    logger.info("Digital Asset Protection Platform v4 started")
    storage_mode = "Google Cloud Storage" if USE_GCS else "Local filesystem"
    logger.info(f"Storage mode: {storage_mode}")
    yield
    logger.info("Digital Asset Protection Platform shutting down")


app = FastAPI(
    title="Digital Asset Protection Platform",
    version="4.0.0",
    lifespan=lifespan,
)

# ── CORS: Production-ready with env-driven origins ──
_cors_origins_env = os.environ.get("CORS_ORIGINS", "")
_cors_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
if _cors_origins_env:
    _cors_origins.extend([o.strip() for o in _cors_origins_env.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"https://.*\.run\.app",  # Allow all Cloud Run origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Authorization helpers ──
async def _assert_user_owns_asset(asset_id: str) -> dict:
    """Verify user owns the asset, return asset or raise 403."""
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    asset = get_asset(asset_id, user_id=uid)
    if not asset:
        raise HTTPException(403, "Access denied")
    return asset

async def _assert_user_owns_violation(violation_id: str) -> dict:
    """Verify user owns the violation, return violation or raise 403."""
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    violation = get_violation(violation_id, user_id=uid)
    if not violation:
        raise HTTPException(403, "Access denied")
    return violation

# ── Multi-Tenancy Middleware: extract X-User-Id header ──
class UserIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        uid = request.headers.get("x-user-id")
        token = user_ctx.set(uid)
        try:
            response = await call_next(request)
            return response
        finally:
            user_ctx.reset(token)

app.add_middleware(UserIdMiddleware)


@app.get("/health")
async def health():
    """Enhanced health check with dependency status."""
    import subprocess

    # Check ffmpeg
    ffmpeg_ok = False
    try:
        r = subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
        ffmpeg_ok = r.returncode == 0
    except Exception:
        pass

    # Check fpcalc
    fpcalc_ok = False
    try:
        r = subprocess.run(["fpcalc", "-version"], capture_output=True, timeout=5)
        fpcalc_ok = r.returncode == 0
    except Exception:
        pass

    # Check database
    db_ok = False
    try:
        with get_conn() as c:
            if USE_POSTGRES:
                import psycopg2.extras
                cur = c.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                cur.execute("SELECT 1 as ok")
                db_ok = cur.fetchone() is not None
            else:
                row = c.execute("SELECT 1 as ok").fetchone()
                db_ok = row is not None
    except Exception as e:
        logger.warning(f"Health check DB probe failed: {e}")

    gcs_health = get_gcs_health()

    return {
        "status": "ok" if (db_ok and ffmpeg_ok) else "degraded",
        "service": "digital-asset-protection",
        "version": "4.0.0",
        "dependencies": {
            "database": "connected" if db_ok else "disconnected",
            "ffmpeg": "available" if ffmpeg_ok else "missing — install ffmpeg",
            "fpcalc": "available" if fpcalc_ok else "missing — install chromaprint",
            "storage": gcs_health,
        }
    }


# ═══ WEBSOCKET (Feature 6) ═══════════════════════════════════════
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, x_user_id: str = Query(None, alias="x-user-id")):
    if not x_user_id:
        await ws.close(code=1008, reason="Missing x-user-id query parameter")
        return
    
    await ws.accept()
    
    # Track this connection for the user
    if x_user_id not in ws_clients:
        ws_clients[x_user_id] = []
    ws_clients[x_user_id].append(ws)
    
    logger.info(f"WebSocket connected: user={x_user_id}, total_users={len(ws_clients)}")
    
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: user={x_user_id}")
        try:
            ws_clients[x_user_id].remove(ws)
            if not ws_clients[x_user_id]:
                del ws_clients[x_user_id]
        except (ValueError, KeyError):
            pass


# ═══ ASSET REGISTRY ══════════════════════════════════════════════
@app.post("/assets/register")
async def register_asset(file: UploadFile = File(...), title: str = Form(None)):
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    
    if title is None:
        title = os.path.splitext(file.filename or "untitled")[0].replace("_"," ").replace("-"," ")

    # Read file with size check
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File too large. Maximum size is {MAX_UPLOAD_BYTES // (1024*1024)} MB.")

    video_id = str(uuid.uuid4())[:12]
    upload_dir = os.path.join(DATA_DIR, "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, f"{video_id}_{file.filename}")
    with open(file_path, "wb") as f:
        f.write(content)

    fp = process_uploaded_video(file_path, video_id)
    if not fp["frame_hashes"] and not fp["audio_fingerprint"]:
        _cleanup_processed_files(file_path, fp.get("frame_paths"))
        raise HTTPException(400, "Uploaded file could not be fingerprinted. Please provide a valid video.")

    # Upload to GCS if enabled
    gcs_result = upload_asset_files(
        video_id, file_path, fp.get("frame_paths", []),
        audio_path=os.path.join(DATA_DIR, "audio", f"{video_id}.wav")
    )

    # Use GCS paths if available, otherwise local
    stored_file_path = gcs_result.get("file_path", file_path)
    stored_frame_paths = gcs_result.get("frame_paths", fp.get("frame_paths", []))

    asset_id = create_asset(title=title, filename=file.filename, file_path=stored_file_path,
        duration=fp["duration"], frame_count=fp["frame_count"],
        has_audio=fp["audio_fingerprint"] is not None,
        frame_hashes=fp["frame_hashes"], audio_fingerprint=fp["audio_fingerprint"],
        frame_paths=stored_frame_paths)

    asset = get_asset(asset_id)
    return {"status": "registered", "asset_id": asset_id, "title": title,
            "certificate_hash": asset["certificate_hash"],
            "storage": "gcs" if USE_GCS else "local",
            "fingerprint": {"frame_count": fp["frame_count"],
                           "has_audio": fp["audio_fingerprint"] is not None,
                           "duration": fp["duration"]}}

@app.get("/assets")
async def list_assets():
    assets = get_all_assets()
    return {"assets": assets, "count": len(assets)}

@app.get("/assets/{asset_id}")
async def get_asset_detail(asset_id: str):
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    asset = get_asset(asset_id, user_id=uid)
    if not asset: raise HTTPException(403, "Access denied")
    scans = get_scans_for_asset(asset_id, user_id=uid)
    violations = get_violations(asset_id=asset_id, user_id=uid)
    return {"asset": asset, "scans": scans, "violations": violations}

@app.delete("/assets/{asset_id}")
async def remove_asset(asset_id: str):
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    asset = get_asset(asset_id, user_id=uid)
    if not asset: raise HTTPException(403, "Access denied")
    try:
        delete_asset(asset_id, user_id=uid)
    except ValueError as e:
        raise HTTPException(403, str(e))
    rebuild_channel_risks()
    _cleanup_processed_files(asset.get("file_path", ""), asset.get("frame_paths", []))
    return {"status": "deleted"}

# ═══ Feature 8: CONFIDENCE THRESHOLD TUNING ══════════════════════
@app.patch("/assets/{asset_id}/threshold")
async def set_threshold(asset_id: str, threshold: float = Query(..., ge=0.0, le=1.0)):
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    asset = get_asset(asset_id, user_id=uid)
    if not asset: raise HTTPException(403, "Access denied")
    update_asset_threshold(asset_id, threshold)
    return {"status": "updated", "threshold": threshold}

# ═══ Feature 4: DIGITAL AUTHENTICATION CERTIFICATE ══════════════
@app.get("/assets/{asset_id}/certificate")
async def get_certificate(asset_id: str):
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    asset = get_asset(asset_id, user_id=uid)
    if not asset: raise HTTPException(403, "Access denied")
    cert = {
        "certificate_type": "Digital Asset Authentication Certificate",
        "version": "1.0",
        "asset_id": asset["id"],
        "title": asset["title"],
        "registered_at": asset["registered_at"],
        "issuer": "Digital Asset Protection Platform",
        "fingerprint": {
            "algorithm": "pHash-16 + Chromaprint",
            "frame_count": asset["frame_count"],
            "has_audio": bool(asset["has_audio"]),
            "duration_seconds": asset["duration"],
            "visual_hashes": len(asset.get("frame_hashes", [])),
        },
        "certificate_hash": asset["certificate_hash"],
        "verification": "This certificate proves the asset was registered and fingerprinted at the stated time. "
                        "The certificate_hash is a SHA-256 digest of the asset's unique fingerprint data.",
        "status": asset["status"],
    }
    return cert

# ═══ SCANNING ════════════════════════════════════════════════════
def _run_scan(asset_id: str, scan_id: str, uid: str = None):
    # Restore user context in background thread
    token = user_ctx.set(uid)
    try:
        asset = get_asset(asset_id, user_id=uid)
        if not asset:
            update_scan(scan_id, status="failed", error="Asset not found", completed_at=_now())
            return

        threshold = asset.get("confidence_threshold", 0.15)
        source_fp = {"frame_hashes": asset["frame_hashes"], "audio_fingerprint": asset["audio_fingerprint"]}

        broadcast_sync({"type":"scan_progress","scan_id":scan_id,"stage":"gemini_queries","message":"Generating search queries..."}, user_id=uid)
        try: queries = generate_search_queries(asset["title"], asset.get("filename",""))
        except Exception as e:
            logger.warning(f"Gemini queries failed: {e}")
            clean = asset["title"].replace("_"," ")
            queries = [f"{clean} highlights",f"{clean} match",f"{clean} HD",f"{clean} clip",f"{clean} replay"]
        update_scan(scan_id, search_queries=queries)

        broadcast_sync({"type":"scan_progress","scan_id":scan_id,"stage":"youtube_search","message":f"Searching YouTube with {len(queries)} queries..."}, user_id=uid)
        try: yt_results = search_multiple_queries(queries, max_per_query=3)
        except Exception as e: logger.error(f"YouTube search failed: {e}"); yt_results = []
        update_scan(scan_id, youtube_searched=len(yt_results))

        broadcast_sync({"type":"scan_progress","scan_id":scan_id,"stage":"sampling","message":f"Sampling {len(yt_results)} videos..."}, user_id=uid)
        sampled = []
        for i, yt in enumerate(yt_results):
            broadcast_sync({"type":"scan_progress","scan_id":scan_id,"stage":"sampling",
                          "message":f"Sampling video {i+1}/{len(yt_results)}: {yt['title'][:40]}..."}, user_id=uid)
            try: sampled.append(sample_youtube_video(yt))
            except Exception: yt["sampled"]=False; sampled.append(yt)
        update_scan(scan_id, youtube_sampled=sum(1 for v in sampled if v.get("sampled")))

        broadcast_sync({"type":"scan_progress","scan_id":scan_id,"stage":"matching","message":"Running match engine..."}, user_id=uid)
        matches = match_against_youtube(source_fp, sampled, min_confidence=threshold)

        if matches:
            broadcast_sync({"type":"scan_progress","scan_id":scan_id,"stage":"classify","message":"Classifying matches..."}, user_id=uid)
            try: matches = classify_matches(matches)
            except Exception: pass

        # Store violations + propagation + channel risk (Feature 9)
        for m in matches:
            upsert_violation(scan_id, asset_id, m, user_id=uid)
            record_propagation(asset_id, m, scan_id, user_id=uid)
            update_channel_risk(m.get("channel",""), m["confidence"], asset_id, user_id=uid)

        update_scan(scan_id, status="completed", matches_found=len(matches), completed_at=_now())
        broadcast_sync({"type":"scan_complete","scan_id":scan_id,"matches":len(matches)}, user_id=uid)
        logger.info(f"Scan {scan_id} complete: {len(matches)} matches")

    except Exception as e:
        logger.error(f"Scan {scan_id} failed: {e}", exc_info=True)
        update_scan(scan_id, status="failed", error=str(e), completed_at=_now())
        broadcast_sync({"type":"scan_error","scan_id":scan_id,"error":str(e)}, user_id=uid)
    finally:
        user_ctx.reset(token)
        dl = os.path.join(DATA_DIR, "downloads")
        if os.path.exists(dl):
            try: shutil.rmtree(dl); os.makedirs(dl, exist_ok=True)
            except Exception: pass

def _now(): return datetime.now(timezone.utc).isoformat()

@app.post("/assets/{asset_id}/scan")
async def scan_asset(asset_id: str, background_tasks: BackgroundTasks):
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    asset = get_asset(asset_id, user_id=uid)
    if not asset: raise HTTPException(403, "Access denied")
    scan_id = create_scan(asset_id, scan_type="manual", user_id=uid)
    background_tasks.add_task(_run_scan, asset_id, scan_id, uid)
    return {"status": "scanning", "scan_id": scan_id}


# ═══ BATCH SCAN ALL ASSETS ═══════════════════════════════════════
@app.post("/assets/scan-all")
async def scan_all_assets(background_tasks: BackgroundTasks):
    """Batch scan all registered assets. Returns list of scan IDs."""
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    assets = get_all_assets(user_id=uid)
    if not assets:
        raise HTTPException(404, "No assets registered")

    scan_ids = []
    for asset in assets:
        scan_id = create_scan(asset["id"], scan_type="batch", user_id=uid)
        background_tasks.add_task(_run_scan, asset["id"], scan_id, uid)
        scan_ids.append({"asset_id": asset["id"], "asset_title": asset["title"], "scan_id": scan_id})

    return {"status": "scanning", "total": len(scan_ids), "scans": scan_ids}


@app.get("/scans")
async def list_scans(limit: int = Query(50)):
    return {"scans": get_recent_scans(limit)}

@app.get("/scans/{scan_id}")
async def get_scan_detail(scan_id: str):
    scan = get_scan(scan_id)
    if not scan: raise HTTPException(404)
    return {"scan": scan}

# ═══ VIOLATIONS ══════════════════════════════════════════════════
@app.get("/violations")
async def list_violations(asset_id: str = Query(None), status: str = Query(None), limit: int = Query(100)):
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    return {"violations": get_violations(asset_id=asset_id, status=status, limit=limit, user_id=uid),
            "stats": get_violation_stats(user_id=uid)}

@app.patch("/violations/{vid}")
async def patch_violation(vid: str, status: str = Query(...), notes: str = Query(None)):
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    v = get_violation(vid, user_id=uid)
    if not v:
        raise HTTPException(403, "Access denied")
    update_violation_status(vid, status, notes)
    return {"status": "updated"}

# ═══ Feature 2: DMCA TAKEDOWN GENERATOR ══════════════════════════
@app.post("/violations/{vid}/takedown")
async def gen_takedown(vid: str):
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    v = get_violation(vid, user_id=uid)
    if not v: raise HTTPException(403, "Access denied")
    asset = get_asset(v["asset_id"], user_id=uid)
    notice = generate_takedown_notice(v, asset)
    save_takedown_notice(vid, notice)
    return {"notice": notice, "violation_id": vid}

@app.get("/violations/{vid}/takedown")
async def get_takedown(vid: str):
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    v = get_violation(vid, user_id=uid)
    if not v: raise HTTPException(403, "Access denied")
    if not v.get("takedown_notice"):
        raise HTTPException(404, "No takedown notice generated yet")
    return {"notice": v["takedown_notice"], "violation_id": vid}

# ═══ Feature 3: SIDE-BY-SIDE COMPARISON ══════════════════════════
@app.get("/violations/{vid}/compare")
async def compare_frames(vid: str):
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    v = get_violation(vid, user_id=uid)
    if not v: raise HTTPException(403, "Access denied")
    asset = get_asset(v["asset_id"], user_id=uid)
    return {
        "violation": {"title": v["title"], "thumbnail": v["thumbnail"],
                      "confidence": v["confidence"], "visual_similarity": v["visual_similarity"],
                      "audio_similarity": v["audio_similarity"], "match_type": v["match_type"]},
        "asset": {"title": asset["title"], "frame_count": asset["frame_count"],
                  "frame_hashes": asset.get("frame_hashes",[])[:5],
                  "duration": asset["duration"], "certificate_hash": asset["certificate_hash"]},
    }

# ═══ Feature 5: SCHEDULED AUTO-MONITORING ════════════════════════
@app.post("/schedules")
async def create_monitor_schedule(asset_id: str = Query(...), interval_hours: int = Query(24)):
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    asset = get_asset(asset_id, user_id=uid)
    if not asset: raise HTTPException(403, "Access denied")
    sid = create_schedule(asset_id, interval_hours, user_id=uid)
    return {"status": "created", "schedule_id": sid, "interval_hours": interval_hours}

@app.get("/schedules")
async def list_schedules():
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    return {"schedules": get_schedules(user_id=uid)}

@app.patch("/schedules/{sid}")
async def toggle_sched(sid: str, active: bool = Query(...)):
    toggle_schedule(sid, active)
    return {"status": "updated"}

@app.delete("/schedules/{sid}")
async def remove_schedule(sid: str):
    delete_schedule(sid)
    return {"status": "deleted"}

# ═══ Feature 7: EXPORT REPORTS (CSV) ═════════════════════════════
@app.get("/export/violations")
async def export_violations_csv(asset_id: str = Query(None)):
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    violations = get_violations(asset_id=asset_id, limit=1000, user_id=uid)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Title","Channel","URL","Confidence","Visual%","Audio%","MatchType",
                     "Category","Status","FirstDetected","LastSeen","Asset"])
    for v in violations:
        writer.writerow([v["title"],v["channel"],v["url"],f"{v['confidence']*100:.1f}%",
            f"{v['visual_similarity']*100:.1f}%",f"{v['audio_similarity']*100:.1f}%",
            v["match_type"],v["category"],v["status"],v["first_detected_at"],
            v["last_seen_at"],v.get("asset_title","")])
    output.seek(0)
    return StreamingResponse(io.BytesIO(output.getvalue().encode()),
        media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=violations_report_{datetime.now().strftime('%Y%m%d')}.csv"})

# ═══ ANALYTICS ═══════════════════════════════════════════════════
@app.get("/analytics/dashboard")
async def analytics_dashboard():
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    return get_dashboard_stats(user_id=uid)

@app.get("/analytics/propagation")
async def analytics_propagation(asset_id: str = Query(None), days: int = Query(30)):
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    return {"timeline": get_propagation_timeline(asset_id, days, user_id=uid)}

@app.get("/analytics/channels")
async def analytics_channels(asset_id: str = Query(None)):
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    return {"channels": get_propagation_channels(asset_id, user_id=uid)}

# ═══ Feature 9: CHANNEL RISK SCORING ═════════════════════════════
@app.get("/analytics/channel-risks")
async def channel_risks():
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    return {"channels": get_channel_risks(user_id=uid)}

# ═══ Feature 1: GEMINI ANOMALY DETECTION ═════════════════════════
@app.get("/analytics/anomalies")
async def detect_anomalies(asset_id: str = Query(None)):
    uid = user_ctx.get()
    if not uid:
        raise HTTPException(401, "Unauthorized: X-User-Id header required")
    timeline = get_propagation_timeline(asset_id, 30, user_id=uid)
    channels = get_propagation_channels(asset_id, user_id=uid)
    risks = get_channel_risks(10, user_id=uid)
    stats = get_violation_stats()
    data = {"timeline": timeline, "channels": channels, "channel_risks": risks,
            "total_violations": stats.get("total",0), "high_risk": stats.get("high_risk",0)}
    result = analyze_anomalies(data)
    return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
