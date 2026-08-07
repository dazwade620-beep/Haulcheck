import { useEffect, useState, useCallback, useRef } from "react";
import driverApi from "@/lib/driverApi";
import { CHECKLIST, buildChecklist } from "@/pages/Walkaround";
import { SignaturePad } from "@/components/SignaturePad";
import { toast } from "sonner";
import {
  Truck, ClipboardCheck, AlertTriangle, IdCard, FileText, ScanSearch, LogOut,
  Check, X, ChevronLeft, Loader2, Camera, ShieldCheck, ChevronRight, Gauge,
  Download, Share, Plus, CalendarRange, MapPin, Play, StopCircle,
} from "lucide-react";

const STATUS = {
  valid: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  due_soon: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  expired: "bg-red-500/15 text-red-300 border-red-500/30",
  unknown: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};
const statusLabel = { valid: "Valid", due_soon: "Due soon", expired: "Expired", unknown: "—" };
const fileUrl = (id) => `${process.env.REACT_APP_BACKEND_URL}/api/driver/files/${id}?auth=${localStorage.getItem("driver_token")}`;

// ---------- Install to home screen ----------
function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [showIosHelp, setShowIosHelp] = useState(false);

  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true);
  const isIos =
    typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferred(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (isStandalone) return null;

  // Android / Chrome — native install prompt available
  if (deferred) {
    return (
      <button
        data-testid="install-app-button"
        onClick={async () => { deferred.prompt(); await deferred.userChoice; setDeferred(null); }}
        className="w-full mt-4 bg-slate-800 border border-slate-700 text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      >
        <Download size={18} /> Add HaulCheck to home screen
      </button>
    );
  }

  // iOS Safari — no native prompt, show manual steps
  if (isIos) {
    return (
      <div className="mt-4">
        <button
          data-testid="install-ios-help-button"
          onClick={() => setShowIosHelp((v) => !v)}
          className="w-full bg-slate-800 border border-slate-700 text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          <Download size={18} /> Add to home screen
        </button>
        {showIosHelp && (
          <div data-testid="install-ios-help" className="mt-3 rounded-xl bg-slate-900 border border-slate-800 p-4 text-sm text-slate-300 leading-relaxed">
            <p className="flex items-center gap-1.5">1. Tap the <Share size={15} className="inline" /> Share button in Safari's toolbar.</p>
            <p className="mt-2 flex items-center gap-1.5">2. Choose <Plus size={15} className="inline" /> <span className="font-semibold text-white">Add to Home Screen</span>.</p>
            <p className="mt-2">3. Tap <span className="font-semibold text-white">Add</span> — HaulCheck will appear as an app icon.</p>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ---------- Login ----------
function DriverLogin({ onLogin }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const doLogin = useCallback(async (raw) => {
    const c = (raw || "").trim().toUpperCase();
    if (!c) return;
    setBusy(true);
    try {
      const { data } = await driverApi.post("/driver/login", { code: c });
      localStorage.setItem("driver_token", data.token);
      onLogin(data.driver);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid access code");
    }
    setBusy(false);
  }, [onLogin]);
  const submit = (e) => { e.preventDefault(); doLogin(code); };
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("code");
    if (c) { setCode(c.toUpperCase()); doLogin(c); }
  }, [doLogin]);
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-white" data-testid="driver-login">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center"><Truck size={22} className="text-slate-950" /></div>
          <div><p className="font-black text-xl leading-none tracking-tight">HaulCheck</p><p className="text-xs text-slate-400 mt-1">Driver App</p></div>
        </div>
        <form onSubmit={submit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h1 className="text-lg font-bold">Enter your access code</h1>
          <p className="text-sm text-slate-400 mt-1 mb-5">Ask your transport manager for your personal code.</p>
          <input
            data-testid="driver-code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            autoCapitalize="characters"
            maxLength={8}
            className="w-full text-center text-2xl font-black tracking-[0.3em] bg-slate-950 border border-slate-700 rounded-xl py-4 uppercase placeholder:text-slate-700 focus:outline-none focus:border-white"
          />
          <button data-testid="driver-login-button" disabled={busy} className="w-full mt-5 bg-white text-slate-950 font-bold rounded-xl py-3.5 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform">
            {busy ? <Loader2 size={18} className="animate-spin" /> : "Log in"}
          </button>
        </form>
        <p className="text-center text-sm text-slate-500 mt-6">
          Are you a transport manager?{" "}
          <a data-testid="driver-manager-login-link" href="/login" className="font-semibold text-white underline underline-offset-4">Sign in here</a>
        </p>
        <InstallPrompt />
      </div>
    </div>
  );
}

// ---------- Shell ----------
function Screen({ title, onBack, children, testid }) {
  return (
    <div className="min-h-screen bg-slate-950 text-white pb-10" data-testid={testid}>
      <div className="sticky top-0 z-10 bg-slate-950/90 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button data-testid="driver-back-button" onClick={onBack} className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center active:scale-95"><ChevronLeft size={20} /></button>
        <h1 className="font-bold text-lg">{title}</h1>
      </div>
      <div className="px-4 pt-4">{children}</div>
    </div>
  );
}

function StatusChip({ status }) {
  return <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${STATUS[status] || STATUS.unknown}`}>{statusLabel[status] || "—"}</span>;
}

// ---------- Shift / GPS tracking ----------
function ShiftTracker({ driver }) {
  const [shift, setShift] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pointsSent, setPointsSent] = useState(0);
  const [lastAt, setLastAt] = useState(null);
  const [geoError, setGeoError] = useState("");
  const watchRef = useRef(null);
  const heartbeatRef = useRef(null);
  const shiftIdRef = useRef(null);
  const lastPostRef = useRef(0);

  const postFix = useCallback((coords) => {
    const now = Date.now();
    if (now - lastPostRef.current < 20000) return; // throttle to ~20s between pings
    lastPostRef.current = now;
    const { latitude, longitude, accuracy, speed, heading } = coords;
    driverApi.post("/driver/location", {
      lat: latitude, lng: longitude, accuracy,
      speed: speed == null ? null : speed, heading: heading == null ? null : heading,
      recorded_at: new Date().toISOString(), shift_id: shiftIdRef.current,
    }).then(() => { setPointsSent((n) => n + 1); setLastAt(new Date()); setGeoError(""); }).catch(() => {});
  }, []);

  const startWatch = useCallback((shiftId) => {
    if (!navigator.geolocation) { setGeoError("This device can't share location."); return; }
    shiftIdRef.current = shiftId;
    const opts = { enableHighAccuracy: true, maximumAge: 10000, timeout: 25000 };
    const onPos = (pos) => postFix(pos.coords);
    const onErr = (err) => setGeoError(err.code === 1
      ? "Location permission denied — enable location to share your route."
      : "Couldn't get a GPS fix. Make sure location is on.");
    if (watchRef.current == null) watchRef.current = navigator.geolocation.watchPosition(onPos, onErr, opts);
    // Heartbeat so a stationary/parked driver still reports position every ~30s
    if (heartbeatRef.current == null) heartbeatRef.current = setInterval(() => navigator.geolocation.getCurrentPosition(onPos, onErr, opts), 30000);
    navigator.geolocation.getCurrentPosition(onPos, onErr, opts); // immediate first fix
  }, [postFix]);

  const stopWatch = useCallback(() => {
    if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    if (heartbeatRef.current != null) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
  }, []);

  useEffect(() => {
    driverApi.get("/driver/shift/active").then(({ data }) => {
      if (data && data.id) { setShift(data); lastPostRef.current = 0; startWatch(data.id); }
    }).catch(() => {});
    return () => stopWatch();
  }, [startWatch, stopWatch]);

  const start = async () => {
    setBusy(true); setGeoError("");
    try {
      const { data } = await driverApi.post("/driver/shift/start");
      setShift(data); setPointsSent(0); lastPostRef.current = 0;
      startWatch(data.id);
      toast.success("Shift started — sharing your location");
    } catch { toast.error("Could not start shift"); }
    setBusy(false);
  };
  const end = async () => {
    setBusy(true);
    stopWatch();
    try { await driverApi.post("/driver/shift/end"); } catch { /* ignore */ }
    setShift(null); setPointsSent(0); setLastAt(null);
    toast.success("Shift ended — location sharing stopped");
    setBusy(false);
  };

  const active = !!shift;
  return (
    <div data-testid="driver-shift-tracker" className={`rounded-2xl border p-4 ${active ? "bg-emerald-500/10 border-emerald-500/40" : "bg-slate-900 border-slate-800"}`}>
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${active ? "bg-emerald-500/20" : "bg-white/10"}`}>
          <MapPin size={22} className={active ? "text-emerald-300" : "text-white"} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold">{active ? "On shift — sharing location" : "Start your shift"}</p>
          <p className="text-sm text-slate-400 truncate">
            {active
              ? `${pointsSent} point${pointsSent === 1 ? "" : "s"} sent${lastAt ? ` · last ${lastAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}`
              : "Share your GPS route with your transport manager"}
          </p>
        </div>
        {active && <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
      </div>
      {geoError && <p data-testid="driver-shift-geo-error" className="text-xs text-red-300 mt-3">{geoError}</p>}
      <button
        data-testid={active ? "driver-end-shift" : "driver-start-shift"}
        onClick={active ? end : start}
        disabled={busy}
        className={`mt-4 w-full flex items-center justify-center gap-2 font-bold rounded-xl py-3 active:scale-[0.98] transition-transform disabled:opacity-60 ${active ? "bg-red-500 text-white" : "bg-emerald-500 text-white"}`}
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : active ? <StopCircle size={18} /> : <Play size={18} />}
        {active ? "End shift" : "Start shift"}
      </button>
    </div>
  );
}

// ---------- Home ----------
function DriverHome({ driver, go, logout }) {
  const tiles = [
    { key: "walkaround", label: "Daily Walkaround Check", desc: "24-point DVSA check", icon: ClipboardCheck },
    { key: "weekly", label: "Weekly Walkaround", desc: "One sheet, tick each day", icon: CalendarRange },
    { key: "defect", label: "Report a Defect", desc: "With photo", icon: AlertTriangle },
    { key: "compliance", label: "My Compliance", desc: "Licence · CPC · Tacho", icon: IdCard },
    { key: "vehicle", label: "My Vehicle", desc: driver.assigned_vehicle_reg || "Not assigned", icon: Truck },
    { key: "tacho", label: "Tacho Analyser", desc: "Upload a printout", icon: ScanSearch },
  ];
  return (
    <div className="min-h-screen bg-slate-950 text-white pb-10" data-testid="driver-home">
      <div className="px-5 pt-8 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">Welcome back</p>
            <h1 className="text-2xl font-black tracking-tight">{driver.name}</h1>
          </div>
          <button data-testid="driver-logout-button" onClick={logout} className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center active:scale-95"><LogOut size={18} /></button>
        </div>
        <button
          data-testid="driver-switch-vehicle-chip"
          onClick={() => go("switch")}
          className="mt-4 inline-flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 active:scale-[0.98] transition-transform"
        >
          <Truck size={16} className="text-slate-400" />
          <span className="font-mono font-bold tracking-wide">{driver.assigned_vehicle_reg || "Choose vehicle"}</span>
          <span className="text-xs font-semibold text-emerald-300 ml-1">Switch</span>
        </button>
      </div>
      <div className="px-4 pb-1"><ShiftTracker driver={driver} /></div>
      <div className="px-4 space-y-3 mt-3">
        {tiles.map((t) => (
          <button key={t.key} data-testid={`driver-tile-${t.key}`} onClick={() => go(t.key)} className="w-full flex items-center gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 text-left active:scale-[0.98] transition-transform">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0"><t.icon size={22} className="text-white" /></div>
            <div className="flex-1 min-w-0"><p className="font-bold">{t.label}</p><p className="text-sm text-slate-400 truncate">{t.desc}</p></div>
            <ChevronRight size={20} className="text-slate-600 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Walkaround ----------
function DriverWalkaround({ driver, back }) {
  const [checklist, setChecklist] = useState(buildChecklist());
  const [mileage, setMileage] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const setItem = (idx, patch) => setChecklist((cl) => cl.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  const failCount = checklist.filter((c) => !c.ok).length;

  const submit = async (cl = checklist) => {
    setBusy(true);
    const failed = cl.filter((c) => !c.ok);
    const compiled = failed.map((c) => `${c.item}${c.note ? `: ${c.note}` : ""}`).join("; ");
    try {
      await driverApi.post("/driver/walkaround", {
        vehicle_reg: driver.assigned_vehicle_reg, checklist: cl, mileage,
        defects_noted: [compiled, notes].filter(Boolean).join(" — "),
        result: failed.length ? "defects_found" : "nil_defect",
        check_date: new Date().toISOString().slice(0, 10),
      });
      toast.success(failed.length ? `Logged — ${failed.length} defect(s)` : "Nil-defect check logged");
      back();
    } catch { toast.error("Could not save check"); }
    setBusy(false);
  };
  const submitNil = () => submit(buildChecklist());

  let flat = -1;
  return (
    <Screen title="Daily Walkaround" onBack={back} testid="driver-walkaround">
      {!driver.assigned_vehicle_reg && <p className="bg-amber-500/15 text-amber-300 text-sm rounded-xl p-3 mb-4">No vehicle assigned — ask your manager to assign one.</p>}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-3 mb-4">
        <span className="font-mono font-bold">{driver.assigned_vehicle_reg || "—"}</span>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${failCount ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"}`}>{failCount ? `${failCount} defect(s)` : "Nil defect"}</span>
      </div>
      <button data-testid="driver-walk-nil" disabled={busy || !driver.assigned_vehicle_reg} onClick={submitNil} className="w-full mb-3 bg-emerald-600 text-white font-bold rounded-xl py-3.5 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]">
        <Check size={18} /> Nil defect — all OK, submit
      </button>
      <p className="text-center text-xs text-slate-500 mb-4">…or record item-by-item below if you spotted a defect.</p>
      <input data-testid="driver-walk-mileage" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="Mileage (optional)" className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-3 mb-4 text-white placeholder:text-slate-500" />
      {CHECKLIST.map((sec) => (
        <div key={sec.section} className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{sec.section}</p>
          <div className="space-y-2">
            {sec.items.map((item) => {
              flat += 1;
              const idx = flat;
              const c = checklist[idx];
              return (
                <div key={item} data-testid="driver-check-item" className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm">{item}</span>
                    <div className="flex gap-1.5 shrink-0">
                      <button data-testid={`driver-item-ok-${idx}`} onClick={() => setItem(idx, { ok: true, note: "" })} className={`w-9 h-8 rounded-lg flex items-center justify-center border ${c.ok ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-700 text-slate-500"}`}><Check size={16} /></button>
                      <button data-testid={`driver-item-fail-${idx}`} onClick={() => setItem(idx, { ok: false })} className={`w-9 h-8 rounded-lg flex items-center justify-center border ${!c.ok ? "bg-red-500 border-red-500 text-white" : "border-slate-700 text-slate-500"}`}><X size={16} /></button>
                    </div>
                  </div>
                  {!c.ok && <input data-testid={`driver-item-note-${idx}`} value={c.note} onChange={(e) => setItem(idx, { note: e.target.value })} placeholder="Describe the defect…" className="w-full mt-2 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600" />}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <textarea data-testid="driver-walk-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes (optional)" rows={2} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-3 text-white placeholder:text-slate-500 mb-4" />
      <button data-testid="driver-submit-walkaround" disabled={busy || !driver.assigned_vehicle_reg} onClick={() => submit()} className="w-full bg-white text-slate-950 font-bold rounded-xl py-3.5 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]">
        {busy ? <Loader2 size={18} className="animate-spin" /> : "Submit check"}
      </button>
    </Screen>
  );
}

// ---------- Weekly Walkaround ----------
const _WD = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const _WD_LABEL = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const todayKey = () => _WD[(new Date().getDay() + 6) % 7];
// Ordered columns beginning on the sheet's start date (supports mid-week starts)
const driverWeekCols = (weekStart) => {
  const start = new Date(`${weekStart || new Date().toISOString().slice(0, 10)}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = _WD[(d.getDay() + 6) % 7];
    return { key, date: d, label: `${_WD_LABEL[key]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` };
  });
};

function DriverWeeklyWalkaround({ driver, back }) {
  const [sheet, setSheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false); // in checklist mode
  const [checklist, setChecklist] = useState(buildChecklist());
  const [mileage, setMileage] = useState("");
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSheet = useCallback(async () => {
    try { const { data } = await driverApi.get("/driver/weekly-walkaround"); setSheet(data); }
    catch { toast.error("Could not load this week's sheet"); }
    setLoading(false);
  }, []);
  useEffect(() => { loadSheet(); }, [loadSheet]);

  const setItem = (idx, patch) => setChecklist((cl) => cl.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  const failCount = checklist.filter((c) => !c.ok).length;
  const tKey = todayKey();
  const todayDone = (sheet?.days?.[tKey]?.checklist || []).length > 0;
  const needSignature = sheet && !sheet.driver_signature;
  const missedDays = !sheet?.week_start ? 0 : driverWeekCols(sheet.week_start).filter((col) => {
    if ((sheet?.days?.[col.key]?.checklist || []).length > 0) return false;
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return col.date < t;
  }).length;

  const submit = async (cl = checklist) => {
    if (needSignature && !signature) { toast.error("Please add your signature for the week"); return; }
    setBusy(true);
    try {
      const { data } = await driverApi.post("/driver/weekly-walkaround/day", {
        vehicle_reg: driver.assigned_vehicle_reg, checklist: cl, mileage, signature,
      });
      setSheet(data);
      const fc = cl.filter((c) => !c.ok).length;
      toast.success(fc ? `Today logged — ${fc} defect(s)` : "Today's check logged");
      setChecking(false); setChecklist(buildChecklist()); setMileage(""); setSignature("");
    } catch { toast.error("Could not save check"); }
    setBusy(false);
  };
  const nilToday = () => {
    if (needSignature) { setChecklist(buildChecklist()); setChecking(true); return; }
    submit(buildChecklist());
  };

  if (loading) return <Screen title="Weekly Walkaround" onBack={back} testid="driver-weekly"><div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-500" /></div></Screen>;

  if (checking) {
    let flat = -1;
    return (
      <Screen title="Today's Check" onBack={() => setChecking(false)} testid="driver-weekly-check">
        <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-3 mb-4">
          <span className="font-mono font-bold">{driver.assigned_vehicle_reg || "—"}</span>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${failCount ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"}`}>{failCount ? `${failCount} defect(s)` : "Nil defect"}</span>
        </div>
        <input data-testid="driver-weekly-mileage" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="Odometer today (optional)" className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-3 mb-3 text-white placeholder:text-slate-500" />
        <button data-testid="weekly-mark-all-ok" onClick={() => setChecklist(buildChecklist())} className="w-full mb-4 border border-emerald-600 text-emerald-300 font-semibold rounded-xl py-2.5 flex items-center justify-center gap-2 active:scale-[0.98]"><Check size={16} /> Mark all OK (nil defect)</button>
        {CHECKLIST.map((sec) => (
          <div key={sec.section} className="mb-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{sec.section}</p>
            <div className="space-y-2">
              {sec.items.map((item) => {
                flat += 1; const idx = flat; const c = checklist[idx];
                return (
                  <div key={item} data-testid="driver-weekly-item" className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm">{item}</span>
                      <div className="flex gap-1.5 shrink-0">
                        <button data-testid={`weekly-item-ok-${idx}`} onClick={() => setItem(idx, { ok: true, note: "" })} className={`w-9 h-8 rounded-lg flex items-center justify-center border ${c.ok ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-700 text-slate-500"}`}><Check size={16} /></button>
                        <button data-testid={`weekly-item-fail-${idx}`} onClick={() => setItem(idx, { ok: false })} className={`w-9 h-8 rounded-lg flex items-center justify-center border ${!c.ok ? "bg-red-500 border-red-500 text-white" : "border-slate-700 text-slate-500"}`}><X size={16} /></button>
                      </div>
                    </div>
                    {!c.ok && <input data-testid={`weekly-item-note-${idx}`} value={c.note} onChange={(e) => setItem(idx, { note: e.target.value })} placeholder="Describe the defect…" className="w-full mt-2 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600" />}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {needSignature && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 mb-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Driver signature (once for the week)</p>
            <div className="bg-white rounded-lg overflow-hidden"><SignaturePad testid="driver-weekly-signature" value={signature} onChange={setSignature} /></div>
          </div>
        )}
        <button data-testid="driver-submit-weekly" disabled={busy || !driver.assigned_vehicle_reg} onClick={() => submit()} className="w-full bg-white text-slate-950 font-bold rounded-xl py-3.5 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]">
          {busy ? <Loader2 size={18} className="animate-spin" /> : "Submit today's check"}
        </button>
      </Screen>
    );
  }

  return (
    <Screen title="Weekly Walkaround" onBack={back} testid="driver-weekly">
      {!driver.assigned_vehicle_reg && <p className="bg-amber-500/15 text-amber-300 text-sm rounded-xl p-3 mb-4">No vehicle assigned — ask your manager to assign one.</p>}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between">
          <span className="font-mono font-bold text-lg">{sheet?.vehicle_reg || driver.assigned_vehicle_reg || "—"}</span>
          <span className="text-xs text-slate-400">w/c {sheet?.week_start}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-4">
          {driverWeekCols(sheet?.week_start).map((col) => {
            const filled = (sheet?.days?.[col.key]?.checklist || []).length > 0;
            const hasDefect = (sheet?.days?.[col.key]?.checklist || []).some((c) => !c.ok);
            let missed = false;
            if (!filled) {
              const t = new Date(); t.setHours(0, 0, 0, 0);
              missed = col.date < t;
            }
            const cls = filled
              ? (hasDefect ? "bg-amber-500/25 text-amber-200" : "bg-emerald-500/25 text-emerald-200")
              : missed ? "bg-red-500/25 text-red-300" : "bg-slate-800 text-slate-500";
            return (
              <div key={col.key} title={col.label} data-testid={`weekly-day-${col.key}`} className={`flex-1 text-center text-[11px] font-bold py-2 rounded-lg ${col.key === tKey ? "ring-2 ring-white/40 " : ""}${cls}`}>{_WD_LABEL[col.key]}</div>
            );
          })}
        </div>
        {missedDays > 0 && <p data-testid="driver-weekly-missed" className="text-xs text-red-300 mt-3">{missedDays} day(s) this week were missed — catch up if the vehicle was used.</p>}
      </div>
      <button
        data-testid="driver-start-weekly-today"
        disabled={!driver.assigned_vehicle_reg}
        onClick={() => { setChecklist(buildChecklist()); setChecking(true); }}
        className="w-full bg-white text-slate-950 font-bold rounded-xl py-3.5 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
      >
        <ClipboardCheck size={18} /> {todayDone ? "Redo today's check" : "Do today's check"}
      </button>
      <button
        data-testid="driver-weekly-nil-today"
        disabled={!driver.assigned_vehicle_reg}
        onClick={nilToday}
        className="w-full mt-3 border border-emerald-600 text-emerald-300 font-semibold rounded-xl py-3 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
      >
        <Check size={18} /> {todayDone ? "Redo as nil defect" : "Nil defect today (all OK)"}
      </button>
      {todayDone && <p className="text-center text-sm text-emerald-400 mt-3">✓ Today's check is already recorded on this week's sheet.</p>}
    </Screen>
  );
}

// ---------- Defect ----------
function DriverDefect({ driver, back }) {
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("minor");
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await driverApi.post("/driver/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setAttachments((a) => [...a, { file_id: data.file_id, filename: data.filename, content_type: data.content_type }]);
      toast.success("Photo added");
    } catch { toast.error("Upload failed"); }
    setUploading(false);
  };

  const submit = async () => {
    if (!description.trim()) return toast.error("Describe the defect");
    setBusy(true);
    try {
      await driverApi.post("/driver/defect", {
        vehicle_reg: driver.assigned_vehicle_reg, description, severity, attachments,
        defect_date: new Date().toISOString().slice(0, 10),
      });
      toast.success("Defect reported");
      back();
    } catch { toast.error("Could not report defect"); }
    setBusy(false);
  };

  return (
    <Screen title="Report a Defect" onBack={back} testid="driver-defect">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 mb-4 flex items-center justify-between">
        <span className="text-sm text-slate-400">Vehicle</span>
        <span className="font-mono font-bold">{driver.assigned_vehicle_reg || "—"}</span>
      </div>
      <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Severity</label>
      <div className="grid grid-cols-3 gap-2 mt-2 mb-4">
        {["minor", "major", "safety_critical"].map((s) => (
          <button key={s} data-testid={`driver-severity-${s}`} onClick={() => setSeverity(s)} className={`py-2.5 rounded-xl text-sm font-semibold border ${severity === s ? "bg-white text-slate-950 border-white" : "bg-slate-900 border-slate-800 text-slate-300"}`}>{s === "safety_critical" ? "Critical" : s[0].toUpperCase() + s.slice(1)}</button>
        ))}
      </div>
      <textarea data-testid="driver-defect-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the defect…" rows={4} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-3 text-white placeholder:text-slate-500 mb-4" />
      <label data-testid="driver-defect-photo" className="flex items-center justify-center gap-2 bg-slate-900 border border-dashed border-slate-700 rounded-xl py-4 mb-2 cursor-pointer active:scale-[0.98]">
        {uploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
        <span className="text-sm font-semibold">{uploading ? "Uploading…" : "Add photo"}</span>
        <input type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
      </label>
      {attachments.length > 0 && <p className="text-xs text-slate-400 mb-4">{attachments.length} photo(s) attached</p>}
      <button data-testid="driver-submit-defect" disabled={busy} onClick={submit} className="w-full mt-2 bg-white text-slate-950 font-bold rounded-xl py-3.5 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]">
        {busy ? <Loader2 size={18} className="animate-spin" /> : "Report defect"}
      </button>
    </Screen>
  );
}

// ---------- Compliance ----------
function DriverCompliance({ profile, back }) {
  const items = [
    { label: "Driving Licence", exp: profile.licence_expiry, status: profile.licence_status, extra: profile.licence_number },
    { label: "Driver CPC", exp: profile.cpc_expiry, status: profile.cpc_status },
    { label: "Tacho Card", exp: profile.tacho_card_expiry, status: profile.tacho_status },
  ];
  return (
    <Screen title="My Compliance" onBack={back} testid="driver-compliance">
      <div className="space-y-3">
        {items.map((it) => (
          <div key={it.label} data-testid="driver-compliance-item" className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div><p className="font-bold">{it.label}</p>{it.extra && <p className="text-xs text-slate-500 font-mono">{it.extra}</p>}</div>
              <StatusChip status={it.status} />
            </div>
            <p className="text-sm text-slate-400 mt-2">Expires: <span className="text-white font-semibold">{it.exp || "—"}</span></p>
          </div>
        ))}
      </div>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-6 mb-2">My Letters & Documents</p>
      {(profile.documents || []).length === 0 ? (
        <p className="text-sm text-slate-500 py-4">No documents shared with you yet.</p>
      ) : (
        <div className="space-y-2">
          {profile.documents.map((d) => (
            <a key={d.id} data-testid="driver-document" href={d.attachments?.[0]?.file_id ? fileUrl(d.attachments[0].file_id) : "#"} target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl p-3 active:scale-[0.98]">
              <FileText size={18} className="text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold truncate">{d.title}</p><p className="text-xs text-slate-500">{d.doc_type}</p></div>
              <ChevronRight size={18} className="text-slate-600" />
            </a>
          ))}
        </div>
      )}
    </Screen>
  );
}

// ---------- Vehicle ----------
function DriverVehicle({ back }) {
  const [data, setData] = useState(null);
  useEffect(() => { driverApi.get("/driver/vehicle").then((r) => setData(r.data)).catch(() => setData({ vehicle: null })); }, []);
  const v = data?.vehicle;
  return (
    <Screen title="My Vehicle" onBack={back} testid="driver-vehicle">
      {!data ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-500" /></div> : !v ? (
        <p className="text-slate-400 text-sm py-8 text-center">No vehicle assigned. Ask your manager.</p>
      ) : (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-4">
            <p className="font-mono text-2xl font-black tracking-wide">{v.registration}</p>
            <p className="text-slate-400 mt-1">{[v.make, v.model].filter(Boolean).join(" ") || v.type}</p>
          </div>
          {[["MOT / CVRT", v.mot_due, v.mot_status], ["Service", v.service_due, v.service_status], ["Tax", v.tax_due, v.tax_status]].map(([label, exp, st]) => (
            <div key={label} className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-3 mb-2">
              <div><p className="text-sm font-semibold">{label}</p><p className="text-xs text-slate-500">{exp || "—"}</p></div>
              <StatusChip status={st} />
            </div>
          ))}
        </>
      )}
    </Screen>
  );
}

// ---------- Tacho ----------
function DriverTacho({ back }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await driverApi.post("/driver/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const { data } = await driverApi.post("/driver/tacho/analyse", { file_id: up.data.file_id });
      setResult(data);
      toast.success("Analysis complete");
    } catch { toast.error("Could not analyse the file"); }
    setBusy(false);
  };
  return (
    <Screen title="Tacho Analyser" onBack={back} testid="driver-tacho">
      <p className="text-sm text-slate-400 mb-4">Upload a photo of your tacho printout — AI checks it for drivers' hours infringements.</p>
      <label data-testid="driver-tacho-upload" className="flex items-center justify-center gap-2 bg-slate-900 border border-dashed border-slate-700 rounded-xl py-5 cursor-pointer active:scale-[0.98]">
        {busy ? <Loader2 size={18} className="animate-spin" /> : <ScanSearch size={18} />}
        <span className="font-semibold">{busy ? "Analysing…" : "Upload printout"}</span>
        <input type="file" accept="image/*,application/pdf" capture="environment" onChange={onFile} className="hidden" />
      </label>
      {result && (
        <div className="mt-5" data-testid="driver-tacho-result">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={18} className={result.total_infringements > 0 ? "text-red-400" : "text-emerald-400"} />
            <span className="font-bold">{result.total_infringements} infringement(s)</span>
          </div>
          {result.summary && <p className="text-sm text-slate-300 mb-3">{result.summary}</p>}
          <div className="space-y-2">
            {(result.infringements || []).map((i, idx) => (
              <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                <p className="font-semibold text-sm">{i.type}</p>
                {i.rule && <p className="text-xs text-slate-400 mt-0.5">{i.rule}</p>}
                {i.detail && <p className="text-xs text-slate-500 mt-1">{i.detail}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Screen>
  );
}

// ---------- Switch vehicle ----------
function DriverSwitchVehicle({ driver, back, onSwitched }) {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    driverApi.get("/driver/vehicles").then((r) => setList(r.data)).catch(() => setList([]));
  }, []);
  const current = (driver.assigned_vehicle_reg || "").toUpperCase();
  const choose = async (reg) => {
    setBusy(reg);
    try {
      const { data } = await driverApi.post("/driver/active-vehicle", { registration: reg });
      onSwitched(data);
      toast.success(`Now driving ${reg}`);
      back();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not switch vehicle");
      setBusy("");
    }
  };
  return (
    <Screen title="Switch vehicle" onBack={back} testid="driver-switch-vehicle">
      <p className="text-sm text-slate-400 mb-4">Pick the vehicle you're driving today. Your walkaround checks, defect reports and tracking will use it.</p>
      {!list ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-500" /></div>
      ) : list.length === 0 ? (
        <p className="text-slate-400 text-sm py-8 text-center">No vehicles in your fleet yet. Ask your manager to add one.</p>
      ) : (
        <div className="space-y-2" data-testid="switch-vehicle-list">
          {list.map((v) => {
            const isCurrent = v.registration.toUpperCase() === current;
            const sub = [v.make, v.model].filter(Boolean).join(" ") || v.type;
            return (
              <button
                key={v.registration}
                data-testid={`switch-vehicle-${v.registration}`}
                disabled={!!busy}
                onClick={() => choose(v.registration)}
                className={`w-full flex items-center justify-between rounded-xl p-4 border active:scale-[0.98] transition-transform disabled:opacity-60 ${isCurrent ? "bg-white/10 border-white" : "bg-slate-900 border-slate-800"}`}
              >
                <div className="text-left min-w-0">
                  <p className="font-mono font-bold tracking-wide text-lg">{v.registration}</p>
                  {sub && <p className="text-xs text-slate-400 truncate">{sub}</p>}
                </div>
                {busy === v.registration ? (
                  <Loader2 size={18} className="animate-spin shrink-0" />
                ) : isCurrent ? (
                  <span className="flex items-center gap-1 text-xs font-bold text-emerald-300 shrink-0"><Check size={16} /> Current</span>
                ) : (
                  <ChevronRight size={18} className="text-slate-600 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </Screen>
  );
}

// ---------- Root ----------
export default function DriverApp() {
  const [driver, setDriver] = useState(null);
  const [profile, setProfile] = useState(null);
  const [screen, setScreen] = useState("home");
  const [checking, setChecking] = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      const { data } = await driverApi.get("/driver/me");
      setProfile(data);
      setDriver(data);
    } catch {
      localStorage.removeItem("driver_token");
      setDriver(null);
    }
    setChecking(false);
  }, []);

  useEffect(() => {
    if (localStorage.getItem("driver_token")) loadProfile();
    else setChecking(false);
  }, [loadProfile]);

  const logout = () => { localStorage.removeItem("driver_token"); setDriver(null); setProfile(null); setScreen("home"); };
  const go = (s) => { if (s === "compliance") loadProfile(); setScreen(s); };
  const back = () => { setScreen("home"); loadProfile(); };

  if (checking) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-slate-500" /></div>;
  if (!driver) return <DriverLogin onLogin={(d) => { setDriver(d); setProfile(d); loadProfile(); }} />;

  if (screen === "walkaround") return <DriverWalkaround driver={driver} back={back} />;
  if (screen === "weekly") return <DriverWeeklyWalkaround driver={driver} back={back} />;
  if (screen === "defect") return <DriverDefect driver={driver} back={back} />;
  if (screen === "compliance") return <DriverCompliance profile={profile || driver} back={back} />;
  if (screen === "vehicle") return <DriverVehicle back={back} />;
  if (screen === "switch") return <DriverSwitchVehicle driver={driver} back={back} onSwitched={(d) => { setDriver((prev) => ({ ...prev, ...d })); setProfile((prev) => ({ ...(prev || {}), ...d })); }} />;
  if (screen === "tacho") return <DriverTacho back={back} />;
  return <DriverHome driver={driver} go={go} logout={logout} />;
}
