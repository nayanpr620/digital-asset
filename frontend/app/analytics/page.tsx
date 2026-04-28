"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import { API_URL as API } from "@/lib/api";

export default function AnalyticsPage() {
  const [timeline, setTimeline] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [anomalies, setAnomalies] = useState<any>(null);
  const [vStats, setVStats] = useState<any>(null);
  const [loadingAI, setLoadingAI] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [t, c, d, v, r] = await Promise.all([
          axios.get(`${API}/analytics/propagation?days=30`),
          axios.get(`${API}/analytics/channels`),
          axios.get(`${API}/analytics/dashboard`),
          axios.get(`${API}/violations?limit=0`),
          axios.get(`${API}/analytics/channel-risks`),
        ]);
        setTimeline(t.data.timeline || []); setChannels(c.data.channels || []);
        setStats(d.data); setVStats(v.data.stats); setRisks(r.data.channels || []);
      } catch (e) { console.error(e); }
    };
    load();
  }, []);

  const runAnomalyDetection = async () => {
    setLoadingAI(true);
    try {
      const r = await axios.get(`${API}/analytics/anomalies`);
      setAnomalies(r.data);
    } catch (e) { console.error(e); }
    finally { setLoadingAI(false); }
  };

  const maxEvents = Math.max(...timeline.map(t => t.events), 1);
  const riskBadge = (level: string) => ({
    critical: "risk-critical", high: "risk-high", medium: "risk-medium", low: "risk-low"
  }[level] || "risk-low");

  return (
    <div className="p-8 max-w-[1400px]">
      <div className="flex items-center justify-between mb-8 animate-slide-up">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Analytics</h1>
          <p className="text-sm" style={{color:"var(--text-secondary)"}}>Content propagation tracking, channel risk scoring, and AI anomaly detection</p>
        </div>
        <button onClick={runAnomalyDetection} disabled={loadingAI}
          className="px-5 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 animate-gradient"
          style={{background:"var(--gradient-1)", boxShadow:"0 4px 15px rgba(99,102,241,0.3)"}}>
          {loadingAI ? "⏳ Analyzing..." : "🧠 Run AI Anomaly Detection"}
        </button>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8 animate-slide-up" style={{animationDelay:"100ms"}}>
        {[
          {l:"Assets Protected",v:stats?.total_assets??0,c:"text-indigo-400",icon:"🗂"},
          {l:"Total Scans",v:stats?.total_scans??0,c:"text-cyan-400",icon:"🔍"},
          {l:"Violations",v:stats?.total_violations??0,c:"text-red-400",icon:"🚨"},
          {l:"Risky Channels",v:stats?.risky_channels??0,c:"text-orange-400",icon:"📺"},
          {l:"Propagation Events",v:stats?.propagation_events??0,c:"text-purple-400",icon:"📡"},
        ].map(s=>(
          <div key={s.l} className="stat-card">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider mb-2" style={{color:"var(--text-muted)"}}><span>{s.icon}</span>{s.l}</div>
            <div className={`text-2xl font-black ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* AI Anomaly Results (Feature 1) */}
      {anomalies && (
        <div className="card p-6 mb-8 animate-slide-up">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">🧠</span>
            <h2 className="font-bold">AI Anomaly Detection Results</h2>
            <span className={`ml-auto px-3 py-1 rounded-lg text-xs font-bold ${riskBadge(anomalies.risk_level)}`}>
              {(anomalies.risk_level || "unknown").toUpperCase()}
            </span>
          </div>
          <p className="text-sm mb-4 leading-relaxed" style={{color:"var(--text-secondary)"}}>{anomalies.summary}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{color:"var(--text-muted)"}}>⚠️ Anomalies</h3>
              <div className="space-y-1.5">
                {(anomalies.anomalies || []).map((a: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs" style={{color:"var(--text-secondary)"}}>
                    <span className="text-orange-400 mt-0.5 shrink-0">●</span>{a}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{color:"var(--text-muted)"}}>💡 Recommendations</h3>
              <div className="space-y-1.5">
                {(anomalies.recommendations || []).map((r: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs" style={{color:"var(--text-secondary)"}}>
                    <span className="text-green-400 mt-0.5 shrink-0">→</span>{r}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{color:"var(--text-muted)"}}>🔎 Suspicious Channels</h3>
              <div className="space-y-1.5">
                {(anomalies.suspicious_channels || []).map((c: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg" style={{background:"var(--bg-elevated)", color:"var(--text-secondary)"}}>
                    <span className="text-red-400">📺</span>{c}
                  </div>
                ))}
                {(!anomalies.suspicious_channels || anomalies.suspicious_channels.length === 0) && (
                  <p className="text-xs" style={{color:"var(--text-muted)"}}>None identified</p>
                )}
              </div>
              <div className="mt-3 text-[11px]" style={{color:"var(--text-muted)"}}>
                Trend: <span className="font-bold" style={{color: anomalies.trend === "increasing" ? "#f87171" : anomalies.trend === "decreasing" ? "#4ade80" : "#facc15"}}>{anomalies.trend || "unknown"}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Propagation Timeline */}
        <div className="card p-5 animate-slide-up" style={{animationDelay:"200ms"}}>
          <h2 className="font-bold text-sm mb-1">Propagation Timeline</h2>
          <p className="text-xs mb-4" style={{color:"var(--text-muted)"}}>Content detection events over time</p>
          {timeline.length > 0 ? (
            <div className="space-y-2">
              {timeline.map(t=>(
                <div key={t.date} className="flex items-center gap-3">
                  <span className="text-[11px] w-16 shrink-0" style={{color:"var(--text-muted)"}}>{new Date(t.date).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                  <div className="flex-1 h-7 rounded-lg overflow-hidden" style={{background:"rgba(255,255,255,0.03)"}}>
                    <div className="h-full rounded-lg flex items-center px-2 transition-all duration-700"
                      style={{width:`${Math.max((t.events/maxEvents)*100,8)}%`, background:"var(--gradient-2)"}}>
                      <span className="text-[10px] font-bold text-white whitespace-nowrap">{t.events}</span>
                    </div>
                  </div>
                  <span className="text-[11px] w-14 text-right" style={{color:"var(--text-muted)"}}>{t.unique_videos} vids</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8" style={{color:"var(--text-muted)"}}><div className="text-3xl mb-2">📊</div><p className="text-sm">No data yet</p></div>
          )}
        </div>

        {/* Channel Risk Scoring (Feature 9) */}
        <div className="card p-5 animate-slide-up" style={{animationDelay:"300ms"}}>
          <h2 className="font-bold text-sm mb-1">Channel Risk Scoring</h2>
          <p className="text-xs mb-4" style={{color:"var(--text-muted)"}}>Repeat offender tracking with auto-escalation</p>
          {risks.length > 0 ? (
            <div className="space-y-2">
              {risks.map((ch, i) => (
                <div key={ch.channel} className="flex items-center gap-3 p-3 rounded-xl transition-colors" style={{background:"var(--bg-elevated)"}}>
                  <span className="text-lg font-black w-6 text-center" style={{color:"var(--text-muted)"}}>{i+1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{ch.channel}</p>
                    <p className="text-[10px]" style={{color:"var(--text-muted)"}}>
                      {ch.total_violations} violations • {ch.unique_videos || (ch.assets_affected?.length || 0)} assets affected
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${riskBadge(ch.risk_level)}`}>{ch.risk_level.toUpperCase()}</span>
                    <div className="text-[10px] mt-1" style={{color:"var(--text-muted)"}}>Score: {(ch.risk_score*100).toFixed(0)}%</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8" style={{color:"var(--text-muted)"}}><div className="text-3xl mb-2">📺</div><p className="text-sm">No channel data yet</p></div>
          )}
        </div>
      </div>

      {/* Risk Distribution */}
      {vStats && vStats.total > 0 && (
        <div className="card p-5 animate-slide-up" style={{animationDelay:"400ms"}}>
          <h2 className="font-bold text-sm mb-4">Risk Distribution</h2>
          <div className="flex h-10 rounded-xl overflow-hidden">
            {vStats.high_risk > 0 && <div className="bg-red-500 flex items-center justify-center text-xs font-bold text-white" style={{width:`${(vStats.high_risk/vStats.total)*100}%`}}>{vStats.high_risk} High</div>}
            {vStats.medium_risk > 0 && <div className="bg-yellow-500 flex items-center justify-center text-xs font-bold text-black" style={{width:`${(vStats.medium_risk/vStats.total)*100}%`}}>{vStats.medium_risk} Med</div>}
            {vStats.low_risk > 0 && <div className="bg-green-500 flex items-center justify-center text-xs font-bold text-white" style={{width:`${(vStats.low_risk/vStats.total)*100}%`}}>{vStats.low_risk} Low</div>}
          </div>
        </div>
      )}
    </div>
  );
}
