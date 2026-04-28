"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import { API_URL as API } from "@/lib/api";

export default function SettingsPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [certModal, setCertModal] = useState<any>(null);
  const [selectedAsset, setSelectedAsset] = useState("");
  const [interval, setInterval] = useState(24);

  const load = async () => {
    try {
      const [a, s] = await Promise.all([
        axios.get(`${API}/assets`), axios.get(`${API}/schedules`)
      ]);
      setAssets(a.data.assets || []); setSchedules(s.data.schedules || []);
    } catch (e) { console.error(e); }
  };
  useEffect(() => { load(); }, []);

  const createSchedule = async () => {
    if (!selectedAsset) return;
    try {
      await axios.post(`${API}/schedules?asset_id=${selectedAsset}&interval_hours=${interval}`);
      load(); setSelectedAsset("");
    } catch (e: any) { alert(e.response?.data?.detail || e.message); }
  };

  const toggleSchedule = async (id: string, active: boolean) => {
    await axios.patch(`${API}/schedules/${id}?active=${active}`); load();
  };

  const deleteSchedule = async (id: string) => {
    if (!confirm("Delete this monitor?")) return;
    // Optimistic removal from UI
    setSchedules(prev => prev.filter(s => s.id !== id));
    try {
      await axios.delete(`${API}/schedules/${id}`);
      load();
    } catch (e: any) {
      alert("Failed to delete: " + (e.response?.data?.detail || e.message));
      load(); // Reload to restore actual state
    }
  };

  const updateThreshold = async (id: string, threshold: number) => {
    await axios.patch(`${API}/assets/${id}/threshold?threshold=${threshold}`); load();
  };

  const viewCert = async (id: string) => {
    try {
      const r = await axios.get(`${API}/assets/${id}/certificate`);
      setCertModal(r.data);
    } catch (e) { alert("Certificate unavailable"); }
  };

  return (
    <div className="p-8 max-w-[1400px]">
      <div className="mb-8 animate-slide-up">
        <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>
        <p className="text-sm" style={{color:"var(--text-secondary)"}}>Scheduled monitoring, confidence tuning, and digital certificates</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Feature 5: Scheduled Auto-Monitoring */}
        <div className="card p-6 animate-slide-up" style={{animationDelay:"100ms"}}>
          <div className="flex items-center gap-2 mb-4"><span className="text-lg">⏱</span><h2 className="font-bold">Scheduled Monitoring</h2></div>
          <p className="text-xs mb-4" style={{color:"var(--text-muted)"}}>Set up automatic periodic scans for your assets</p>

          <div className="flex gap-2 mb-4 w-full">
            <select value={selectedAsset} onChange={e=>setSelectedAsset(e.target.value)}
              className="flex-1 min-w-0 truncate px-3 py-2.5 rounded-xl text-sm focus:outline-none"
              style={{background:"var(--bg-primary)",border:"1px solid var(--border)",color:"var(--text-primary)"}}>
              <option value="">Select asset...</option>
              {assets.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
            <select value={interval} onChange={e=>setInterval(Number(e.target.value))}
              className="w-28 px-3 py-2.5 rounded-xl text-sm focus:outline-none"
              style={{background:"var(--bg-primary)",border:"1px solid var(--border)",color:"var(--text-primary)"}}>
              <option value={6}>6 hours</option><option value={12}>12 hours</option>
              <option value={24}>24 hours</option><option value={48}>48 hours</option>
            </select>
            <button onClick={createSchedule} disabled={!selectedAsset}
              className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
              style={{background:"var(--gradient-1)"}}>+ Add</button>
          </div>

          {schedules.length > 0 ? (
            <div className="space-y-2">
              {schedules.map(s=>(
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl" style={{background:"var(--bg-elevated)"}}>
                  <button onClick={()=>toggleSchedule(s.id,!s.is_active)}
                    className={`w-10 h-5 rounded-full transition-all relative ${s.is_active?"bg-green-500":"bg-gray-600"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${s.is_active?"left-5":"left-0.5"}`} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.asset_title || s.asset_id}</p>
                    <p className="text-[10px]" style={{color:"var(--text-muted)"}}>
                      Every {s.interval_hours}h • {s.last_run ? `Last: ${new Date(s.last_run).toLocaleString()}` : "Not run yet"}
                    </p>
                  </div>
                  <button onClick={()=>deleteSchedule(s.id)} className="text-red-400 text-xs hover:underline">🗑</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6" style={{color:"var(--text-muted)"}}><p className="text-sm">No scheduled monitors</p></div>
          )}
        </div>

        {/* Feature 8: Confidence Threshold + Feature 4: Certificates */}
        <div className="card p-6 animate-slide-up" style={{animationDelay:"200ms"}}>
          <div className="flex items-center gap-2 mb-4"><span className="text-lg">🎛</span><h2 className="font-bold">Asset Configuration</h2></div>
          <p className="text-xs mb-4" style={{color:"var(--text-muted)"}}>Tune confidence thresholds and view digital authentication certificates</p>

          {assets.length > 0 ? (
            <div className="space-y-3">
              {assets.map(a=>(
                <div key={a.id} className="p-4 rounded-xl" style={{background:"var(--bg-elevated)"}}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold">{a.title}</p>
                      <p className="text-[10px]" style={{color:"var(--text-muted)"}}>{a.frame_count} frames • {a.duration ? `${Math.round(a.duration)}s` : "—"}</p>
                    </div>
                    <button onClick={()=>viewCert(a.id)} className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                      style={{background:"rgba(99,102,241,0.1)",border:"1px solid rgba(99,102,241,0.3)",color:"var(--accent-hover)"}}>
                      🔐 Certificate
                    </button>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span style={{color:"var(--text-muted)"}}>Confidence Threshold</span>
                      <span className="font-bold" style={{color:"var(--accent-hover)"}}>{((a.confidence_threshold || 0.15)*100).toFixed(0)}%</span>
                    </div>
                    <input type="range" min="0" max="100" value={((a.confidence_threshold || 0.15)*100)}
                      onChange={e=>updateThreshold(a.id, Number(e.target.value)/100)}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{background:`linear-gradient(to right, var(--accent) ${(a.confidence_threshold||0.15)*100}%, var(--bg-primary) ${(a.confidence_threshold||0.15)*100}%)`}} />
                    <div className="flex justify-between text-[9px] mt-1" style={{color:"var(--text-muted)"}}>
                      <span>Sensitive (0%)</span><span>Strict (100%)</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6" style={{color:"var(--text-muted)"}}><p className="text-sm">No assets registered</p></div>
          )}
        </div>
      </div>

      {/* Certificate Modal (Feature 4) */}
      {certModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)"}}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
            <div className="flex items-center justify-between p-5" style={{borderBottom:"1px solid var(--border)"}}>
              <div className="flex items-center gap-2"><span className="text-lg">🔐</span><h2 className="font-bold">Digital Authentication Certificate</h2></div>
              <button onClick={()=>setCertModal(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-white/5">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-4 rounded-xl text-center" style={{background:"var(--bg-primary)",border:"1px solid var(--border)"}}>
                <div className="text-3xl mb-2">🛡</div>
                <p className="text-xs font-bold uppercase tracking-wider" style={{color:"var(--accent-hover)"}}>{certModal.certificate_type}</p>
                <p className="text-[10px] mt-1" style={{color:"var(--text-muted)"}}>Version {certModal.version}</p>
              </div>
              {[
                {l:"Asset",v:certModal.title},
                {l:"Asset ID",v:certModal.asset_id},
                {l:"Registered",v:new Date(certModal.registered_at).toLocaleString()},
                {l:"Issuer",v:certModal.issuer},
                {l:"Algorithm",v:certModal.fingerprint?.algorithm},
                {l:"Frames",v:certModal.fingerprint?.frame_count},
                {l:"Audio",v:certModal.fingerprint?.has_audio?"✅ Present":"❌ None"},
                {l:"Duration",v:`${certModal.fingerprint?.duration_seconds}s`},
                {l:"Status",v:certModal.status?.toUpperCase()},
              ].map(r=>(
                <div key={r.l} className="flex justify-between text-xs py-1" style={{borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
                  <span style={{color:"var(--text-muted)"}}>{r.l}</span>
                  <span className="font-medium">{r.v}</span>
                </div>
              ))}
              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:"var(--text-muted)"}}>Certificate Hash (SHA-256)</p>
                <div className="p-3 rounded-lg font-mono text-[10px] break-all" style={{background:"var(--bg-primary)",color:"var(--accent-hover)"}}>
                  {certModal.certificate_hash}
                </div>
              </div>
              <p className="text-[10px] leading-relaxed" style={{color:"var(--text-muted)"}}>
                {certModal.verification}
              </p>
            </div>
            <div className="p-4 flex justify-end" style={{borderTop:"1px solid var(--border)"}}>
              <button onClick={()=>{navigator.clipboard.writeText(JSON.stringify(certModal,null,2));alert("Certificate copied!")}}
                className="px-4 py-2 rounded-xl text-xs font-semibold" style={{background:"var(--gradient-1)"}}>📋 Copy Certificate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
