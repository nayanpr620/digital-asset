"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import axios from "axios";
import Link from "next/link";
import { API_URL as API } from "@/lib/api";

export default function AssetDetailPage() {
  const params = useParams();
  const assetId = params.id as string;
  const [asset, setAsset] = useState<any>(null);
  const [scans, setScans] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [certModal, setCertModal] = useState<any>(null);

  const load = async () => {
    try {
      const r = await axios.get(`${API}/assets/${assetId}`);
      setAsset(r.data.asset);
      setScans(r.data.scans || []);
      setViolations(r.data.violations || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [assetId]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await axios.post(`${API}/assets/${assetId}/scan`);
      setTimeout(load, 2000);
    } catch (e: any) {
      alert(e.response?.data?.detail || e.message);
    } finally {
      setScanning(false);
    }
  };

  const viewCert = async () => {
    try {
      const r = await axios.get(`${API}/assets/${assetId}/certificate`);
      setCertModal(r.data);
    } catch (e) {
      alert("Certificate unavailable");
    }
  };

  const confColor = (c: number) =>
    c >= 0.75 ? "risk-critical" : c >= 0.5 ? "risk-medium" : "risk-low";

  const statusBadge = (s: string) =>
    ({
      running: "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30",
      completed: "bg-green-500/15 text-green-400 border border-green-500/30",
      failed: "bg-red-500/15 text-red-400 border border-red-500/30",
      pending: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
    }[s] || "bg-gray-500/15 text-gray-400 border border-gray-500/30");

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <div className="skeleton h-8 w-72" />
        <div className="skeleton h-48" />
        <div className="skeleton h-64" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="p-8">
        <div className="card p-12 text-center" style={{ color: "var(--text-muted)" }}>
          <div className="text-4xl mb-3">❌</div>
          <p className="font-semibold">Asset not found</p>
          <Link href="/assets" className="text-xs mt-2 hover:underline" style={{ color: "var(--accent-hover)" }}>
            ← Back to Asset Registry
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs mb-6 animate-slide-up" style={{ color: "var(--text-muted)" }}>
        <Link href="/assets" className="hover:underline" style={{ color: "var(--accent-hover)" }}>Assets</Link>
        <span>→</span>
        <span>{asset.title}</span>
      </div>

      {/* Asset Header */}
      <div className="card p-6 mb-6 animate-slide-up" style={{ animationDelay: "100ms" }}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
              style={{ background: "var(--gradient-1)", boxShadow: "0 4px 20px rgba(99,102,241,0.3)" }}
            >
              🎬
            </div>
            <div>
              <h1 className="text-xl lg:text-2xl font-extrabold tracking-tight">{asset.title}</h1>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                {asset.filename} • Registered {new Date(asset.registered_at).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleScan}
              disabled={scanning}
              className="px-5 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 animate-gradient"
              style={{ background: "var(--gradient-2)", boxShadow: "0 4px 15px rgba(6,182,212,0.3)" }}
            >
              {scanning ? "⏳ Scanning..." : "🔍 Scan Now"}
            </button>
            <button
              onClick={viewCert}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold transition-all"
              style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", color: "var(--accent-hover)" }}
            >
              🔐 Certificate
            </button>
          </div>
        </div>

        {/* Asset Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-6">
          {[
            { label: "Frames", value: asset.frame_count, icon: "🖼" },
            { label: "Duration", value: asset.duration ? `${Math.round(asset.duration)}s` : "—", icon: "⏱" },
            { label: "Audio", value: asset.has_audio ? "Present" : "None", icon: "🎵" },
            { label: "Threshold", value: `${((asset.confidence_threshold || 0.15) * 100).toFixed(0)}%`, icon: "🎯" },
            { label: "Violations", value: violations.length, icon: "🚨" },
          ].map((s) => (
            <div key={s.label} className="p-3 rounded-xl text-center" style={{ background: "var(--bg-elevated)" }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                {s.icon} {s.label}
              </div>
              <div className="text-lg font-black">{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Violations for this asset */}
        <div className="card overflow-hidden animate-slide-up" style={{ animationDelay: "200ms" }}>
          <div className="p-5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2">
              <span>🚨</span>
              <h2 className="font-bold text-sm">Violations ({violations.length})</h2>
            </div>
          </div>
          {violations.length > 0 ? (
            <div>
              {violations.map((v, i) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 p-4 transition-colors hover:bg-[var(--bg-elevated)]"
                  style={{ borderBottom: i < violations.length - 1 ? "1px solid var(--border)" : "none" }}
                >
                  {v.thumbnail && (
                    <img src={v.thumbnail} alt="" className="w-12 h-7 rounded object-cover" style={{ border: "1px solid var(--border)" }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{v.title}</p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{v.channel}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${confColor(v.confidence)}`}>
                    {(v.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center" style={{ color: "var(--text-muted)" }}>
              <p className="text-2xl mb-2">✅</p>
              <p className="text-xs">No violations detected for this asset</p>
            </div>
          )}
        </div>

        {/* Scan History */}
        <div className="card overflow-hidden animate-slide-up" style={{ animationDelay: "300ms" }}>
          <div className="p-5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2">
              <span>🔍</span>
              <h2 className="font-bold text-sm">Scan History ({scans.length})</h2>
            </div>
          </div>
          {scans.length > 0 ? (
            <div>
              {scans.map((s, i) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 p-4 transition-colors hover:bg-[var(--bg-elevated)]"
                  style={{ borderBottom: i < scans.length - 1 ? "1px solid var(--border)" : "none" }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{s.scan_type} scan</p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {new Date(s.started_at).toLocaleString()} • {s.youtube_searched} searched
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${statusBadge(s.status)}`}>
                    {s.status}
                  </span>
                  <span className={`text-xs font-bold ${s.matches_found > 0 ? "text-red-400" : "text-green-400"}`}>
                    {s.matches_found} matches
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center" style={{ color: "var(--text-muted)" }}>
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-xs">No scans yet — click &quot;Scan Now&quot; to start</p>
            </div>
          )}
        </div>
      </div>

      {/* Fingerprint Details */}
      <div className="card p-6 mt-6 animate-slide-up" style={{ animationDelay: "400ms" }}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🔐</span>
          <h2 className="font-bold text-sm">Fingerprint Data</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Certificate Hash (SHA-256)</p>
            <div className="p-3 rounded-lg font-mono text-[10px] break-all" style={{ background: "var(--bg-primary)", color: "var(--accent-hover)" }}>
              {asset.certificate_hash}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Visual Hashes (pHash-16)</p>
            <div className="p-3 rounded-lg text-[10px] max-h-24 overflow-y-auto" style={{ background: "var(--bg-primary)", color: "var(--text-muted)" }}>
              {asset.frame_hashes?.length > 0
                ? asset.frame_hashes.slice(0, 8).join(", ") + (asset.frame_hashes.length > 8 ? ` ... (+${asset.frame_hashes.length - 8} more)` : "")
                : "No visual hashes"}
            </div>
          </div>
        </div>
      </div>

      {/* Certificate Modal */}
      {certModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">🔐</span>
                <h2 className="font-bold">Digital Authentication Certificate</h2>
              </div>
              <button onClick={() => setCertModal(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-white/5">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-4 rounded-xl text-center" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                <div className="text-3xl mb-2">🛡</div>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--accent-hover)" }}>{certModal.certificate_type}</p>
                <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Version {certModal.version}</p>
              </div>
              {[
                { l: "Asset", v: certModal.title },
                { l: "Asset ID", v: certModal.asset_id },
                { l: "Registered", v: new Date(certModal.registered_at).toLocaleString() },
                { l: "Issuer", v: certModal.issuer },
                { l: "Algorithm", v: certModal.fingerprint?.algorithm },
                { l: "Frames", v: certModal.fingerprint?.frame_count },
                { l: "Audio", v: certModal.fingerprint?.has_audio ? "✅ Present" : "❌ None" },
                { l: "Duration", v: `${certModal.fingerprint?.duration_seconds}s` },
                { l: "Status", v: certModal.status?.toUpperCase() },
              ].map((r) => (
                <div key={r.l} className="flex justify-between text-xs py-1" style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                  <span style={{ color: "var(--text-muted)" }}>{r.l}</span>
                  <span className="font-medium">{r.v}</span>
                </div>
              ))}
              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Certificate Hash (SHA-256)</p>
                <div className="p-3 rounded-lg font-mono text-[10px] break-all" style={{ background: "var(--bg-primary)", color: "var(--accent-hover)" }}>
                  {certModal.certificate_hash}
                </div>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {certModal.verification}
              </p>
            </div>
            <div className="p-4 flex justify-end" style={{ borderTop: "1px solid var(--border)" }}>
              <button
                onClick={() => { navigator.clipboard.writeText(JSON.stringify(certModal, null, 2)); alert("Certificate copied!"); }}
                className="px-4 py-2 rounded-xl text-xs font-semibold"
                style={{ background: "var(--gradient-1)" }}
              >
                📋 Copy Certificate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
