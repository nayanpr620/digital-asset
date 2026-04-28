"use client";
import { useEffect, useState, useRef } from "react";
import axios from "axios";
import Link from "next/link";
import { API_URL as API } from "@/lib/api";

export default function AssetsPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const r = await axios.get(`${API}/assets`);
      setAssets(r.data.assets || []);
    } catch (e) {
      console.error(e);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const handleRegister = async () => {
    if (!file) return;
    setUploading(true);
    setProgress("Uploading & fingerprinting...");
    try {
      const form = new FormData();
      form.append("file", file);
      if (title) form.append("title", title);
      const r = await axios.post(`${API}/assets/register`, form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      });
      const storageBadge = r.data.storage === "gcs" ? "☁️ Cloud" : "💾 Local";
      setProgress(
        `✅ Registered! ${storageBadge} • Certificate: ${r.data.certificate_hash?.slice(0, 16)}...`
      );
      setFile(null);
      setTitle("");
      load();
      setTimeout(() => setProgress(""), 5000);
    } catch (e: any) {
      setProgress(`❌ ${e.response?.data?.detail || e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this asset and all its data?")) return;
    await axios.delete(`${API}/assets/${id}`);
    load();
  };

  const handleScan = async (id: string) => {
    try {
      await axios.post(`${API}/assets/${id}/scan`);
      alert("🔍 Scan started! Check Monitor page.");
    } catch (e: any) {
      alert(e.response?.data?.detail || e.message);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      <div className="mb-8 animate-slide-up">
        <h1 className="text-2xl font-extrabold tracking-tight mb-1">
          Asset Registry
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Register, authenticate, and protect official sports media
        </p>
      </div>

      {/* Register */}
      <div
        className="card p-6 mb-8 animate-slide-up"
        style={{ animationDelay: "100ms" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🔐</span>
          <h2 className="font-bold">Register New Asset</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label
              className="block text-[10px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: "var(--text-muted)" }}
            >
              Video File
            </label>
            <div
              className={`rounded-2xl p-8 text-center cursor-pointer transition-all ${
                dragActive
                  ? "border-indigo-500 shadow-lg shadow-indigo-500/10"
                  : file
                  ? "border-green-500/40"
                  : ""
              }`}
              style={{
                border: `2px dashed ${
                  dragActive
                    ? "var(--accent)"
                    : file
                    ? "rgba(34,197,94,0.4)"
                    : "var(--border)"
                }`,
                background: dragActive
                  ? "rgba(99,102,241,0.05)"
                  : file
                  ? "rgba(34,197,94,0.03)"
                  : "transparent",
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (e.dataTransfer.files[0]) {
                  setFile(e.dataTransfer.files[0]);
                  if (!title)
                    setTitle(
                      e.dataTransfer.files[0].name
                        .replace(/\.[^.]+$/, "")
                        .replace(/[_-]/g, " ")
                    );
                }
              }}
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    setFile(e.target.files[0]);
                    if (!title)
                      setTitle(
                        e.target.files[0].name
                          .replace(/\.[^.]+$/, "")
                          .replace(/[_-]/g, " ")
                      );
                  }
                }}
              />
              {file ? (
                <div>
                  <p className="text-green-400 font-semibold text-sm">
                    ✅ {file.name}
                  </p>
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-3xl mb-2">📁</p>
                  <p
                    className="text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Drop video or click to browse
                  </p>
                  <p
                    className="text-[10px] mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    MP4, AVI, MKV, MOV • Max 500 MB
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col justify-between">
            <div>
              <label
                className="block text-[10px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                Asset Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. IPL 2024 Final — CSK vs MI Highlights"
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none transition-all"
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              />
              <p
                className="text-[10px] mt-1.5"
                style={{ color: "var(--text-muted)" }}
              >
                A clear title helps Gemini AI generate better search queries
              </p>
            </div>
            <button
              onClick={handleRegister}
              disabled={!file || uploading}
              className="mt-4 w-full py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-40 animate-gradient"
              style={{
                background: "var(--gradient-1)",
                boxShadow: "0 4px 20px rgba(99,102,241,0.3)",
              }}
            >
              {uploading ? "⏳ Processing..." : "🔐 Register & Fingerprint"}
            </button>
          </div>
        </div>
        {progress && (
          <p
            className="mt-3 text-sm animate-fade-in"
            style={{ color: "var(--text-secondary)" }}
          >
            {progress}
          </p>
        )}
      </div>

      {/* Asset list */}
      <div
        className="card overflow-hidden animate-slide-up"
        style={{ animationDelay: "200ms" }}
      >
        <div
          className="p-5 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2 className="font-bold">Registered Assets ({assets.length})</h2>
          <span
            className="text-[10px] px-2 py-1 rounded-lg"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-muted)",
            }}
          >
            🔐 pHash + Chromaprint fingerprinted
          </span>
        </div>
        {assets.length > 0 ? (
          <div>
            {assets.map((a, i) => (
              <div
                key={a.id}
                className="flex items-center gap-4 p-4 transition-colors hover:bg-[var(--bg-elevated)] animate-slide-up"
                style={{
                  borderBottom: "1px solid var(--border)",
                  animationDelay: `${300 + i * 60}ms`,
                }}
              >
                <Link
                  href={`/assets/${a.id}`}
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-lg hover:scale-110 transition-transform"
                  style={{
                    background: "var(--gradient-1)",
                    boxShadow: "0 2px 10px rgba(99,102,241,0.2)",
                  }}
                >
                  🎬
                </Link>
                <Link href={`/assets/${a.id}`} className="flex-1 min-w-0 group">
                  <p className="text-sm font-semibold truncate group-hover:text-indigo-300 transition-colors">
                    {a.title}
                  </p>
                  <p
                    className="text-[10px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {a.frame_count} frames •{" "}
                    {a.has_audio ? "🎵 Audio" : "No audio"}
                    {a.duration ? ` • ${Math.round(a.duration)}s` : ""} •
                    Registered{" "}
                    {new Date(a.registered_at).toLocaleDateString()}
                  </p>
                </Link>
                <div
                  className="flex items-center gap-1.5 text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  🎯 {((a.confidence_threshold || 0.15) * 100).toFixed(0)}%
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleScan(a.id)}
                    className="px-3 py-2 rounded-xl text-[11px] font-semibold transition-all"
                    style={{
                      background: "rgba(6,182,212,0.1)",
                      border: "1px solid rgba(6,182,212,0.3)",
                      color: "#22d3ee",
                    }}
                  >
                    🔍 Scan
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="px-2.5 py-2 rounded-xl text-[11px] transition-all"
                    style={{
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.2)",
                      color: "#f87171",
                    }}
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="p-12 text-center"
            style={{ color: "var(--text-muted)" }}
          >
            <div className="text-4xl mb-3">📁</div>
            <p className="font-semibold">No assets registered</p>
            <p className="text-xs mt-1">
              Upload a sports video above to start protecting it
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
