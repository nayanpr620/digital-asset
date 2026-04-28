"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import { API_URL as API, WS_URL } from "@/lib/api";

export default function MonitorPage() {
  const [scans, setScans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsMessages, setWsMessages] = useState<any[]>([]);

  const load = async () => {
    try { const r = await axios.get(`${API}/scans?limit=50`); setScans(r.data.scans || []); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 4000);

    let isActive = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (!isActive) return;
      try {
        ws = new WebSocket(WS_URL);
        ws.onmessage = (e) => {
          const data = JSON.parse(e.data);
          setWsMessages(prev => [data, ...prev].slice(0, 20));
          if (data.type === "scan_complete" || data.type === "scan_error") load();
        };
        ws.onclose = () => {
          if (!isActive) return;
          reconnectTimer = setTimeout(connect, 3000);
        };
      } catch (e) {
        console.error(e);
      }
    };

    connect();

    return () => {
      isActive = false;
      clearInterval(interval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const statusBadge = (s: string) => ({
    running: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    completed: "bg-green-500/15 text-green-400 border-green-500/30",
    failed: "bg-red-500/15 text-red-400 border-red-500/30",
    pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  }[s] || "bg-gray-500/15 text-gray-400 border-gray-500/30");

  return (
    <div className="p-8 max-w-[1400px]">
      <div className="mb-8 animate-slide-up">
        <h1 className="text-2xl font-extrabold tracking-tight mb-1">Monitor & Scan</h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Real-time scan tracking with WebSocket live updates</p>
      </div>

      {/* Live feed (Feature 6) */}
      {wsMessages.length > 0 && (
        <div className="card p-4 mb-6 animate-slide-up">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Live Feed</span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {wsMessages.map((m, i) => (
              <div key={i} className="flex items-center gap-2 text-xs py-1 animate-fade-in" style={{ color: "var(--text-muted)" }}>
                <span className={m.type === "scan_complete" ? "text-green-400" : m.type === "scan_error" ? "text-red-400" : "text-cyan-400"}>
                  {m.type === "scan_complete" ? "✅" : m.type === "scan_error" ? "❌" : "⏳"}
                </span>
                <span>{m.message || `${m.type}: ${m.matches !== undefined ? `${m.matches} matches` : m.stage || ""}`}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active scan indicator */}
      {scans.some(s => s.status === "running") && (
        <div className="mb-6 p-4 rounded-xl animate-pulse-glow flex items-center gap-3"
          style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.25)" }}>
          <div className="flex gap-1">
            {[0, 150, 300].map(d => <span key={d} className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
          </div>
          <span className="text-sm font-medium" style={{ color: "#22d3ee" }}>
            Scan in progress — searching YouTube, fingerprinting, running match engine...
          </span>
        </div>
      )}

      {/* Scan table */}
      <div className="card overflow-hidden animate-slide-up" style={{ animationDelay: "100ms" }}>
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="font-bold">Scan History</h2>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Auto-refresh 4s • WebSocket live</span>
          </div>
        </div>
        {scans.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
                  <th className="text-left p-4 font-semibold">Asset</th>
                  <th className="text-left p-4 font-semibold">Type</th>
                  <th className="text-left p-4 font-semibold">Status</th>
                  <th className="text-left p-4 font-semibold">YouTube</th>
                  <th className="text-left p-4 font-semibold">Matches</th>
                  <th className="text-left p-4 font-semibold">Started</th>
                  <th className="text-left p-4 font-semibold">Queries</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((s, i) => (
                  <tr key={s.id} className="transition-colors hover:bg-[var(--bg-elevated)] animate-slide-up"
                    style={{ borderBottom: "1px solid var(--border)", animationDelay: `${200 + i * 40}ms` }}>
                    <td className="p-4 text-sm font-medium">{s.asset_title || s.asset_id}</td>
                    <td className="p-4"><span className="px-2 py-0.5 rounded text-[10px] capitalize" style={{ background: s.scan_type === "scheduled" ? "rgba(168,85,247,0.1)" : "var(--bg-elevated)", color: s.scan_type === "scheduled" ? "#a855f7" : "var(--text-secondary)" }}>{s.scan_type}</span></td>
                    <td className="p-4"><span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${statusBadge(s.status)}`}>{s.status === "running" ? "⏳ Running" : s.status === "completed" ? "✅ Done" : s.status === "failed" ? "❌ Failed" : s.status}</span></td>
                    <td className="p-4 text-sm" style={{ color: "var(--text-secondary)" }}>{s.youtube_searched} found / {s.youtube_sampled} sampled</td>
                    <td className="p-4"><span className={`text-sm font-black ${s.matches_found > 0 ? "text-red-400" : "text-green-400"}`}>{s.matches_found}</span></td>
                    <td className="p-4 text-[11px]" style={{ color: "var(--text-muted)" }}>{new Date(s.started_at).toLocaleString()}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1 max-w-[160px]">
                        {(s.search_queries || []).slice(0, 2).map((q: string, qi: number) => (
                          <span key={qi} className="px-1.5 py-0.5 rounded text-[9px] truncate max-w-[100px]" style={{ background: "var(--bg-primary)", color: "var(--text-muted)" }}>{q}</span>
                        ))}
                        {(s.search_queries || []).length > 2 && <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>+{s.search_queries.length - 2}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center" style={{ color: "var(--text-muted)" }}>
            <div className="text-4xl mb-3">🔍</div>
            <p className="font-semibold">No scans yet</p>
            <p className="text-xs mt-1">Go to Asset Registry → click Scan</p>
          </div>
        )}
      </div>
    </div>
  );
}
