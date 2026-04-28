"""
Database layer for Digital Asset Protection Platform v4.
Supports PostgreSQL (production) and SQLite (local dev fallback).
Set DATABASE_URL env var to use PostgreSQL:
  DATABASE_URL=postgresql://user:pass@host:5432/dbname
"""
import os, json, uuid, hashlib, logging
from datetime import datetime, timezone
from contextlib import contextmanager
from contextvars import ContextVar

logger = logging.getLogger(__name__)

# Multi-Tenancy Context
workspace_ctx = ContextVar("workspace_id", default="public")
user_ctx = ContextVar("user_id", default=None)
_workspaces_initialized = set()

DATABASE_URL = os.environ.get("DATABASE_URL", "")
USE_POSTGRES = DATABASE_URL.startswith("postgresql")

# ─── Connection handling ─────────────────────────────────────────
if USE_POSTGRES:
    import psycopg2
    import psycopg2.extras
    _pool = None

    def _get_pool():
        global _pool
        if _pool is None:
            from psycopg2 import pool
            # keepalives prevent the remote Cloud SQL connection from going stale
            _pool = pool.ThreadedConnectionPool(
                1, 10, DATABASE_URL,
                keepalives=1, keepalives_idle=30,
                keepalives_interval=10, keepalives_count=5
            )
        return _pool

    @contextmanager
    def get_conn():
        p = _get_pool()
        conn = p.getconn()
        conn.autocommit = False
        try:
            wid = workspace_ctx.get()
            with conn.cursor() as cur:
                cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{wid}";')
                cur.execute(f'SET search_path TO "{wid}";')
            
            if wid not in _workspaces_initialized:
                with conn.cursor() as cur:
                    cur.execute(_get_schema())
                _workspaces_initialized.add(wid)
                
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            p.putconn(conn)

    def _execute(conn, sql, params=None):
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(sql, params or ())
        return cur

    def _fetchone(conn, sql, params=None):
        cur = _execute(conn, sql, params)
        row = cur.fetchone()
        return dict(row) if row else None

    def _fetchall(conn, sql, params=None):
        cur = _execute(conn, sql, params)
        return [dict(r) for r in cur.fetchall()]

    P = "%s"  # parameter placeholder

else:
    import sqlite3
    DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
    DB_PATH = os.path.join(DB_DIR, "dap.db")

    @contextmanager
    def get_conn():
        os.makedirs(DB_DIR, exist_ok=True)
        wid = workspace_ctx.get()
        db_file = DB_PATH.replace(".db", f"_{wid}.db") if wid != "public" else DB_PATH
        
        conn = sqlite3.connect(db_file)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            if wid not in _workspaces_initialized:
                conn.executescript(_get_schema())
                _workspaces_initialized.add(wid)
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _execute(conn, sql, params=None):
        return conn.execute(sql, params or ())

    def _fetchone(conn, sql, params=None):
        row = conn.execute(sql, params or ()).fetchone()
        return dict(row) if row else None

    def _fetchall(conn, sql, params=None):
        return [dict(r) for r in conn.execute(sql, params or ()).fetchall()]

    P = "?"  # parameter placeholder


# ─── Schema ──────────────────────────────────────────────────────
def _get_schema():
    """Generate schema SQL compatible with current DB engine."""
    if USE_POSTGRES:
        return """
        CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, filename TEXT, file_path TEXT,
            duration DOUBLE PRECISION DEFAULT 0, frame_count INTEGER DEFAULT 0,
            has_audio INTEGER DEFAULT 0, frame_hashes TEXT DEFAULT '[]',
            audio_fingerprint TEXT, frame_paths TEXT DEFAULT '[]',
            confidence_threshold DOUBLE PRECISION DEFAULT 0.15,
            certificate_hash TEXT, registered_at TEXT NOT NULL, status TEXT DEFAULT 'active'
        );
        CREATE TABLE IF NOT EXISTS scans (
            id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id),
            scan_type TEXT DEFAULT 'manual', status TEXT DEFAULT 'pending',
            search_queries TEXT DEFAULT '[]', youtube_searched INTEGER DEFAULT 0,
            youtube_sampled INTEGER DEFAULT 0, matches_found INTEGER DEFAULT 0,
            started_at TEXT NOT NULL, completed_at TEXT, error TEXT
        );
        CREATE TABLE IF NOT EXISTS violations (
            id TEXT PRIMARY KEY, scan_id TEXT NOT NULL REFERENCES scans(id),
            asset_id TEXT NOT NULL REFERENCES assets(id),
            youtube_id TEXT NOT NULL, title TEXT, channel TEXT, thumbnail TEXT, url TEXT,
            confidence DOUBLE PRECISION DEFAULT 0, confidence_label TEXT,
            visual_similarity DOUBLE PRECISION DEFAULT 0, audio_similarity DOUBLE PRECISION DEFAULT 0,
            match_type TEXT, category TEXT, status TEXT DEFAULT 'detected',
            first_detected_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, notes TEXT,
            takedown_notice TEXT
        );
        CREATE TABLE IF NOT EXISTS propagation_events (
            id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id),
            youtube_id TEXT NOT NULL, title TEXT, channel TEXT,
            confidence DOUBLE PRECISION, detected_at TEXT NOT NULL, scan_id TEXT
        );
        CREATE TABLE IF NOT EXISTS channel_risk (
            user_id TEXT, channel TEXT NOT NULL, total_violations INTEGER DEFAULT 0,
            high_risk_count INTEGER DEFAULT 0, avg_confidence DOUBLE PRECISION DEFAULT 0,
            risk_score DOUBLE PRECISION DEFAULT 0, risk_level TEXT DEFAULT 'low',
            first_seen TEXT, last_seen TEXT, assets_affected TEXT DEFAULT '[]',
            PRIMARY KEY (user_id, channel)
        );
        CREATE TABLE IF NOT EXISTS scheduled_monitors (
            id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id),
            interval_hours INTEGER DEFAULT 24, is_active INTEGER DEFAULT 1,
            last_run TEXT, next_run TEXT, created_at TEXT NOT NULL
        );
        """
    else:
        return """
        CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, filename TEXT, file_path TEXT,
            duration REAL DEFAULT 0, frame_count INTEGER DEFAULT 0,
            has_audio INTEGER DEFAULT 0, frame_hashes TEXT DEFAULT '[]',
            audio_fingerprint TEXT, frame_paths TEXT DEFAULT '[]',
            confidence_threshold REAL DEFAULT 0.15,
            certificate_hash TEXT, registered_at TEXT NOT NULL, status TEXT DEFAULT 'active'
        );
        CREATE TABLE IF NOT EXISTS scans (
            id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id),
            scan_type TEXT DEFAULT 'manual', status TEXT DEFAULT 'pending',
            search_queries TEXT DEFAULT '[]', youtube_searched INTEGER DEFAULT 0,
            youtube_sampled INTEGER DEFAULT 0, matches_found INTEGER DEFAULT 0,
            started_at TEXT NOT NULL, completed_at TEXT, error TEXT
        );
        CREATE TABLE IF NOT EXISTS violations (
            id TEXT PRIMARY KEY, scan_id TEXT NOT NULL REFERENCES scans(id),
            asset_id TEXT NOT NULL REFERENCES assets(id),
            youtube_id TEXT NOT NULL, title TEXT, channel TEXT, thumbnail TEXT, url TEXT,
            confidence REAL DEFAULT 0, confidence_label TEXT,
            visual_similarity REAL DEFAULT 0, audio_similarity REAL DEFAULT 0,
            match_type TEXT, category TEXT, status TEXT DEFAULT 'detected',
            first_detected_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, notes TEXT,
            takedown_notice TEXT
        );
        CREATE TABLE IF NOT EXISTS propagation_events (
            id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id),
            youtube_id TEXT NOT NULL, title TEXT, channel TEXT,
            confidence REAL, detected_at TEXT NOT NULL, scan_id TEXT
        );
        CREATE TABLE IF NOT EXISTS channel_risk (
            user_id TEXT, channel TEXT NOT NULL, total_violations INTEGER DEFAULT 0,
            high_risk_count INTEGER DEFAULT 0, avg_confidence REAL DEFAULT 0,
            risk_score REAL DEFAULT 0, risk_level TEXT DEFAULT 'low',
            first_seen TEXT, last_seen TEXT, assets_affected TEXT DEFAULT '[]',
            PRIMARY KEY (user_id, channel)
        );
        CREATE TABLE IF NOT EXISTS scheduled_monitors (
            id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id),
            interval_hours INTEGER DEFAULT 24, is_active INTEGER DEFAULT 1,
            last_run TEXT, next_run TEXT, created_at TEXT NOT NULL
        );
        """

def _get_index_statements():
    return [
        "CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_scans_user ON scans(user_id)",
        f"CREATE INDEX IF NOT EXISTS idx_scans_asset_user ON scans(asset_id, user_id)",
        "CREATE INDEX IF NOT EXISTS idx_violations_user ON violations(user_id)",
        f"CREATE INDEX IF NOT EXISTS idx_violations_asset_user ON violations(asset_id, user_id)",
        "CREATE INDEX IF NOT EXISTS idx_violations_youtube ON violations(youtube_id)",
        "CREATE INDEX IF NOT EXISTS idx_violations_status ON violations(status)",
        "CREATE INDEX IF NOT EXISTS idx_propagation_user ON propagation_events(user_id)",
        f"CREATE INDEX IF NOT EXISTS idx_propagation_asset_user ON propagation_events(asset_id, user_id)",
        "CREATE INDEX IF NOT EXISTS idx_propagation_time ON propagation_events(detected_at)",
        "CREATE INDEX IF NOT EXISTS idx_scheduled_user ON scheduled_monitors(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_channel_user ON channel_risk(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_channel_risk ON channel_risk(risk_score DESC)",
    ]


def init_db():
    if not USE_POSTGRES:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with get_conn() as conn:
        schema = _get_schema()
        if USE_POSTGRES:
            _execute(conn, schema)
        else:
            for stmt in schema.split(";"):
                stmt = stmt.strip()
                if not stmt:
                    continue
                try:
                    conn.execute(stmt)
                except Exception:
                    continue
        _migrate_multi_tenant(conn)
        for stmt in _get_index_statements():
            try:
                _execute(conn, stmt)
            except Exception:
                continue
    db_type = "PostgreSQL" if USE_POSTGRES else "SQLite"
    target = DATABASE_URL.split("@")[-1] if USE_POSTGRES else DB_PATH
    logger.info(f"Database initialized ({db_type}): {target}")


def _migrate_multi_tenant(conn):
    """Add user_id column to existing tables for multi-tenancy."""
    tables = ["assets", "scans", "violations", "propagation_events",
              "scheduled_monitors", "channel_risk"]
    for table in tables:
        try:
            if USE_POSTGRES:
                _execute(conn, f"SAVEPOINT mt_{table}")
                _execute(conn, f"ALTER TABLE {table} ADD COLUMN user_id TEXT")
                _execute(conn, f"RELEASE SAVEPOINT mt_{table}")
                logger.info(f"Added user_id column to {table}")
            else:
                cols = [r["name"] for r in _fetchall(conn, f"PRAGMA table_info({table})")]
                if "user_id" not in cols:
                    _execute(conn, f"ALTER TABLE {table} ADD COLUMN user_id TEXT")
                    logger.info(f"Added user_id column to {table}")
        except Exception:
            if USE_POSTGRES:
                try:
                    _execute(conn, f"ROLLBACK TO SAVEPOINT mt_{table}")
                except Exception:
                    pass

    # PostgreSQL: migrate channel_risk primary key to (user_id, channel)
    if USE_POSTGRES:
        try:
            _execute(conn, "UPDATE channel_risk SET user_id='public' WHERE user_id IS NULL")
            _execute(conn, "ALTER TABLE channel_risk DROP CONSTRAINT IF EXISTS channel_risk_pkey")
            _execute(conn, "ALTER TABLE channel_risk ALTER COLUMN user_id SET NOT NULL")
            _execute(conn, "ALTER TABLE channel_risk ADD CONSTRAINT channel_risk_pkey PRIMARY KEY (user_id, channel)")
        except Exception as e:
            logger.warning(f"channel_risk PK migration skipped: {e}")


# ─── Helpers ─────────────────────────────────────────────────────
def _now():
    return datetime.now(timezone.utc).isoformat()

def _uid():
    return str(uuid.uuid4())[:12]

def _parse_json_fields(d, fields=("frame_hashes", "search_queries", "frame_paths", "assets_affected")):
    """Parse JSON string fields in a dict."""
    if d is None:
        return None
    for k in fields:
        if k in d and isinstance(d[k], str):
            try:
                d[k] = json.loads(d[k])
            except (json.JSONDecodeError, TypeError):
                pass
    return d

def _date_sub(days):
    """Date subtraction SQL fragment."""
    if USE_POSTGRES:
        return f"NOW() - INTERVAL '{days} days'"
    return f"datetime('now','-{days} days')"

def _date_add_hours(hours):
    """Date addition SQL fragment."""
    if USE_POSTGRES:
        return f"NOW() + INTERVAL '{hours} hours'"
    return f"datetime('now','+{hours} hours')"

def _datetime_cast(col):
    """Cast a text timestamp column to a comparable datetime value."""
    if USE_POSTGRES:
        return f"({col})::timestamptz"
    return f"datetime({col})"

def _date_extract(col):
    """Extract date from timestamp column."""
    if USE_POSTGRES:
        return f"DATE(({col})::timestamptz)"
    return f"date({col})"

def _now_sql():
    """Current timestamp in SQL."""
    return "NOW()" if USE_POSTGRES else "datetime('now')"


# ═══ ASSETS ══════════════════════════════════════════════════════
def create_asset(title, filename, file_path, duration, frame_count, has_audio,
                 frame_hashes, audio_fingerprint, frame_paths=None, user_id=None):
    uid = user_id or user_ctx.get()
    aid = _uid()
    cert_data = f"{aid}:{title}:{json.dumps(frame_hashes)}:{audio_fingerprint or ''}"
    cert_hash = hashlib.sha256(cert_data.encode()).hexdigest()
    with get_conn() as c:
        _execute(c, f"""INSERT INTO assets (id,title,filename,file_path,duration,frame_count,
            has_audio,frame_hashes,audio_fingerprint,frame_paths,certificate_hash,registered_at,user_id)
            VALUES ({P},{P},{P},{P},{P},{P},{P},{P},{P},{P},{P},{P},{P})""",
            (aid, title, filename, file_path, duration, frame_count,
             1 if has_audio else 0, json.dumps(frame_hashes),
             audio_fingerprint, json.dumps(frame_paths or []), cert_hash, _now(), uid))
    return aid

def get_asset(asset_id, user_id=None):
    uid = user_id or user_ctx.get()
    with get_conn() as c:
        if uid:
            return _parse_json_fields(_fetchone(c, f"SELECT * FROM assets WHERE id={P} AND user_id={P}", (asset_id, uid)))
        return _parse_json_fields(_fetchone(c, f"SELECT * FROM assets WHERE id={P}", (asset_id,)))

def get_all_assets(user_id=None):
    uid = user_id or user_ctx.get()
    with get_conn() as c:
        if uid:
            return [_parse_json_fields(r) for r in _fetchall(c, f"SELECT * FROM assets WHERE user_id={P} ORDER BY registered_at DESC", (uid,))]
        return [_parse_json_fields(r) for r in _fetchall(c, "SELECT * FROM assets ORDER BY registered_at DESC")]

def delete_asset(asset_id, user_id=None):
    uid = user_id or user_ctx.get()
    if not uid:
        raise ValueError("Cannot delete asset: user_id is required")
    with get_conn() as c:
        asset = _fetchone(c, f"SELECT id FROM assets WHERE id={P} AND user_id={P}", (asset_id, uid))
        if not asset:
            raise ValueError("Asset not found or access denied")
        for tbl in ("scheduled_monitors", "propagation_events", "violations", "scans"):
            _execute(c, f"DELETE FROM {tbl} WHERE asset_id={P} AND user_id={P}", (asset_id, uid))
        _execute(c, f"DELETE FROM assets WHERE id={P} AND user_id={P}", (asset_id, uid))

def update_asset_threshold(asset_id, threshold):
    with get_conn() as c:
        _execute(c, f"UPDATE assets SET confidence_threshold={P} WHERE id={P}", (threshold, asset_id))


# ═══ SCANS ═══════════════════════════════════════════════════════
def create_scan(asset_id, scan_type="manual", user_id=None):
    uid = user_id or user_ctx.get()
    sid = _uid()
    with get_conn() as c:
        _execute(c, f"INSERT INTO scans (id,asset_id,scan_type,status,started_at,user_id) VALUES ({P},{P},{P},'running',{P},{P})",
                 (sid, asset_id, scan_type, _now(), uid))
    return sid

def update_scan(scan_id, **kw):
    allowed = {"status", "search_queries", "youtube_searched", "youtube_sampled",
               "matches_found", "completed_at", "error"}
    u = {k: v for k, v in kw.items() if k in allowed}
    if "search_queries" in u and isinstance(u["search_queries"], list):
        u["search_queries"] = json.dumps(u["search_queries"])
    if not u:
        return
    cols = ", ".join(f"{k}={P}" for k in u)
    vals = list(u.values()) + [scan_id]
    with get_conn() as c:
        _execute(c, f"UPDATE scans SET {cols} WHERE id={P}", vals)

def get_scan(scan_id):
    with get_conn() as c:
        return _parse_json_fields(_fetchone(c, f"SELECT * FROM scans WHERE id={P}", (scan_id,)))

def get_scans_for_asset(asset_id, user_id=None):
    uid = user_id or user_ctx.get()
    with get_conn() as c:
        if uid:
            return [_parse_json_fields(r) for r in _fetchall(c,
                f"SELECT * FROM scans WHERE asset_id={P} AND user_id={P} ORDER BY started_at DESC", (asset_id, uid))]
        return [_parse_json_fields(r) for r in _fetchall(c,
            f"SELECT * FROM scans WHERE asset_id={P} ORDER BY started_at DESC", (asset_id,))]

def get_recent_scans(limit=20, user_id=None):
    uid = user_id or user_ctx.get()
    with get_conn() as c:
        if uid:
            return [_parse_json_fields(r) for r in _fetchall(c,
                f"SELECT s.*,a.title as asset_title FROM scans s JOIN assets a ON s.asset_id=a.id WHERE s.user_id={P} ORDER BY s.started_at DESC LIMIT {P}",
                (uid, limit))]
        return [_parse_json_fields(r) for r in _fetchall(c,
            f"SELECT s.*,a.title as asset_title FROM scans s JOIN assets a ON s.asset_id=a.id ORDER BY s.started_at DESC LIMIT {P}",
            (limit,))]


# ═══ VIOLATIONS ══════════════════════════════════════════════════
def upsert_violation(scan_id, asset_id, match, user_id=None):
    uid = user_id or user_ctx.get()
    with get_conn() as c:
        existing = _fetchone(c, f"SELECT id FROM violations WHERE youtube_id={P} AND asset_id={P}",
                             (match["youtube_id"], asset_id))
        now = _now()
        if existing:
            vid = existing["id"]
            _execute(c, f"""UPDATE violations SET last_seen_at={P},confidence={P},
                visual_similarity={P},audio_similarity={P},scan_id={P},
                category={P},match_type={P},confidence_label={P} WHERE id={P}""",
                (now, match["confidence"], match.get("visual_similarity", 0),
                 match.get("audio_similarity", 0), scan_id, match.get("category", ""),
                 match.get("match_type", ""), match.get("confidence_label", ""), vid))
            return vid
        vid = _uid()
        _execute(c, f"""INSERT INTO violations (id,scan_id,asset_id,youtube_id,title,channel,
            thumbnail,url,confidence,confidence_label,visual_similarity,audio_similarity,
            match_type,category,status,first_detected_at,last_seen_at,user_id)
            VALUES ({P},{P},{P},{P},{P},{P},{P},{P},{P},{P},{P},{P},{P},{P},'detected',{P},{P},{P})""",
            (vid, scan_id, asset_id, match["youtube_id"], match.get("title", ""),
             match.get("channel", ""), match.get("thumbnail", ""), match.get("url", ""),
             match["confidence"], match.get("confidence_label", ""),
             match.get("visual_similarity", 0), match.get("audio_similarity", 0),
             match.get("match_type", ""), match.get("category", ""), now, now, uid))
        return vid

def get_violations(asset_id=None, status=None, limit=100, user_id=None):
    uid = user_id or user_ctx.get()
    q = "SELECT v.*,a.title as asset_title FROM violations v JOIN assets a ON v.asset_id=a.id WHERE 1=1"
    p = []
    if uid:
        q += f" AND v.user_id={P}"; p.append(uid)
    if asset_id:
        q += f" AND v.asset_id={P}"; p.append(asset_id)
    if status:
        q += f" AND v.status={P}"; p.append(status)
    q += f" ORDER BY v.confidence DESC LIMIT {P}"; p.append(limit)
    with get_conn() as c:
        return [_parse_json_fields(r) for r in _fetchall(c, q, p)]

def get_violation(vid, user_id=None):
    uid = user_id or user_ctx.get()
    with get_conn() as c:
        if uid:
            return _parse_json_fields(_fetchone(c,
                f"SELECT v.*,a.title as asset_title FROM violations v JOIN assets a ON v.asset_id=a.id WHERE v.id={P} AND v.user_id={P}", (vid, uid)))
        return _parse_json_fields(_fetchone(c,
            f"SELECT v.*,a.title as asset_title FROM violations v JOIN assets a ON v.asset_id=a.id WHERE v.id={P}", (vid,)))

def update_violation_status(vid, status, notes=None):
    with get_conn() as c:
        _execute(c, f"UPDATE violations SET status={P},notes={P} WHERE id={P}", (status, notes, vid))

def save_takedown_notice(vid, notice_text):
    with get_conn() as c:
        _execute(c, f"UPDATE violations SET takedown_notice={P} WHERE id={P}", (notice_text, vid))

def get_violation_stats(user_id=None):
    uid = user_id or user_ctx.get()
    with get_conn() as c:
        coalesce_fn = "COALESCE"
        where = f"WHERE user_id={P}" if uid else ""
        params = (uid,) if uid else ()
        result = _fetchone(c, f"""SELECT COUNT(*) as total,
            {coalesce_fn}(SUM(CASE WHEN status='detected' THEN 1 ELSE 0 END), 0) as detected,
            {coalesce_fn}(SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END), 0) as confirmed,
            {coalesce_fn}(SUM(CASE WHEN status='dismissed' THEN 1 ELSE 0 END), 0) as dismissed,
            {coalesce_fn}(SUM(CASE WHEN status='takedown' THEN 1 ELSE 0 END), 0) as takedown,
            {coalesce_fn}(SUM(CASE WHEN confidence>=0.75 THEN 1 ELSE 0 END), 0) as high_risk,
            {coalesce_fn}(SUM(CASE WHEN confidence>=0.5 AND confidence<0.75 THEN 1 ELSE 0 END), 0) as medium_risk,
            {coalesce_fn}(SUM(CASE WHEN confidence<0.5 THEN 1 ELSE 0 END), 0) as low_risk,
            {coalesce_fn}(AVG(confidence), 0) as avg_confidence FROM violations {where}""", params)
        return result or {"total": 0, "detected": 0, "confirmed": 0, "dismissed": 0,
                         "takedown": 0, "high_risk": 0, "medium_risk": 0, "low_risk": 0,
                         "avg_confidence": 0}


# ═══ PROPAGATION ═════════════════════════════════════════════════
def record_propagation(asset_id, match, scan_id, user_id=None):
    uid = user_id or user_ctx.get()
    with get_conn() as c:
        _execute(c, f"""INSERT INTO propagation_events (id,asset_id,youtube_id,title,channel,confidence,detected_at,scan_id,user_id)
            VALUES ({P},{P},{P},{P},{P},{P},{P},{P},{P})""",
            (_uid(), asset_id, match["youtube_id"], match.get("title", ""),
             match.get("channel", ""), match["confidence"], _now(), scan_id, uid))

def get_propagation_timeline(asset_id=None, days=30, user_id=None):
    date_col = _date_extract("detected_at")
    time_col = _datetime_cast("detected_at")
    date_filter = _date_sub(days)
    uid = user_id or user_ctx.get()
    q = f"""SELECT {date_col} as date, COUNT(*) as events,
        COUNT(DISTINCT youtube_id) as unique_videos,
        AVG(confidence) as avg_confidence, MAX(confidence) as max_confidence
        FROM propagation_events WHERE {time_col} >= {date_filter}"""
    p = []
    if uid:
        q += f" AND user_id={P}"; p.append(uid)
    if asset_id:
        q += f" AND asset_id={P}"; p.append(asset_id)
    q += f" GROUP BY {date_col} ORDER BY {date_col}"
    with get_conn() as c:
        return _fetchall(c, q, p) if p else _fetchall(c, q)

def get_propagation_channels(asset_id=None, user_id=None):
    uid = user_id or user_ctx.get()
    q = f"""SELECT channel, COUNT(*) as count, AVG(confidence) as avg_confidence,
        COUNT(DISTINCT youtube_id) as unique_videos
        FROM propagation_events WHERE channel != '' """
    p = []
    if uid:
        q += f" AND user_id={P}"; p.append(uid)
    if asset_id:
        q += f" AND asset_id={P}"; p.append(asset_id)
    q += " GROUP BY channel ORDER BY count DESC LIMIT 20"
    with get_conn() as c:
        return _fetchall(c, q, p) if p else _fetchall(c, q)


# ═══ CHANNEL RISK ════════════════════════════════════════════════
def update_channel_risk(channel, confidence, asset_id, user_id=None):
    if not channel:
        return
    uid = user_id or user_ctx.get()
    if not uid:
        return
    with get_conn() as c:
        existing = _fetchone(c, f"SELECT * FROM channel_risk WHERE channel={P} AND user_id={P}", (channel, uid))
        now = _now()
        if existing:
            total = existing["total_violations"] + 1
            high = existing["high_risk_count"] + (1 if confidence >= 0.75 else 0)
            avg_c = (existing["avg_confidence"] * existing["total_violations"] + confidence) / total
            affected = existing.get("assets_affected", "[]")
            if isinstance(affected, str):
                try:
                    affected = json.loads(affected)
                except:
                    affected = []
            if asset_id not in affected:
                affected.append(asset_id)
            risk = min(1.0, (total * 0.15) + (high * 0.25) + (avg_c * 0.3) + (len(affected) * 0.1))
            level = "critical" if risk >= 0.8 else "high" if risk >= 0.6 else "medium" if risk >= 0.3 else "low"
            _execute(c, f"""UPDATE channel_risk SET total_violations={P},high_risk_count={P},
                avg_confidence={P},risk_score={P},risk_level={P},last_seen={P},
                assets_affected={P} WHERE channel={P} AND user_id={P}""",
                (total, high, round(avg_c, 4), round(risk, 4), level, now,
                 json.dumps(affected), channel, uid))
        else:
            risk = 0.15 + (0.25 if confidence >= 0.75 else 0) + confidence * 0.3
            level = "high" if risk >= 0.6 else "medium" if risk >= 0.3 else "low"
            _execute(c, f"""INSERT INTO channel_risk (channel,total_violations,high_risk_count,
                avg_confidence,risk_score,risk_level,first_seen,last_seen,assets_affected,user_id)
                VALUES ({P},1,{P},{P},{P},{P},{P},{P},{P},{P})""",
                (channel, 1 if confidence >= 0.75 else 0, round(confidence, 4),
                 round(risk, 4), level, now, now, json.dumps([asset_id]), uid))

def get_channel_risks(limit=20, user_id=None):
    uid = user_id or user_ctx.get()
    with get_conn() as c:
        if uid:
            return [_parse_json_fields(r) for r in _fetchall(c,
                f"SELECT * FROM channel_risk WHERE user_id={P} ORDER BY risk_score DESC LIMIT {P}", (uid, limit))]
        return [_parse_json_fields(r) for r in _fetchall(c,
            f"SELECT * FROM channel_risk ORDER BY risk_score DESC LIMIT {P}", (limit,))]

def rebuild_channel_risks():
    """Recompute channel risk rows from the current violations table."""
    with get_conn() as c:
        rows = _fetchall(c, """SELECT channel, confidence, asset_id, first_detected_at, last_seen_at, user_id
            FROM violations WHERE channel != '' ORDER BY first_detected_at ASC""")
        _execute(c, "DELETE FROM channel_risk")

        aggregated = {}
        for row in rows:
            channel = row["channel"]
            uid = row.get("user_id") or "public"
            key = (uid, channel)
            entry = aggregated.setdefault(key, {
                "total": 0,
                "high": 0,
                "confidence_sum": 0.0,
                "assets": [],
                "first_seen": row["first_detected_at"],
                "last_seen": row["last_seen_at"],
                "user_id": uid,
            })
            entry["total"] += 1
            entry["high"] += 1 if row["confidence"] >= 0.75 else 0
            entry["confidence_sum"] += row["confidence"]
            if row["asset_id"] not in entry["assets"]:
                entry["assets"].append(row["asset_id"])
            if row["last_seen_at"] > entry["last_seen"]:
                entry["last_seen"] = row["last_seen_at"]

        for key, entry in aggregated.items():
            uid = entry.get("user_id") or "public"
            channel = key[1]
            avg_c = entry["confidence_sum"] / entry["total"]
            risk = min(1.0, (entry["total"] * 0.15) + (entry["high"] * 0.25) + (avg_c * 0.3) + (len(entry["assets"]) * 0.1))
            level = "critical" if risk >= 0.8 else "high" if risk >= 0.6 else "medium" if risk >= 0.3 else "low"
            _execute(c, f"""INSERT INTO channel_risk (channel,total_violations,high_risk_count,
                avg_confidence,risk_score,risk_level,first_seen,last_seen,assets_affected,user_id)
                VALUES ({P},{P},{P},{P},{P},{P},{P},{P},{P},{P})""",
                (channel, entry["total"], entry["high"], round(avg_c, 4), round(risk, 4),
                 level, entry["first_seen"], entry["last_seen"], json.dumps(entry["assets"]), uid))


# ═══ SCHEDULED MONITORS ═════════════════════════════════════════
def create_schedule(asset_id, interval_hours=24, user_id=None):
    uid = user_id or user_ctx.get()
    sid = _uid()
    now_fn = _now_sql()
    with get_conn() as c:
        _execute(c, f"DELETE FROM scheduled_monitors WHERE asset_id={P}", (asset_id,))
        _execute(c, f"""INSERT INTO scheduled_monitors (id,asset_id,interval_hours,is_active,created_at,next_run,user_id)
            VALUES ({P},{P},{P},1,{now_fn},NULL,{P})""", (sid, asset_id, interval_hours, uid))
    return sid

def get_schedules(user_id=None):
    uid = user_id or user_ctx.get()
    with get_conn() as c:
        if uid:
            return [_parse_json_fields(r) for r in _fetchall(c,
                f"SELECT s.*,a.title as asset_title FROM scheduled_monitors s JOIN assets a ON s.asset_id=a.id WHERE s.user_id={P} ORDER BY s.created_at DESC", (uid,))]
        return [_parse_json_fields(r) for r in _fetchall(c,
            "SELECT s.*,a.title as asset_title FROM scheduled_monitors s JOIN assets a ON s.asset_id=a.id ORDER BY s.created_at DESC")]

def get_due_schedules():
    now_fn = _now_sql()
    next_run_col = _datetime_cast("next_run")
    with get_conn() as c:
        return [_parse_json_fields(r) for r in _fetchall(c,
            f"SELECT * FROM scheduled_monitors WHERE is_active=1 AND (next_run IS NULL OR {next_run_col} <= {now_fn})")]

def update_schedule_run(sid, interval_hours):
    now_fn = _now_sql()
    next_fn = _date_add_hours(interval_hours)
    with get_conn() as c:
        _execute(c, f"UPDATE scheduled_monitors SET last_run={now_fn},next_run={next_fn} WHERE id={P}", (sid,))

def toggle_schedule(sid, active):
    with get_conn() as c:
        _execute(c, f"UPDATE scheduled_monitors SET is_active={P} WHERE id={P}", (1 if active else 0, sid))

def delete_schedule(sid):
    with get_conn() as c:
        _execute(c, f"DELETE FROM scheduled_monitors WHERE id={P}", (sid,))


# ═══ DASHBOARD ═══════════════════════════════════════════════════
def get_dashboard_stats(user_id=None):
    uid = user_id or user_ctx.get()
    with get_conn() as c:
        if uid:
            a = _fetchone(c, f"SELECT COUNT(*) as cnt FROM assets WHERE user_id={P}", (uid,))["cnt"]
            s = _fetchone(c, f"SELECT COUNT(*) as cnt FROM scans WHERE user_id={P}", (uid,))["cnt"]
            v = _fetchone(c, f"SELECT COUNT(*) as cnt FROM violations WHERE user_id={P}", (uid,))["cnt"]
            h = _fetchone(c, f"SELECT COUNT(*) as cnt FROM violations WHERE confidence>=0.75 AND user_id={P}", (uid,))["cnt"]
            p = _fetchone(c, f"SELECT COUNT(*) as cnt FROM propagation_events WHERE user_id={P}", (uid,))["cnt"]
            ch = _fetchone(c, f"SELECT COUNT(*) as cnt FROM channel_risk WHERE risk_level IN ('high','critical') AND user_id={P}", (uid,))["cnt"]
            rs = _fetchone(c, f"SELECT completed_at FROM scans WHERE user_id={P} ORDER BY started_at DESC LIMIT 1", (uid,))
            sc = _fetchone(c, f"SELECT COUNT(*) as cnt FROM scheduled_monitors WHERE is_active=1 AND user_id={P}", (uid,))["cnt"]
        else:
            a = _fetchone(c, "SELECT COUNT(*) as cnt FROM assets")["cnt"]
            s = _fetchone(c, "SELECT COUNT(*) as cnt FROM scans")["cnt"]
            v = _fetchone(c, "SELECT COUNT(*) as cnt FROM violations")["cnt"]
            h = _fetchone(c, "SELECT COUNT(*) as cnt FROM violations WHERE confidence>=0.75")["cnt"]
            p = _fetchone(c, "SELECT COUNT(*) as cnt FROM propagation_events")["cnt"]
            ch = _fetchone(c, "SELECT COUNT(*) as cnt FROM channel_risk WHERE risk_level IN ('high','critical')")["cnt"]
            rs = _fetchone(c, "SELECT completed_at FROM scans ORDER BY started_at DESC LIMIT 1")
            sc = _fetchone(c, "SELECT COUNT(*) as cnt FROM scheduled_monitors WHERE is_active=1")["cnt"]
    return {
        "total_assets": a, "total_scans": s, "total_violations": v,
        "high_risk_violations": h, "propagation_events": p,
        "risky_channels": ch, "active_monitors": sc,
        "last_scan": rs["completed_at"] if rs else None
    }
