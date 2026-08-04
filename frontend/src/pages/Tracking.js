import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Radio, RefreshCw, Route, Truck, ChevronLeft, Navigation, Clock } from "lucide-react";
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

function MapView({ markers = [], trail = [] }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { scrollWheelZoom: true }).setView([54.2, -4.0], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors", maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 200);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds = [];

    if (trail.length > 0) {
      const line = trail.filter((p) => p.lat != null).map((p) => [p.lat, p.lng]);
      line.forEach((c) => bounds.push(c));
      if (line.length > 1) {
        L.polyline(line, { color: "#2563eb", weight: 4, opacity: 0.85 }).addTo(layer);
      }
      const s = trail[0], e = trail[trail.length - 1];
      L.circleMarker([s.lat, s.lng], { radius: 7, color: "#15803d", fillColor: "#22c55e", fillOpacity: 1, weight: 2 })
        .bindPopup(`Shift start<br>${s.recorded_at ? new Date(s.recorded_at).toLocaleTimeString() : ""}`).addTo(layer);
      L.circleMarker([e.lat, e.lng], { radius: 8, color: "#b91c1c", fillColor: "#ef4444", fillOpacity: 1, weight: 2 })
        .bindPopup(`Latest position<br>${e.recorded_at ? new Date(e.recorded_at).toLocaleTimeString() : ""}`).addTo(layer);
    }

    markers.forEach((m) => {
      if (m.lat == null) return;
      L.circleMarker([m.lat, m.lng], { radius: 8, color: "#1d4ed8", fillColor: "#3b82f6", fillOpacity: 1, weight: 2 })
        .bindPopup(`<b>${m.name || "Driver"}</b>${m.vehicle_reg ? "<br>" + m.vehicle_reg : ""}${m.recorded_at ? "<br>" + new Date(m.recorded_at).toLocaleString() : ""}`)
        .addTo(layer);
      bounds.push([m.lat, m.lng]);
    });

    if (bounds.length === 1) map.setView(bounds[0], 14);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [markers, trail]);

  return <div ref={elRef} data-testid="tracking-map" className="w-full h-[600px] rounded-md overflow-hidden border border-slate-200 relative z-0" />;
}

export default function Tracking() {
  const [drivers, setDrivers] = useState([]);
  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadLive = useCallback(async () => {
    try { const { data } = await api.get("/tracking/live"); setDrivers(data.drivers || []); }
    catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadLive();
    const t = setInterval(() => { if (!sel) loadLive(); }, 30000);
    return () => clearInterval(t);
  }, [loadLive, sel]);

  const openDriver = async (id, date) => {
    setSel(id);
    try {
      const { data } = await api.get(`/tracking/driver/${id}${date ? `?date=${date}` : ""}`);
      setDetail(data);
    } catch { toast.error("Could not load route history"); }
  };
  const backToLive = () => { setSel(null); setDetail(null); loadLive(); };

  const liveMarkers = drivers
    .filter((d) => d.last && d.last.lat != null)
    .map((d) => ({ name: d.driver_name, vehicle_reg: d.vehicle_reg, lat: d.last.lat, lng: d.last.lng, recorded_at: d.last.recorded_at }));
  const trail = sel && detail ? (detail.points || []) : [];
  const markers = sel ? [] : liveMarkers;
  const anyData = drivers.some((d) => d.last) || drivers.some((d) => d.on_shift);

  return (
    <div data-testid="tracking-page">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Fleet</p>
          <h1 className="font-heading text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mt-1">Live Tracking</h1>
          <p className="text-slate-500 text-sm mt-1">Live driver positions & full daily route history — from the driver app "Start Shift"</p>
        </div>
        <button data-testid="tracking-refresh" onClick={loadLive} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 rounded-md px-3 py-2">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Driver list / detail sidebar */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-md p-4 animate-in-up">
          {!sel ? (
            <>
              <div className="flex items-center gap-2 mb-4">
                <Radio size={16} className="text-slate-900" />
                <h3 className="font-heading font-bold tracking-tight">Drivers</h3>
                <span className="ml-auto text-xs text-slate-400">{drivers.length}</span>
              </div>
              {loading ? (
                <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>
              ) : drivers.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">No drivers on this account yet.</p>
              ) : (
                <div className="space-y-2" data-testid="tracking-driver-list">
                  {drivers.map((d) => (
                    <button
                      key={d.driver_id}
                      data-testid="tracking-driver-item"
                      onClick={() => openDriver(d.driver_id)}
                      className="w-full flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2.5 text-left hover:border-slate-900 hover:bg-slate-50 transition-colors"
                    >
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${d.on_shift ? "bg-green-500 animate-pulse" : "bg-slate-300"}`} title={d.on_shift ? "On shift" : "Off shift"} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate">{d.driver_name}</p>
                        <p className="text-xs text-slate-500 truncate">{d.vehicle_reg || "No vehicle"} · {relTime(d.last?.recorded_at)}</p>
                      </div>
                      {d.on_shift && <span className="text-[9px] font-bold uppercase tracking-wider text-green-700 bg-green-100 rounded-full px-2 py-0.5 shrink-0">Live</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <button data-testid="tracking-back" onClick={backToLive} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 mb-4">
                <ChevronLeft size={16} /> All drivers
              </button>
              {detail && (
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Driver</p>
                    <h3 className="font-heading font-bold text-lg text-slate-900">{detail.driver.name}</h3>
                    <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5"><Truck size={12} /> {detail.driver.vehicle_reg || "No vehicle assigned"}</p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Route date</label>
                    {detail.dates.length === 0 ? (
                      <p className="text-sm text-slate-400">No route data recorded yet.</p>
                    ) : (
                      <select
                        data-testid="tracking-date-select"
                        value={detail.date || ""}
                        onChange={(e) => openDriver(sel, e.target.value)}
                        className="w-full border border-slate-300 rounded-md px-2 py-2 text-sm text-slate-700"
                      >
                        {detail.dates.map((d) => (
                          <option key={d} value={d}>{(() => { try { return format(parseISO(d), "EEE d MMM yyyy"); } catch { return d; } })()}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold flex items-center gap-1"><Route size={11} /> Points</p>
                      <p data-testid="tracking-point-count" className="font-heading font-bold text-xl text-slate-900">{trail.length}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold flex items-center gap-1"><Clock size={11} /> Span</p>
                      <p className="font-semibold text-sm text-slate-700">
                        {trail.length > 0 ? `${new Date(trail[0].recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–${new Date(trail[trail.length - 1].recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "—"}
                      </p>
                    </div>
                  </div>
                  {trail.length === 0 && <p className="text-sm text-slate-400">No positions logged on this day.</p>}
                </div>
              )}
            </>
          )}

          <div className="mt-6 pt-4 border-t border-slate-100 space-y-2">
            <Legend color="bg-blue-500" label="Live position" />
            <Legend color="bg-green-500" label="Shift start" />
            <Legend color="bg-red-500" label="Latest position" />
          </div>
        </div>

        {/* Map */}
        <div className="lg:col-span-3 animate-in-up" style={{ animationDelay: "80ms" }}>
          {!anyData && !sel ? (
            <div className="bg-white border border-slate-200 rounded-md p-10 text-center flex flex-col items-center gap-3 min-h-[600px] justify-center">
              <Navigation size={36} className="text-slate-300" />
              <p className="font-semibold text-slate-700">No location data yet</p>
              <p className="text-sm text-slate-400 max-w-sm">Ask your drivers to open the driver app and tap <span className="font-semibold text-slate-600">"Start Shift"</span>. Their live position and full daily route will appear here.</p>
            </div>
          ) : (
            <MapView markers={markers} trail={trail} />
          )}
        </div>
      </div>
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
