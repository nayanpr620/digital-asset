"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import { API_URL as API } from "@/lib/api";

export default function ViolationsPage() {
  const [violations, setViolations] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [takedownModal, setTakedownModal] = useState<{id:string, notice:string}|null>(null);
  const [compareModal, setCompareModal] = useState<any>(null);
  const [generating, setGenerating] = useState("");

  const load = async () => {
    try {
      const params: any = { limit: 100 }; if (filter) params.status = filter;
      const r = await axios.get(`${API}/violations`, { params });
      setViolations(r.data.violations || []); setStats(r.data.stats || null);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [filter]);

  const updateStatus = async (id: string, s: string) => { await axios.patch(`${API}/violations/${id}?status=${s}`); load(); };

  const genTakedown = async (id: string) => {
    setGenerating(id);
    try {
      const r = await axios.post(`${API}/violations/${id}/takedown`);
      setTakedownModal({ id, notice: r.data.notice }); load();
    } catch(e: any) { alert("Failed: " + (e.response?.data?.detail || e.message)); }
    finally { setGenerating(""); }
  };

  const loadCompare = async (id: string) => {
    try {
      const r = await axios.get(`${API}/violations/${id}/compare`);
      setCompareModal(r.data);
    } catch(e) { alert("Compare data unavailable"); }
  };

  const confColor = (c: number) => c >= 0.75 ? "risk-critical" : c >= 0.5 ? "risk-medium" : "risk-low";
  const barColor = (c: number) => c >= 0.75 ? "bg-red-500" : c >= 0.5 ? "bg-yellow-500" : "bg-green-500";
  const catColors: Record<string,string> = {
    Highlight:"bg-purple-500/15 text-purple-400", Reaction:"bg-blue-500/15 text-blue-400",
    News:"bg-cyan-500/15 text-cyan-400", Meme:"bg-pink-500/15 text-pink-400",
    "Full Match":"bg-red-500/15 text-red-400", Clip:"bg-indigo-500/15 text-indigo-400",
  };

  return (
    <div className="p-8 max-w-[1400px]">
      <div className="flex items-center justify-between mb-6 animate-slide-up">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Violations</h1>
          <p className="text-sm" style={{color:"var(--text-secondary)"}}>Flagged unauthorized use of registered sports media</p>
        </div>
        <a href={`${API}/export/violations`} target="_blank" rel="noopener"
          className="px-4 py-2 rounded-xl text-xs font-semibold transition-all hover:shadow-lg"
          style={{background:"var(--bg-card)", border:"1px solid var(--border)", color:"var(--text-secondary)"}}>
          📥 Export CSV
        </a>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 lg:grid-cols-8 gap-3 mb-6 animate-slide-up" style={{animationDelay:"100ms"}}>
          {[
            {l:"Total",v:stats.total,c:"text-slate-800"},{l:"Detected",v:stats.detected,c:"text-orange-500"},
            {l:"Confirmed",v:stats.confirmed,c:"text-red-500"},{l:"Takedown",v:stats.takedown,c:"text-purple-500"},
            {l:"Dismissed",v:stats.dismissed,c:"text-slate-400"},{l:"High Risk",v:stats.high_risk,c:"text-red-500"},
            {l:"Medium",v:stats.medium_risk,c:"text-yellow-500"},
            {l:"Avg Conf",v:stats.avg_confidence?`${(stats.avg_confidence*100).toFixed(0)}%`:"—",c:"text-cyan-500"},
          ].map(s=>(
            <div key={s.l} className="stat-card !p-3 text-center">
              <div className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{color:"var(--text-muted)"}}>{s.l}</div>
              <div className={`text-xl font-black ${s.c}`}>{s.v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-5 flex-wrap animate-slide-up" style={{animationDelay:"150ms"}}>
        {[{k:"",l:"All"},{k:"detected",l:"🟠 Detected"},{k:"confirmed",l:"🔴 Confirmed"},{k:"takedown",l:"🟣 Takedown"},{k:"dismissed",l:"⚪ Dismissed"}].map(f=>(
          <button key={f.k} onClick={()=>setFilter(f.k)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
            style={{background:filter===f.k?"rgba(99,102,241,0.15)":"var(--bg-card)",
              border:filter===f.k?"1px solid rgba(99,102,241,0.4)":"1px solid var(--border)",
              color:filter===f.k?"var(--accent-hover)":"var(--text-secondary)"}}>
            {f.l}
          </button>
        ))}
      </div>

      {/* Cards grouped by Asset */}
      {violations.length > 0 ? (
        <div className="space-y-10">
          {Object.entries(
            violations.reduce((acc, v) => {
              const group = v.asset_title || "Unknown Asset";
              if (!acc[group]) acc[group] = [];
              acc[group].push(v);
              return acc;
            }, {} as Record<string, any[]>)
          ).map(([assetTitle, assetViolations]: any) => (
            <div key={assetTitle} className="animate-slide-up">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2" style={{color:"var(--text-primary)"}}>
                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                {assetTitle}
                <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{background:"var(--bg-elevated)", border:"1px solid var(--border)", color:"var(--text-secondary)"}}>
                  {assetViolations.length} violations
                </span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {assetViolations.map((v: any, i: number) => (
                  <div key={v.id} className="card overflow-hidden group shadow-sm hover:shadow-md" style={{animationDelay:`${i*60}ms`}}>
                    <div className="relative aspect-video bg-slate-100">
                      {v.thumbnail ? <img src={v.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        : <div className="w-full h-full flex items-center justify-center text-slate-400">No Image</div>}
                      <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-lg text-xs font-bold backdrop-blur-sm shadow-sm ${confColor(v.confidence)}`}>
                        {(v.confidence*100).toFixed(0)}%
                      </span>
                      {v.category && <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-white/90 text-slate-700 shadow-sm`}>{v.category}</span>}
                    </div>
                    <div className="p-4">
                      <h3 className="text-sm font-bold line-clamp-2 mb-1 text-slate-900 group-hover:text-indigo-600 transition-colors">{v.title}</h3>
                      <p className="text-[11px] mb-3 text-slate-500 font-medium">📺 {v.channel}</p>
                      <div className="space-y-1.5 mb-3">
                        {[{l:"Visual Match",v:v.visual_similarity},{l:"Audio Match",v:v.audio_similarity}].map(b=>(
                          <div key={b.l}>
                            <div className="flex justify-between text-[10px] mb-0.5 text-slate-500 font-medium"><span>{b.l}</span><span>{(b.v*100).toFixed(0)}%</span></div>
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-700 ${barColor(v.confidence)}`} style={{width:`${b.v*100}%`}} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-1.5 flex-wrap pt-2 border-t border-slate-100">
                        <a href={v.url} target="_blank" rel="noopener" className="flex-1 py-1.5 rounded-lg text-center text-[11px] font-medium transition-all hover:bg-slate-50 text-slate-700"
                          style={{border:"1px solid var(--border)"}}>View source</a>
                        <button onClick={()=>loadCompare(v.id)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:bg-slate-50 text-slate-700"
                          style={{border:"1px solid var(--border)"}} title="Analyze Fingerprint">🔬</button>
                        <button onClick={()=>genTakedown(v.id)} disabled={generating===v.id}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:bg-red-50 text-red-600"
                          style={{border:"1px solid rgba(239,68,68,0.2)"}}>
                          {generating===v.id?"⏳":"📋 DMCA"}
                        </button>
                        <select value={v.status} onChange={e=>updateStatus(v.id,e.target.value)}
                          className="px-2 py-1.5 rounded-lg text-[11px] font-medium focus:outline-none cursor-pointer bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">
                          <option value="detected">Detected</option><option value="confirmed">Confirmed</option>
                          <option value="takedown">Takedown</option><option value="dismissed">Dismissed</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-12 text-center" style={{color:"var(--text-muted)"}}>
          <div className="text-4xl mb-3">🔒</div>
          <p className="font-semibold">No violations found</p>
          <p className="text-xs mt-1">{filter?"Try a different filter":"Register assets and run scans to detect piracy"}</p>
        </div>
      )}

      {/* Takedown Modal (Feature 2) */}
      {takedownModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)"}}>
          <div className="w-full max-w-2xl max-h-[80vh] rounded-2xl overflow-hidden" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
            <div className="flex items-center justify-between p-5" style={{borderBottom:"1px solid var(--border)"}}>
              <div className="flex items-center gap-2"><span className="text-lg">📋</span><h2 className="font-bold">DMCA Takedown Notice</h2></div>
              <button onClick={()=>setTakedownModal(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-white/5">×</button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[60vh]">
              <pre className="text-xs whitespace-pre-wrap leading-relaxed" style={{color:"var(--text-secondary)"}}>{takedownModal.notice}</pre>
            </div>
            <div className="p-4 flex justify-end gap-2" style={{borderTop:"1px solid var(--border)"}}>
              <button onClick={()=>{navigator.clipboard.writeText(takedownModal.notice);alert("Copied!")}}
                className="px-4 py-2 rounded-xl text-xs font-semibold" style={{background:"var(--gradient-1)"}}>📋 Copy</button>
              <button onClick={()=>setTakedownModal(null)} className="px-4 py-2 rounded-xl text-xs font-medium"
                style={{background:"var(--bg-elevated)",border:"1px solid var(--border)"}}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Compare Modal (Feature 3) */}
      {compareModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)"}}>
          <div className="w-full max-w-3xl rounded-2xl overflow-hidden" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
            <div className="flex items-center justify-between p-5" style={{borderBottom:"1px solid var(--border)"}}>
              <div className="flex items-center gap-2"><span className="text-lg">🔬</span><h2 className="font-bold">Side-by-Side Comparison</h2></div>
              <button onClick={()=>setCompareModal(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-white/5">×</button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-6">
                {/* Original */}
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider mb-3 flex items-center gap-1" style={{color:"var(--text-muted)"}}>
                    <span className="w-2 h-2 rounded-full bg-green-400" /> Original Asset
                  </div>
                  <div className="card !p-4 space-y-2">
                    <p className="text-sm font-bold">{compareModal.asset.title}</p>
                    <p className="text-[11px]" style={{color:"var(--text-secondary)"}}>
                      {compareModal.asset.frame_count} frames • {Math.round(compareModal.asset.duration)}s
                    </p>
                    <div className="text-[10px] font-mono p-2 rounded-lg break-all" style={{background:"var(--bg-primary)",color:"var(--text-muted)"}}>
                      🔐 {compareModal.asset.certificate_hash?.slice(0,32)}...
                    </div>
                    <div className="text-[10px]" style={{color:"var(--text-muted)"}}>
                      Visual fingerprints: {compareModal.asset.frame_hashes?.length || 0} pHash values
                    </div>
                  </div>
                </div>
                {/* Suspected */}
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider mb-3 flex items-center gap-1" style={{color:"var(--text-muted)"}}>
                    <span className="w-2 h-2 rounded-full bg-red-400" /> Suspected Copy
                  </div>
                  <div className="card !p-4 space-y-2">
                    <p className="text-sm font-bold">{compareModal.violation.title}</p>
                    {compareModal.violation.thumbnail && <img src={compareModal.violation.thumbnail} alt="" className="w-full rounded-lg" style={{border:"1px solid var(--border)"}} />}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 rounded-lg text-center" style={{background:"var(--bg-primary)"}}>
                        <div className="text-[10px]" style={{color:"var(--text-muted)"}}>Visual</div>
                        <div className="text-lg font-black text-indigo-400">{(compareModal.violation.visual_similarity*100).toFixed(0)}%</div>
                      </div>
                      <div className="p-2 rounded-lg text-center" style={{background:"var(--bg-primary)"}}>
                        <div className="text-[10px]" style={{color:"var(--text-muted)"}}>Audio</div>
                        <div className="text-lg font-black text-purple-400">{(compareModal.violation.audio_similarity*100).toFixed(0)}%</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-4 p-3 rounded-xl text-center" style={{background: compareModal.violation.confidence>=0.75?"rgba(239,68,68,0.1)":"rgba(234,179,8,0.1)", border: compareModal.violation.confidence>=0.75?"1px solid rgba(239,68,68,0.3)":"1px solid rgba(234,179,8,0.3)"}}>
                <span className="text-2xl font-black" style={{color: compareModal.violation.confidence>=0.75?"#f87171":"#facc15"}}>{(compareModal.violation.confidence*100).toFixed(1)}%</span>
                <span className="text-xs ml-2" style={{color:"var(--text-secondary)"}}>overall match confidence ({compareModal.violation.match_type})</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
