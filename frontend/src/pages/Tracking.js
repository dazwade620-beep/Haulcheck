import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Radio, RefreshCw, Route, Truck, ChevronLeft, Navigation, Clock, Play, Pause, Gauge, Ruler, MapPinned, Plus, Trash2, LogIn, LogOut, CalendarClock, Download, FileText, Mail } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

function relTime(iso) {
  if (!iso) return "no data yet";
  try {
    const secs = Math.floor((Date.now() - parseISO(iso).getTime()) / 1000);
    if (secs < 60) return "just now";
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  } catch { return "—"; }
}
const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } };
const fmtDate = (d) => { try { return format(parseISO(d), "EEE d MMM yyyy"); } catch { return d; } };
const dur = (min) => { if (min == null) return ""; const m = Math.max(0, Math.round(min)); const h = Math.floor(m / 60), r = m % 60; return h ? `${h}h ${r}m` : `${r}m`; };

function MapView({ markers = [], trail = [], geofences = [], stops = [], playhead = null, onMapClick = null }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const baseRef = useRef(null);
  const playRef = useRef(null);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { scrollWheelZoom: true }).setView([54.2, -4.0], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors", maxZoom: 19,
    }).addTo(map);
    baseRef.current = L.layerGroup().addTo(map);
    playRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 200);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current, layer = baseRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds = [];
    geofences.forEach((g) => {
      L.circle([g.lat, g.lng], { radius: g.radius_m, color: "#7c3aed", fillColor: "#8b5cf6", fillOpacity: 0.12, weight: 2 })
        .bindPopup(`<b>${g.name}</b><br>${g.radius_m} m radius`).addTo(layer);
      bounds.push([g.lat, g.lng]);
    });
    if (trail.length > 0) {
      const line = trail.filter((p) => p.lat != null).map((p) => [p.lat, p.lng]);
      line.forEach((c) => bounds.push(c));
      if (line.length > 1) L.polyline(line, { color: "#2563eb", weight: 4, opacity: 0.85 }).addTo(layer);
      const s = trail[0], e = trail[trail.length - 1];
      L.circleMarker([s.lat, s.lng], { radius: 7, color: "#15803d", fillColor: "#22c55e", fillOpacity: 1, weight: 2 }).bindPopup(`Shift start<br>${fmtTime(s.recorded_at)}`).addTo(layer);
      L.circleMarker([e.lat, e.lng], { radius: 8, color: "#b91c1c", fillColor: "#ef4444", fillOpacity: 1, weight: 2 }).bindPopup(`Latest<br>${fmtTime(e.recorded_at)}`).addTo(layer);
    }
    markers.forEach((m) => {
      if (m.lat == null) return;
      const cm = L.circleMarker([m.lat, m.lng], { radius: 8, color: "#1d4ed8", fillColor: "#3b82f6", fillOpacity: 1, weight: 2 })
        .bindPopup(`<b>${m.name || "Driver"}</b>${m.vehicle_reg ? "<br>" + m.vehicle_reg : ""}${m.recorded_at ? "<br>" + new Date(m.recorded_at).toLocaleString() : ""}`);
      if (m.name) cm.bindTooltip(m.name, { permanent: true, direction: "top", offset: [0, -6], className: "hc-map-label" });
      cm.addTo(layer);
      bounds.push([m.lat, m.lng]);
    });
    stops.forEach((s) => {
      if (s.lat == null) return;
      L.circleMarker([s.lat, s.lng], { radius: 7, color: "#b45309", fillColor: "#f59e0b", fillOpacity: 0.9, weight: 2 })
        .bindPopup(`Stopped ${dur(s.minutes)}<br>${fmtTime(s.start)}–${fmtTime(s.end)}`).addTo(layer);
    });
    if (bounds.length === 1) map.setView(bounds[0], 13);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [markers, trail, geofences, stops]);

  useEffect(() => {
    const layer = playRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (playhead && playhead.lat != null) {
      L.circleMarker([playhead.lat, playhead.lng], { radius: 9, color: "#c2410c", fillColor: "#f97316", fillOpacity: 1, weight: 3 })
        .bindPopup(`${fmtTime(playhead.recorded_at)}`).addTo(layer);
    }
  }, [playhead]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onMapClick) return;
    const h = (e) => onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    map.on("click", h);
    map.getContainer().style.cursor = "crosshair";
    return () => { map.off("click", h); if (map.getContainer()) map.getContainer().style.cursor = ""; };
  }, [onMapClick]);

  return <div ref={elRef} data-testid="tracking-map" className="w-full h-[600px] rounded-md overflow-hidden border border-slate-200 relative z-0" />;
}

function Stat({ icon: Icon, label, value, sub, flag }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold flex items-center gap-1"><Icon size={11} /> {label}</p>
      <p className={`font-heading font-bold text-lg ${flag ? "text-amber-600" : "text-slate-900"}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

export default function Tracking() {
  const { user } = useAuth();
  const miles = (user?.region || "UK") === "UK";
  const distU = miles ? "mi" : "km";
  const spdU = miles ? "mph" : "km/h";
  const toDist = (km) => (miles ? km * 0.621371 : km);
  const toSpd = (kmh) => (miles ? kmh * 0.621371 : kmh);
  const highMileage = (km) => toDist(km) > (miles ? 250 : 400);

  const [tab, setTab] = useState("map");
  const [drivers, setDrivers] = useState([]);
  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  // Geofences / site activity
  const [geofences, setGeofences] = useState([]);
  const [events, setEvents] = useState([]);
  const [addSite, setAddSite] = useState(false);
  const [pending, setPending] = useState(null);
  const [siteName, setSiteName] = useState("");
  const [siteRadius, setSiteRadius] = useState(200);

  // Playback
  const [playing, setPlaying] = useState(false);
  const [idx, setIdx] = useState(0);

  // Timesheets
  const [tsRows, setTsRows] = useState([]);
  const [tsDriver, setTsDriver] = useState("");
  const [tsFrom, setTsFrom] = useState("");
  const [tsTo, setTsTo] = useState("");
  const [tsLoading, setTsLoading] = useState(false);

  const loadLive = useCallback(async () => {
    try { const { data } = await api.get("/tracking/live"); setDrivers(data.drivers || []); } catch { /* ignore */ }
    setLoading(false);
  }, []);
  const loadSites = useCallback(async () => {
    try {
      const [g, e] = await Promise.all([api.get("/geofences"), api.get("/tracking/geofence-events?limit=25")]);
      setGeofences(g.data || []); setEvents(e.data.events || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadLive(); loadSites(); }, [loadLive, loadSites]);
  useEffect(() => {
    const t = setInterval(() => { if (!sel && tab === "map") { loadLive(); loadSites(); } }, 30000);
    return () => clearInterval(t);
  }, [sel, tab, loadLive, loadSites]);

  const openDriver = async (id, date) => {
    setSel(id); setPlaying(false); setIdx(0);
    try { const { data } = await api.get(`/tracking/driver/${id}${date ? `?date=${date}` : ""}`); setDetail(data); setIdx(0); }
    catch { toast.error("Could not load route history"); }
  };
  const backToLive = () => { setSel(null); setDetail(null); setPlaying(false); loadLive(); };

  // Playback ticker
  const trail = sel && detail ? (detail.points || []) : [];
  useEffect(() => {
    if (!playing || trail.length < 2) return;
    const t = setInterval(() => {
      setIdx((i) => { if (i >= trail.length - 1) { setPlaying(false); return i; } return i + 1; });
    }, 350);
    return () => clearInterval(t);
  }, [playing, trail.length]);

  // Geofence add
  const handleMapClick = useCallback((latlng) => { setPending(latlng); }, []);
  const saveSite = async () => {
    if (!pending) return;
    try {
      await api.post("/geofences", { name: siteName || "Site", lat: pending.lat, lng: pending.lng, radius_m: Number(siteRadius) || 200 });
      toast.success("Site saved");
      setPending(null); setSiteName(""); setAddSite(false); loadSites();
    } catch { toast.error("Could not save site"); }
  };
  const deleteSite = async (id) => {
    try { await api.delete(`/geofences/${id}`); toast.success("Site removed"); loadSites(); }
    catch { toast.error("Could not remove site"); }
  };

  // Timesheets
  const loadTimesheet = useCallback(async () => {
    setTsLoading(true);
    try {
      const qs = new URLSearchParams();
      if (tsDriver) qs.set("driver_id", tsDriver);
      if (tsFrom) qs.set("start", tsFrom);
      if (tsTo) qs.set("end", tsTo);
      const { data } = await api.get(`/tracking/timesheet${qs.toString() ? `?${qs}` : ""}`);
      setTsRows(data.rows || []);
    } catch { toast.error("Could not load timesheet"); }
    setTsLoading(false);
  }, [tsDriver, tsFrom, tsTo]);
  useEffect(() => { if (tab === "timesheets") loadTimesheet(); }, [tab, loadTimesheet]);

  const exportCsv = () => {
    const csv = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ["Driver", "Vehicle", "Date", "Start", "End", "Hours", `Distance (${distU})`, `Top speed (${spdU})`, `Avg speed (${spdU})`, "Points"];
    const lines = [head.map(csv).join(",")];
    tsRows.forEach((r) => {
      lines.push([
        r.driver_name || "", r.vehicle_reg || "", r.date || "",
        r.start ? fmtTime(r.start) : "", r.end ? fmtTime(r.end) : (r.active ? "on shift" : ""),
        r.hours ?? "", toDist(r.distance_km).toFixed(1), toSpd(r.top_speed_kmh).toFixed(0), toSpd(r.avg_speed_kmh).toFixed(0), r.points,
      ].map(csv).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `haulcheck-timesheet-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportPdf = async () => {
    try {
      const qs = new URLSearchParams();
      if (tsDriver) qs.set("driver_id", tsDriver);
      if (tsFrom) qs.set("start", tsFrom);
      if (tsTo) qs.set("end", tsTo);
      const res = await api.get(`/tracking/timesheet.pdf${qs.toString() ? `?${qs}` : ""}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = `haulcheck-timesheet-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click(); URL.revokeObjectURL(url);
    } catch { toast.error("Could not export PDF"); }
  };

  const emailSummary = async () => {
    try {
      const { data } = await api.post("/tracking/weekly-summary/send");
      if (data.sent) toast.success(`Weekly summary emailed to ${data.email || "you"} (${data.drivers} driver${data.drivers === 1 ? "" : "s"})`);
      else if (data.reason === "no_data" || data.drivers === 0) toast.info("No driving data in the last 7 days to summarise");
      else toast.message("Summary prepared, but the email couldn't be sent (check email settings)");
    } catch { toast.error("Could not send summary"); }
  };

  const liveMarkers = drivers.filter((d) => d.last && d.last.lat != null)
    .map((d) => ({ name: d.driver_name, vehicle_reg: d.vehicle_reg, lat: d.last.lat, lng: d.last.lng, recorded_at: d.last.recorded_at }));
  const markers = sel ? [] : liveMarkers;
  const stops = sel && detail ? (detail.stops || []) : [];
  const playhead = trail.length && (playing || idx > 0) ? trail[idx] : null;
  const anyData = drivers.some((d) => d.last) || drivers.some((d) => d.on_shift) || geofences.length > 0;
  const stats = detail?.stats;

  return (
    <div data-testid="tracking-page">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Fleet</p>
          <h1 className="font-heading text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mt-1">Live Tracking</h1>
          <p className="text-slate-500 text-sm mt-1">Live positions, route history, sites & shift timesheets — from the driver app "Start Shift"</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 rounded-md p-1">
            <button data-testid="tracking-tab-map" onClick={() => setTab("map")} className={`px-3 py-1.5 text-sm font-semibold rounded ${tab === "map" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>Map</button>
            <button data-testid="tracking-tab-timesheets" onClick={() => setTab("timesheets")} className={`px-3 py-1.5 text-sm font-semibold rounded ${tab === "timesheets" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>Timesheets</button>
          </div>
          {tab === "map" && (
            <button data-testid="tracking-refresh" onClick={() => { loadLive(); loadSites(); }} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 rounded-md px-3 py-2"><RefreshCw size={15} /> Refresh</button>
          )}
        </div>
      </div>

      {tab === "map" ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white border border-slate-200 rounded-md p-4 animate-in-up">
              {!sel ? (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <Radio size={16} className="text-slate-900" />
                    <h3 className="font-heading font-bold tracking-tight">Drivers</h3>
                    <span className="ml-auto text-xs text-slate-400">{drivers.length}</span>
                  </div>
                  {loading ? <p className="text-sm text-slate-400 py-6 text-center">Loading…</p>
                    : drivers.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">No drivers yet.</p>
                    : (
                      <div className="space-y-2" data-testid="tracking-driver-list">
                        {drivers.map((d) => (
                          <button key={d.driver_id} data-testid="tracking-driver-item" onClick={() => openDriver(d.driver_id)}
                            className="w-full flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2.5 text-left hover:border-slate-900 hover:bg-slate-50 transition-colors">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${d.on_shift ? "bg-green-500 animate-pulse" : "bg-slate-300"}`} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-slate-900 truncate">{d.driver_name}</p>
                              <p className="text-xs text-slate-500 truncate">{d.vehicle_reg || "No vehicle"} · {relTime(d.last?.recorded_at)}</p>
                              {d.at_site && <p className="text-[11px] font-semibold text-violet-600 truncate flex items-center gap-1"><MapPin size={10} /> At {d.at_site}{d.at_site_since ? ` · ${dur((Date.now() - new Date(d.at_site_since).getTime()) / 60000)}` : ""}</p>}
                            </div>
                            {d.on_shift && <span className="text-[9px] font-bold uppercase tracking-wider text-green-700 bg-green-100 rounded-full px-2 py-0.5 shrink-0">Live</span>}
                          </button>
                        ))}
                      </div>
                    )}
                </>
              ) : (
                <>
                  <button data-testid="tracking-back" onClick={backToLive} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 mb-4"><ChevronLeft size={16} /> All drivers</button>
                  {detail && (
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Driver</p>
                        <h3 className="font-heading font-bold text-lg text-slate-900">{detail.driver.name}</h3>
                        <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5"><Truck size={12} /> {detail.driver.vehicle_reg || "No vehicle assigned"}</p>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Route date</label>
                        {detail.dates.length === 0 ? <p className="text-sm text-slate-400">No route data recorded yet.</p>
                          : (
                            <select data-testid="tracking-date-select" value={detail.date || ""} onChange={(e) => openDriver(sel, e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-2 text-sm text-slate-700">
                              {detail.dates.map((d) => <option key={d} value={d}>{fmtDate(d)}</option>)}
                            </select>
                          )}
                      </div>
                      {/* Speed & distance */}
                      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                        <Stat icon={Ruler} label={`Distance`} value={`${toDist(stats?.distance_km || 0).toFixed(1)} ${distU}`} sub={highMileage(stats?.distance_km || 0) ? "High mileage" : null} flag={highMileage(stats?.distance_km || 0)} />
                        <Stat icon={Route} label="Points" value={trail.length} sub={trail.length ? `${fmtTime(trail[0].recorded_at)}–${fmtTime(trail[trail.length - 1].recorded_at)}` : null} />
                        <Stat icon={Gauge} label="Top speed" value={`${toSpd(stats?.top_speed_kmh || 0).toFixed(0)} ${spdU}`} />
                        <Stat icon={Gauge} label="Avg speed" value={`${toSpd(stats?.avg_speed_kmh || 0).toFixed(0)} ${spdU}`} />
                      </div>
                      {/* Playback */}
                      {trail.length >= 2 && (
                        <div className="pt-3 border-t border-slate-100" data-testid="tracking-playback">
                          <div className="flex items-center gap-3">
                            <button data-testid="tracking-play" onClick={() => { if (idx >= trail.length - 1) setIdx(0); setPlaying((p) => !p); }}
                              className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0 active:scale-95">
                              {playing ? <Pause size={18} /> : <Play size={18} />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <input type="range" min={0} max={trail.length - 1} value={idx} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} className="w-full accent-orange-500" />
                              <p className="text-[11px] text-slate-500 mt-0.5">{playhead ? fmtTime(playhead.recorded_at) : "Play route"} · {idx + 1}/{trail.length}</p>
                            </div>
                          </div>
                        </div>
                      )}
                      {stops.length > 0 && (
                        <div className="pt-3 border-t border-slate-100" data-testid="tracking-stops">
                          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold flex items-center gap-1 mb-2"><Pause size={11} /> Idle & stops · {stops.length} · {dur(stops.reduce((a, s) => a + s.minutes, 0))} total</p>
                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {stops.map((s, i) => (
                              <div key={i} data-testid="tracking-stop-row" className="flex items-center justify-between text-xs">
                                <span className="text-slate-600">{fmtTime(s.start)}–{fmtTime(s.end)}</span>
                                <span className="font-semibold text-amber-600">{dur(s.minutes)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {trail.length === 0 && <p className="text-sm text-slate-400">No positions logged on this day.</p>}
                    </div>
                  )}
                </>
              )}
              <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2">
                <Legend color="bg-blue-500" label="Live / route" />
                <Legend color="bg-green-500" label="Shift start" />
                <Legend color="bg-red-500" label="Latest" />
                <Legend color="bg-orange-500" label="Playback" />
                <Legend color="bg-violet-500" label="Site" />
              </div>
            </div>

            {/* Sites (geofences) */}
            <div className="bg-white border border-slate-200 rounded-md p-4 animate-in-up" data-testid="tracking-sites">
              <div className="flex items-center gap-2 mb-3">
                <MapPinned size={16} className="text-violet-600" />
                <h3 className="font-heading font-bold tracking-tight">Sites</h3>
                <button data-testid="tracking-add-site" onClick={() => { setAddSite((a) => !a); setPending(null); }} className={`ml-auto inline-flex items-center gap-1 text-xs font-semibold rounded px-2 py-1 ${addSite ? "bg-violet-600 text-white" : "text-violet-700 bg-violet-100"}`}>
                  <Plus size={13} /> {addSite ? "Cancel" : "Add"}
                </button>
              </div>
              {addSite && (
                <div className="mb-3 rounded-md bg-violet-50 border border-violet-200 p-3 text-xs text-violet-800" data-testid="tracking-add-site-hint">
                  {!pending ? "Click anywhere on the map to place the site." : (
                    <div className="space-y-2">
                      <input data-testid="site-name-input" value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="Site name (e.g. Depot)" className="w-full border border-violet-300 rounded px-2 py-1.5 text-slate-800" />
                      <div className="flex items-center gap-2">
                        <span>Radius</span>
                        <input data-testid="site-radius-input" type="number" min={50} step={50} value={siteRadius} onChange={(e) => setSiteRadius(e.target.value)} className="w-24 border border-violet-300 rounded px-2 py-1.5 text-slate-800" />
                        <span>m</span>
                      </div>
                      <button data-testid="site-save" onClick={saveSite} className="w-full bg-violet-600 text-white font-semibold rounded py-1.5">Save site</button>
                    </div>
                  )}
                </div>
              )}
              {geofences.length === 0 ? <p className="text-sm text-slate-400">No sites yet. Add depots or customer sites to get arrival/leave alerts.</p>
                : (
                  <div className="space-y-1.5" data-testid="tracking-site-list">
                    {geofences.map((g) => (
                      <div key={g.id} className="flex items-center gap-2 text-sm">
                        <MapPin size={13} className="text-violet-500 shrink-0" />
                        <span className="flex-1 min-w-0 truncate font-medium text-slate-700">{g.name} <span className="text-slate-400">· {g.radius_m}m</span></span>
                        <button data-testid="site-delete" onClick={() => deleteSite(g.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>

          {/* Map + site activity */}
          <div className="lg:col-span-3 space-y-6 animate-in-up" style={{ animationDelay: "80ms" }}>
            {!anyData && !sel ? (
              <div className="bg-white border border-slate-200 rounded-md p-10 text-center flex flex-col items-center gap-3 min-h-[600px] justify-center">
                <Navigation size={36} className="text-slate-300" />
                <p className="font-semibold text-slate-700">No location data yet</p>
                <p className="text-sm text-slate-400 max-w-sm">Ask your drivers to open the driver app and tap <span className="font-semibold text-slate-600">"Start Shift"</span>. Their live position and full daily route will appear here.</p>
              </div>
            ) : (
              <MapView markers={markers} trail={trail} geofences={geofences} stops={stops} playhead={playhead} onMapClick={addSite ? handleMapClick : null} />
            )}

            {/* Site activity */}
            <div className="bg-white border border-slate-200 rounded-md p-4" data-testid="tracking-site-activity">
              <div className="flex items-center gap-2 mb-3">
                <CalendarClock size={16} className="text-slate-900" />
                <h3 className="font-heading font-bold tracking-tight">Site activity</h3>
              </div>
              {events.length === 0 ? <p className="text-sm text-slate-400">No arrivals or departures logged yet.</p>
                : (
                  <div className="divide-y divide-slate-100">
                    {events.map((e) => (
                      <div key={e.id} className="flex items-center gap-3 py-2 text-sm">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${e.event === "enter" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                          {e.event === "enter" ? <LogIn size={14} /> : <LogOut size={14} />}
                        </span>
                        <span className="flex-1 min-w-0 truncate">
                          <span className="font-semibold text-slate-800">{e.driver_name}</span>
                          <span className="text-slate-500"> {e.event === "enter" ? "arrived at" : "left"} </span>
                          <span className="font-semibold text-slate-800">{e.geofence_name}</span>
                          {e.event === "leave" && e.dwell_minutes != null && <span className="text-slate-500"> · stayed {dur(e.dwell_minutes)}</span>}
                        </span>
                        <span className="text-xs text-slate-400 shrink-0">{relTime(e.at)}</span>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        </div>
      ) : (
        /* ---------------- Timesheets ---------------- */
        <div className="bg-white border border-slate-200 rounded-md p-5 animate-in-up" data-testid="tracking-timesheets">
          <div className="flex flex-wrap items-end gap-3 mb-5">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Driver</label>
              <select data-testid="ts-driver" value={tsDriver} onChange={(e) => setTsDriver(e.target.value)} className="border border-slate-300 rounded-md px-2 py-2 text-sm">
                <option value="">All drivers</option>
                {drivers.map((d) => <option key={d.driver_id} value={d.driver_id}>{d.driver_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">From</label>
              <input data-testid="ts-from" type="date" value={tsFrom} onChange={(e) => setTsFrom(e.target.value)} className="border border-slate-300 rounded-md px-2 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">To</label>
              <input data-testid="ts-to" type="date" value={tsTo} onChange={(e) => setTsTo(e.target.value)} className="border border-slate-300 rounded-md px-2 py-2 text-sm" />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button data-testid="ts-email-summary" onClick={emailSummary} className="inline-flex items-center gap-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold rounded-md px-4 py-2"><Mail size={15} /> Email me</button>
              <button data-testid="ts-export" onClick={exportCsv} disabled={tsRows.length === 0} className="inline-flex items-center gap-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold rounded-md px-4 py-2 disabled:opacity-50"><Download size={15} /> CSV</button>
              <button data-testid="ts-export-pdf" onClick={exportPdf} disabled={tsRows.length === 0} className="inline-flex items-center gap-2 bg-slate-900 text-white text-sm font-semibold rounded-md px-4 py-2 disabled:opacity-50"><FileText size={15} /> PDF</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="ts-table">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
                  <th className="py-2 pr-3">Driver</th><th className="py-2 pr-3">Vehicle</th><th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Start</th><th className="py-2 pr-3">End</th><th className="py-2 pr-3">Hours</th>
                  <th className="py-2 pr-3">Distance</th><th className="py-2 pr-3">Top</th><th className="py-2 pr-3">Avg</th>
                </tr>
              </thead>
              <tbody>
                {tsLoading ? <tr><td colSpan={9} className="py-8 text-center text-slate-400">Loading…</td></tr>
                  : tsRows.length === 0 ? <tr><td colSpan={9} className="py-8 text-center text-slate-400">No shifts in this range.</td></tr>
                  : tsRows.map((r) => (
                    <tr key={r.shift_id} data-testid="ts-row" className="border-b border-slate-100">
                      <td className="py-2.5 pr-3 font-semibold text-slate-800">{r.driver_name}</td>
                      <td className="py-2.5 pr-3 text-slate-600">{r.vehicle_reg || "—"}</td>
                      <td className="py-2.5 pr-3 text-slate-600">{r.date}</td>
                      <td className="py-2.5 pr-3 text-slate-600">{fmtTime(r.start)}</td>
                      <td className="py-2.5 pr-3 text-slate-600">{r.active ? <span className="text-green-700 font-semibold">on shift</span> : fmtTime(r.end)}</td>
                      <td className="py-2.5 pr-3 font-semibold text-slate-800">{r.hours != null ? `${r.hours}h` : "—"}</td>
                      <td className={`py-2.5 pr-3 font-semibold ${highMileage(r.distance_km) ? "text-amber-600" : "text-slate-800"}`}>{toDist(r.distance_km).toFixed(1)} {distU}</td>
                      <td className="py-2.5 pr-3 text-slate-600">{toSpd(r.top_speed_kmh).toFixed(0)} {spdU}</td>
                      <td className="py-2.5 pr-3 text-slate-600">{toSpd(r.avg_speed_kmh).toFixed(0)} {spdU}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <span className={`w-2.5 h-2.5 rounded-full ${color}`} /> {label}
    </div>
  );
}
