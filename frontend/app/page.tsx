"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { API_URL as API, WS_URL } from "@/lib/api";

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [violations, setViolations] = useState<any[]>([]);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [anomalies, setAnomalies] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [scanningAll, setScanningAll] = useState(false);
  const [scanResult, setScanResult] = useState<string>("");
  const [systemHealth, setSystemHealth] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, v, sc, h] = await Promise.all([
          axios.get(`${API}/analytics/dashboard`),
          axios.get(`${API}/violations?limit=5`),
          axios.get(`${API}/scans?limit=5`),
          axios.get(`${API}/health`).catch(() => ({ data: null })),
        ]);
        setStats(s.data);
        setViolations(v.data.violations || []);
        setRecentScans(sc.data.scans || []);
        setSystemHealth(h.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Run anomaly detection manually — don't auto-call on every page load
  const runAnomalyDetection = async () => {
    try {
      const a = await axios.get(`${API}/analytics/anomalies`);
      setAnomalies(a.data);
    } catch (e) {
      console.error(e);
    }
  };

  const scanAll = async () => {
    setScanningAll(true);
    setScanResult("");
    try {
      const r = await axios.post(`${API}/assets/scan-all`);
      setScanResult(
        `✅ Started ${r.data.total} scans! Check the Monitor page for progress.`
      );
    } catch (e: any) {
      setScanResult(
        `❌ ${e.response?.data?.detail || e.message}`
      );
    } finally {
      setScanningAll(false);
      setTimeout(() => setScanResult(""), 6000);
    }
  };

  if (loading)
    return (
      <div className="p-8 space-y-4">
        <div className="skeleton h-8 w-72" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-28" />
          ))}
        </div>
        <div className="skeleton h-64" />
      </div>
    );

  const cards = [
    {
      label: "Protected Assets",
      value: stats?.total_assets ?? 0,
      icon: "🗂",
      gradient: "from-indigo-500 to-purple-600",
      href: "/assets",
    },
    {
      label: "Total Scans",
      value: stats?.total_scans ?? 0,
      icon: "🔍",
      gradient: "from-cyan-500 to-blue-600",
      href: "/monitor",
    },
    {
      label: "Violations",
      value: stats?.total_violations ?? 0,
      icon: "🚨",
      gradient: "from-rose-500 to-pink-600",
      href: "/violations",
    },
    {
      label: "High Risk",
      value: stats?.high_risk_violations ?? 0,
      icon: "⚠️",
      gradient: "from-orange-500 to-red-600",
      href: "/violations",
    },
    {
      label: "Propagation Events",
      value: stats?.propagation_events ?? 0,
      icon: "📡",
      gradient: "from-violet-500 to-purple-600",
      href: "/analytics",
    },
    {
      label: "Risky Channels",
      value: stats?.risky_channels ?? 0,
      icon: "📺",
      gradient: "from-amber-500 to-orange-600",
      href: "/analytics",
    },
    {
      label: "Active Monitors",
      value: stats?.active_monitors ?? 0,
      icon: "⏱",
      gradient: "from-emerald-500 to-green-600",
      href: "/settings",
    },
    {
      label: "Last Scan",
      value: stats?.last_scan
        ? new Date(stats.last_scan).toLocaleDateString()
        : "Never",
      icon: "📅",
      gradient: "from-sky-500 to-blue-600",
      href: "/monitor",
    },
  ];

  const riskColors: Record<string, string> = {
    critical: "risk-critical",
    high: "risk-high",
    medium: "risk-medium",
    low: "risk-low",
    unknown: "risk-medium",
  };

  const statusBadge = (s: string) =>
    ({
      running:
        "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30",
      completed:
        "bg-green-500/15 text-green-400 border border-green-500/30",
      failed: "bg-red-500/15 text-red-400 border border-red-500/30",
      pending:
        "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
    }[s] || "bg-gray-500/15 text-gray-400 border border-gray-500/30");

  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4 animate-slide-up">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight mb-1">
            Dashboard
          </h1>
          <p
            style={{ color: "var(--text-secondary)" }}
            className="text-sm"
          >
            Protecting the integrity of digital sports media — real-time
            monitoring & AI-powered detection
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={scanAll}
            disabled={scanningAll || (stats?.total_assets ?? 0) === 0}
            className="px-5 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 animate-gradient whitespace-nowrap"
            style={{
              background: "var(--gradient-2)",
              boxShadow: "0 4px 15px rgba(6,182,212,0.3)",
            }}
          >
            {scanningAll ? "⏳ Scanning..." : "🚀 Scan All Assets"}
          </button>
        </div>
      </div>

      {scanResult && (
        <div
          className="mb-6 p-4 rounded-xl text-sm animate-slide-up"
          style={{
            background: scanResult.startsWith("✅")
              ? "rgba(34,197,94,0.08)"
              : "rgba(239,68,68,0.08)",
            border: scanResult.startsWith("✅")
              ? "1px solid rgba(34,197,94,0.25)"
              : "1px solid rgba(239,68,68,0.25)",
            color: scanResult.startsWith("✅") ? "#4ade80" : "#f87171",
          }}
        >
          {scanResult}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-8">
        {cards.map((c, i) => (
          <Link
            key={c.label}
            href={c.href}
            className="stat-card group animate-slide-up"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className="text-[10px] lg:text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                {c.label}
              </span>
              <div
                className={`w-7 h-7 lg:w-8 lg:h-8 rounded-lg bg-gradient-to-br ${c.gradient} flex items-center justify-center text-sm shadow-lg group-hover:scale-110 transition-transform`}
              >
                {c.icon}
              </div>
            </div>
            <div
              className="text-2xl lg:text-3xl font-black animate-count-up"
              style={{ animationDelay: `${i * 80 + 200}ms` }}
            >
              {c.value}
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* AI Threat Analysis */}
        <div
          className="lg:col-span-1 card p-6 animate-slide-up"
          style={{ animationDelay: "400ms" }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">🧠</span>
              <h2 className="font-bold text-sm">AI Threat Analysis</h2>
            </div>
            {!anomalies && (
              <button
                onClick={runAnomalyDetection}
                className="px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
                style={{
                  background: "rgba(99,102,241,0.1)",
                  border: "1px solid rgba(99,102,241,0.3)",
                  color: "var(--accent-hover)",
                }}
              >
                ▶ Analyze
              </button>
            )}
          </div>
          {anomalies ? (
            <>
              <div
                className={`inline-flex px-3 py-1.5 rounded-lg text-xs font-bold mb-3 ${
                  riskColors[anomalies.risk_level] || "risk-medium"
                }`}
              >
                {(anomalies.risk_level || "unknown").toUpperCase()} RISK
              </div>
              <p
                className="text-xs mb-4 leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {anomalies.summary || "No analysis available"}
              </p>
              {anomalies.anomalies?.length > 0 && (
                <div className="space-y-2">
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Anomalies Detected
                  </p>
                  {anomalies.anomalies
                    .slice(0, 3)
                    .map((a: string, i: number) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-xs"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        <span className="text-orange-400 mt-0.5">●</span>{" "}
                        {a}
                      </div>
                    ))}
                </div>
              )}
            </>
          ) : (
            <div
              className="text-center py-6"
              style={{ color: "var(--text-muted)" }}
            >
              <p className="text-2xl mb-2">🔒</p>
              <p className="text-xs">
                Click &quot;Analyze&quot; to generate AI threat analysis
              </p>
            </div>
          )}
        </div>

        {/* Recent Violations */}
        <div
          className="lg:col-span-2 card overflow-hidden animate-slide-up"
          style={{ animationDelay: "500ms" }}
        >
          <div
            className="flex items-center justify-between p-5"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-2">
              <span>🚨</span>
              <h2 className="font-bold text-sm">Recent Violations</h2>
            </div>
            <Link
              href="/violations"
              className="text-xs font-medium hover:underline"
              style={{ color: "var(--accent-hover)" }}
            >
              View all →
            </Link>
          </div>
          {violations.length > 0 ? (
            <div style={{ borderColor: "var(--border)" }}>
              {violations.map((v, i) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 p-4 transition-colors hover:bg-[var(--bg-elevated)] animate-slide-up"
                  style={{
                    borderBottom:
                      i < violations.length - 1
                        ? "1px solid var(--border)"
                        : "none",
                    animationDelay: `${600 + i * 80}ms`,
                  }}
                >
                  {v.thumbnail && (
                    <img
                      src={v.thumbnail}
                      alt=""
                      className="w-14 h-8 rounded-lg object-cover"
                      style={{ border: "1px solid var(--border)" }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">
                      {v.title}
                    </p>
                    <p
                      className="text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {v.channel} • {v.asset_title}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold ${
                      v.confidence >= 0.75
                        ? "risk-critical"
                        : v.confidence >= 0.5
                        ? "risk-medium"
                        : "risk-low"
                    }`}
                  >
                    {(v.confidence * 100).toFixed(0)}%
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-semibold uppercase ${
                      v.status === "detected"
                        ? "risk-high"
                        : v.status === "confirmed"
                        ? "risk-critical"
                        : "risk-low"
                    }`}
                  >
                    {v.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="p-10 text-center"
              style={{ color: "var(--text-muted)" }}
            >
              <div className="text-3xl mb-2">🔒</div>
              <p className="text-sm font-medium">No violations detected</p>
              <p className="text-xs mt-1">
                <Link
                  href="/assets"
                  className="hover:underline"
                  style={{ color: "var(--accent-hover)" }}
                >
                  Register an asset
                </Link>{" "}
                and scan to start.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Scans Section */}
      <div
        className="card overflow-hidden animate-slide-up mb-6"
        style={{ animationDelay: "600ms" }}
      >
        <div
          className="flex items-center justify-between p-5"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <span>🔍</span>
            <h2 className="font-bold text-sm">Recent Scans</h2>
          </div>
          <Link
            href="/monitor"
            className="text-xs font-medium hover:underline"
            style={{ color: "var(--accent-hover)" }}
          >
            View all →
          </Link>
        </div>
        {recentScans.length > 0 ? (
          <div>
            {recentScans.map((s, i) => (
              <div
                key={s.id}
                className="flex items-center gap-4 p-4 transition-colors hover:bg-[var(--bg-elevated)] animate-slide-up"
                style={{
                  borderBottom:
                    i < recentScans.length - 1
                      ? "1px solid var(--border)"
                      : "none",
                  animationDelay: `${700 + i * 60}ms`,
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">
                    {s.asset_title || s.asset_id}
                  </p>
                  <p
                    className="text-[10px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {new Date(s.started_at).toLocaleString()} •{" "}
                    {s.scan_type}
                  </p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${statusBadge(
                    s.status
                  )}`}
                >
                  {s.status === "running"
                    ? "⏳ Running"
                    : s.status === "completed"
                    ? "✅ Done"
                    : s.status === "failed"
                    ? "❌ Failed"
                    : s.status}
                </span>
                <span
                  className={`text-sm font-black ${
                    s.matches_found > 0 ? "text-red-400" : "text-green-400"
                  }`}
                >
                  {s.matches_found} matches
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="p-8 text-center"
            style={{ color: "var(--text-muted)" }}
          >
            <p className="text-2xl mb-2">🔍</p>
            <p className="text-xs">No scans yet — register an asset and start scanning</p>
          </div>
        )}
      </div>

      {/* System Health */}
      {systemHealth && (
        <div
          className="card p-5 animate-slide-up"
          style={{ animationDelay: "700ms" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span>🏥</span>
            <h2 className="font-bold text-sm">System Health</h2>
            <span
              className={`ml-auto px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                systemHealth.status === "ok"
                  ? "risk-low"
                  : "risk-medium"
              }`}
            >
              {systemHealth.status?.toUpperCase()}
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(systemHealth.dependencies || {}).map(
              ([key, val]: [string, any]) => (
                <div
                  key={key}
                  className="p-3 rounded-xl"
                  style={{
                    background: "var(--bg-elevated)",
                  }}
                >
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {key}
                  </p>
                  <p className="text-xs font-medium">
                    {typeof val === "string" ? (
                      <span
                        style={{
                          color:
                            val === "connected" || val === "available"
                              ? "#4ade80"
                              : "#facc15",
                        }}
                      >
                        {val}
                      </span>
                    ) : (
                      <span
                        style={{
                          color:
                            val?.status === "healthy" ||
                            val?.status === "disabled"
                              ? "#4ade80"
                              : "#facc15",
                        }}
                      >
                        {val?.message || val?.status || "unknown"}
                      </span>
                    )}
                  </p>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
