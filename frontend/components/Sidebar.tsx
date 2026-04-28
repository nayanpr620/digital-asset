"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import axios from "axios";
import { WS_URL, API_URL, getCurrentUserId } from "@/lib/api";

const NAV = [
  { href: "/", label: "Dashboard", icon: "📊", desc: "Overview & stats" },
  { href: "/assets", label: "Asset Registry", icon: "🗂", desc: "Register & manage" },
  { href: "/monitor", label: "Monitor & Scan", icon: "🔍", desc: "Track scans" },
  { href: "/violations", label: "Violations", icon: "🚨", desc: "Flagged content" },
  { href: "/analytics", label: "Analytics", icon: "📈", desc: "Propagation data" },
  { href: "/settings", label: "Settings", icon: "⚙️", desc: "Configuration" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [alerts, setAlerts] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [assetCount, setAssetCount] = useState(0);
  const [userId, setUserId] = useState("");

  useEffect(() => {
    setUserId(getCurrentUserId().slice(0, 8));
  }, []);

  useEffect(() => {
    let isActive = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchAssets = async () => {
      try {
        const res = await axios.get(`${API_URL}/assets`);
        setAssetCount(res.data.assets?.length || 0);
      } catch (e) {}
    };
    fetchAssets();

    const connect = () => {
      if (!isActive) return;
      try {
        socket = new WebSocket(WS_URL);
        socket.onopen = () => setWsConnected(true);
        socket.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === "scan_complete" && data.matches > 0) {
              setAlerts((a) => a + data.matches);
            }
          } catch { /* ignore parse errors */ }
        };
        socket.onclose = () => {
          setWsConnected(false);
          if (!isActive) return;
          reconnectTimer = setTimeout(connect, 3000);
        };
        socket.onerror = () => {
          setWsConnected(false);
        };
      } catch { /* ignore connection errors */ }
    };

    connect();

    return () => {
      isActive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-[60] w-10 h-10 rounded-xl flex items-center justify-center lg:hidden transition-all"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
        aria-label="Toggle navigation"
      >
        <span className="text-lg">{mobileOpen ? "✕" : "☰"}</span>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 bottom-0 w-[260px] flex flex-col z-50 transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          background: "var(--bg-secondary)",
          borderRight: "1px solid var(--border)",
        }}
      >
        {/* Workspace Selector (Mock User Auth) */}
        <div className="p-4 pb-2">
          <div className="flex items-center gap-2 p-2 rounded-xl cursor-pointer hover:bg-black/5 transition-colors"
               style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{background:"var(--gradient-1)"}}>
              {userId.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate text-slate-800">User {userId}</p>
              <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>{assetCount} Registered Assets</p>
            </div>
            <span className="text-xs text-slate-400">▼</span>
          </div>
        </div>

        {/* Logo */}
        <div className="p-4 pt-2 pb-4">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-sm"
              style={{
                background: "var(--gradient-1)",
                color: "white"
              }}
            >
              🛡
            </div>
            <div>
              <h1 className="text-xs font-extrabold text-slate-800 tracking-tight">
                Digital Asset Protection
              </h1>
              <p
                className="text-[9px] font-medium tracking-widest uppercase text-slate-500"
              >
                AI Ecosystem
              </p>
            </div>
          </div>
          <div className="h-px w-full" style={{ background: "var(--border)" }} />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {NAV.map((item, i) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 relative animate-slide-in-left"
                style={{
                  animationDelay: `${i * 50}ms`,
                  background: isActive
                    ? "rgba(99,102,241,0.12)"
                    : "transparent",
                  border: isActive
                    ? "1px solid rgba(99,102,241,0.25)"
                    : "1px solid transparent",
                  color: isActive
                    ? "var(--accent-hover)"
                    : "var(--text-secondary)",
                }}
              >
                <span className="text-lg group-hover:scale-110 transition-transform">
                  {item.icon}
                </span>
                <div>
                  <div className="font-medium text-[13px] leading-tight">
                    {item.label}
                  </div>
                  <div
                    className="text-[10px] leading-tight mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {item.desc}
                  </div>
                </div>
                {item.href === "/violations" && alerts > 0 && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-bounce">
                    {alerts > 99 ? "99+" : alerts}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Status indicator */}
        <div
          className="p-4 mx-3 mb-3 rounded-xl"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`w-2 h-2 rounded-full ${
                wsConnected ? "bg-green-400 animate-pulse" : "bg-yellow-400"
              }`}
            />
            <span
              className="text-[11px] font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              {wsConnected ? "System Active" : "Connecting..."}
            </span>
          </div>
          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            YouTube Platform • v4.0
            <br />
            Gemini AI + Chromaprint
          </div>
        </div>
      </aside>
    </>
  );
}
