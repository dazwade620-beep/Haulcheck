import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, CalendarDays, Wrench, CheckCircle2, FileWarning, GraduationCap,
  ShieldCheck, Gauge, Plus, Flag, Trash2, Pencil, Cog, ArrowRight, ClipboardCheck, Palmtree, Ban,
  Bell, UserPlus, UserMinus, ClipboardList, Disc3,
} from "lucide-react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isToday, addMonths, subMonths, parseISO, isSameDay,
} from "date-fns";
import { cn } from "@/lib/utils";
import { MaintenanceQuickAdd } from "@/components/MaintenanceQuickAdd";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TYPE_META = {
  pmi_due: { icon: Wrench, label: "PMI Due" },
  pmi_done: { icon: CheckCircle2, label: "PMI Completed" },
  defect: { icon: FileWarning, label: "Defect" },
  training: { icon: GraduationCap, label: "Training" },
  insurance: { icon: ShieldCheck, label: "Insurance Renewal" },
  tacho: { icon: Gauge, label: "Tacho Download" },
  wheel: { icon: Wrench, label: "Wheel Security" },
  service: { icon: Cog, label: "Service" },
  job_card: { icon: ClipboardList, label: "Job Card" },
  walkaround: { icon: ClipboardCheck, label: "Daily Check" },
  weekly_walkaround: { icon: ClipboardCheck, label: "Daily Check Complete" },
  vehicle: { icon: Gauge, label: "Vehicle" },
  driver: { icon: ShieldCheck, label: "Driver" },
  driver_start: { icon: UserPlus, label: "Driver Started" },
  driver_leave: { icon: UserMinus, label: "Driver Leaving" },
  holiday: { icon: Palmtree, label: "Holiday" },
  reminder: { icon: Bell, label: "Reminder" },
  vor: { icon: Ban, label: "Off Road (VOR)" },
  custom: { icon: Flag, label: "Event" },
};

const dotColor = (status) => (status === "expired" ? "bg-red-500" : status === "due_soon" ? "bg-yellow-500" : "bg-green-500");
const pillColor = (status) => (status === "expired" ? "bg-red-100 text-red-700" : status === "due_soon" ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-700");

// Where each auto-generated event type lives so the user can edit it at source.
const EVENT_LINK = {
  pmi_due: "/maintenance?tab=pmi",
  pmi_done: "/maintenance?tab=pmi",
  wheel: "/maintenance?tab=wheel",
  service: "/maintenance?tab=service",
  job_card: "/maintenance?tab=job-cards",
  walkaround: "/maintenance?tab=walkaround",
  weekly_walkaround: "/maintenance?tab=weekly",
  defect: "/maintenance?tab=defects",
  training: "/office?tab=training",
  insurance: "/office?tab=insurance",
  tacho: "/tacho",
  vehicle: "/vehicles",
  driver: "/drivers",
  driver_start: "/drivers",
  driver_leave: "/drivers",
  vor: "/vehicles",
};

// The unified "Add Event" menu. kind=maint opens MaintenanceQuickAdd on that type; kind=evt opens the event dialog.
const ADD_GROUPS = [
  {
    group: "Maintenance",
    items: [
      { key: "pmi", label: "PMI Inspection", icon: Wrench, kind: "maint" },
      { key: "service", label: "Service", icon: Cog, kind: "maint" },
      { key: "defect", label: "Defect", icon: FileWarning, kind: "maint" },
      { key: "walkaround", label: "Daily Check", icon: ClipboardCheck, kind: "maint" },
      { key: "wheel", label: "Wheel Security", icon: Disc3, kind: "maint" },
      { key: "job_card", label: "Job Card", icon: ClipboardList, kind: "maint" },
    ],
  },
  {
    group: "People",
    items: [
      { key: "driver_start", label: "Driver started", icon: UserPlus, kind: "evt" },
      { key: "driver_leave", label: "Driver leaving", icon: UserMinus, kind: "evt" },
      { key: "training", label: "Training day", icon: GraduationCap, kind: "evt" },
    ],
  },
  {
    group: "Reminders & other",
    items: [
      { key: "reminder", label: "Reminder", icon: Bell, kind: "evt" },
      { key: "tacho", label: "Tacho download", icon: Gauge, kind: "evt" },
      { key: "holiday", label: "Holiday", icon: Palmtree, kind: "evt" },
      { key: "event", label: "General event", icon: Flag, kind: "evt" },
    ],
  },
];

const MODE_TITLE = {
  event: "Add general event", reminder: "Add reminder", tacho: "Log tacho download",
  holiday: "Add holiday", driver_start: "Driver started", driver_leave: "Driver leaving",
  training: "Add training day",
};

export default function Calendar() {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(new Date());
  const [dayOpen, setDayOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [evtOpen, setEvtOpen] = useState(false);
  const [evtForm, setEvtForm] = useState({ date: "", title: "", notes: "" });
  const [evtEditId, setEvtEditId] = useState(null);
  const [evtMode, setEvtMode] = useState("event");
  const [assets, setAssets] = useState([]);
  const [vehicleRegs, setVehicleRegs] = useState([]);
  const [drivers, setDrivers] = useState([]); // [{id,name}]
  const [driverNames, setDriverNames] = useState([]);
  const [maintOpen, setMaintOpen] = useState(false);
  const [maintInitial, setMaintInitial] = useState("pmi");
  const [tachoForm, setTachoForm] = useState({ source_type: "Vehicle Unit", reference: "", last_download: "", frequency_days: 90 });
  const [holForm, setHolForm] = useState({ name: "", from_date: "", to_date: "", notes: "" });
  const [remForm, setRemForm] = useState({ date: "", title: "", notes: "", email: false, days_before: 0 });
  const [dlForm, setDlForm] = useState({ driver_id: "", date: "" });
  const [trForm, setTrForm] = useState({ driver_name: "", course_name: "", category: "Driver CPC", completed_date: "", expiry_date: "", provider: "", hours: "" });

  const loadEvents = () => api.get("/calendar").then((r) => setEvents(r.data));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadEvents();
    Promise.all([api.get("/vehicles"), api.get("/trailers"), api.get("/drivers")]).then(([v, t, dr]) => {
      const vr = v.data.map((x) => x.registration).filter(Boolean);
      setVehicleRegs([...vr, ...t.data.map((x) => x.trailer_number).filter(Boolean)]);
      setDrivers(dr.data.map((x) => ({ id: x.id, name: x.name })).filter((x) => x.name));
      setDriverNames(dr.data.map((x) => x.name).filter(Boolean));
      setAssets([...vr, ...t.data.map((x) => x.trailer_number)].filter(Boolean));
    });
  }, []);

  const openChooser = () => setChooserOpen(true);

  const startMode = (mode) => {
    const d = format(selected, "yyyy-MM-dd");
    setEvtEditId(null);
    setEvtMode(mode);
    setEvtForm({ date: d, title: "", notes: "" });
    setTachoForm({ source_type: "Vehicle Unit", reference: "", last_download: d, frequency_days: 90 });
    setHolForm({ name: "", from_date: d, to_date: d, notes: "" });
    setRemForm({ date: d, title: "", notes: "", email: false, days_before: 0 });
    setDlForm({ driver_id: "", date: d });
    setTrForm({ driver_name: "", course_name: "", category: "Driver CPC", completed_date: d, expiry_date: "", provider: "", hours: "" });
    setEvtOpen(true);
  };

  const pickAdd = (item) => {
    setChooserOpen(false);
    if (item.kind === "maint") { setMaintInitial(item.key); setMaintOpen(true); return; }
    startMode(item.key);
  };

  const openEditEvent = (ev) => {
    setEvtEditId(ev.id);
    if (ev.type === "reminder") {
      setEvtMode("reminder");
      setRemForm({ date: ev.date, title: ev.title, notes: ev.subtitle || "", email: !!ev.remind_email, days_before: ev.remind_days_before || 0 });
    } else {
      setEvtMode("event");
      setEvtForm({ date: ev.date, title: ev.title, notes: ev.subtitle || "" });
    }
    setEvtOpen(true);
  };

  const saveEvent = async (e) => {
    e.preventDefault();
    try {
      if (evtMode === "tacho") {
        if (!tachoForm.reference) { toast.error("Select a vehicle or driver"); return; }
        await api.post("/tacho", { ...tachoForm, frequency_days: Number(tachoForm.frequency_days) });
        toast.success("Tacho download logged — next due added to calendar");
      } else if (evtMode === "holiday") {
        if (!holForm.name) { toast.error("Enter who the holiday is for"); return; }
        if (!holForm.from_date || !holForm.to_date) { toast.error("Enter from and to dates"); return; }
        await api.post("/holidays", holForm);
        toast.success("Holiday added across the date range");
      } else if (evtMode === "reminder") {
        if (!remForm.title) { toast.error("Enter a reminder title"); return; }
        const payload = { date: remForm.date, title: remForm.title, notes: remForm.notes, status: "due_soon", reminder: true, remind_email: remForm.email, remind_days_before: Number(remForm.days_before) || 0 };
        if (evtEditId) await api.put(`/calendar/events/${evtEditId}`, payload);
        else await api.post("/calendar/events", payload);
        toast.success(remForm.email ? "Reminder saved — we'll email you" : "Reminder added to calendar");
      } else if (evtMode === "driver_start" || evtMode === "driver_leave") {
        if (!dlForm.driver_id) { toast.error("Select a driver"); return; }
        const payload = evtMode === "driver_start" ? { start_date: dlForm.date } : { leave_date: dlForm.date };
        await api.put(`/drivers/${dlForm.driver_id}/lifecycle`, payload);
        toast.success(evtMode === "driver_start" ? "Driver start date saved to their record" : "Driver leaving date saved to their record");
      } else if (evtMode === "training") {
        if (!trForm.course_name) { toast.error("Enter the training / course name"); return; }
        await api.post("/training", { ...trForm, hours: Number(trForm.hours) || 0, completed_date: trForm.completed_date || null, expiry_date: trForm.expiry_date || null, attachments: [] });
        toast.success("Training record added to Office › Training");
      } else {
        if (evtEditId) { await api.put(`/calendar/events/${evtEditId}`, evtForm); toast.success("Event updated"); }
        else { await api.post("/calendar/events", evtForm); toast.success("Event added to calendar"); }
      }
      setEvtOpen(false);
      loadEvents();
    } catch { toast.error("Could not save"); }
  };

  const deleteEvent = async (id) => {
    try { await api.delete(`/calendar/events/${id}`); toast.success("Removed"); loadEvents(); }
    catch { toast.error("Could not remove"); }
  };
  const deleteHoliday = async (id) => {
    try { await api.delete(`/holidays/${id}`); toast.success("Holiday removed"); loadEvents(); }
    catch { toast.error("Could not remove holiday"); }
  };

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const eventsForDay = (day) => events.filter((e) => {
    try { return isSameDay(parseISO(e.date), day); } catch { return false; }
  });

  const selectedEvents = eventsForDay(selected);
  const openDay = (day) => { setSelected(day); setDayOpen(true); };

  const renderEvent = (e, i) => {
    const M = TYPE_META[e.type] || TYPE_META.custom;
    const editable = e.type === "custom" || e.type === "reminder";
    const link = !editable ? EVENT_LINK[e.type] : null;
    return (
      <div key={`${e.date}-${e.type}-${e.title}-${i}`} className="flex items-start gap-3 border border-slate-100 rounded-md p-3">
        <M.icon size={16} className="text-slate-500 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{e.title}</p>
          <p className="text-xs text-slate-500">{e.subtitle}</p>
          {link && (
            <button
              data-testid="calendar-view-record-button"
              onClick={() => navigate(link)}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              View / edit record <ArrowRight size={12} />
            </button>
          )}
        </div>
        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0", pillColor(e.status))}>{M.label}</span>
        {editable && e.id && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button data-testid="edit-event-button" onClick={() => openEditEvent(e)} className="text-slate-300 hover:text-slate-900"><Pencil size={14} /></button>
            <button data-testid="delete-event-button" onClick={() => deleteEvent(e.id)} className="text-slate-300 hover:text-red-600"><Trash2 size={14} /></button>
          </div>
        )}
        {e.type === "holiday" && e.id && (
          <button data-testid="delete-holiday-button" onClick={() => deleteHoliday(e.id)} className="text-slate-300 hover:text-red-600 shrink-0"><Trash2 size={14} /></button>
        )}
      </div>
    );
  };

  const isDriverMode = evtMode === "driver_start" || evtMode === "driver_leave";
  const btnLabel = evtMode === "tacho" ? "Log Tacho Download"
    : evtMode === "holiday" ? "Add Holiday"
    : evtMode === "reminder" ? (evtEditId ? "Save Reminder" : "Add Reminder")
    : isDriverMode ? "Save Date"
    : evtMode === "training" ? "Add Training"
    : evtEditId ? "Save Changes" : "Add Event";

  return (
    <div data-testid="calendar-page">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Compliance</p>
          <h1 className="font-heading text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mt-1">Calendar</h1>
          <p className="text-slate-500 text-sm mt-1">Everything with a date — inspections, drivers, training, reminders & more</p>
        </div>
        <div className="flex items-center gap-2">
          <Button data-testid="cal-prev" variant="outline" size="icon" className="border-slate-300" onClick={() => setCursor(subMonths(cursor, 1))}><ChevronLeft size={18} /></Button>
          <span data-testid="cal-month-label" className="font-heading font-bold text-lg tracking-tight w-40 text-center">{format(cursor, "MMMM yyyy")}</span>
          <Button data-testid="cal-next" variant="outline" size="icon" className="border-slate-300" onClick={() => setCursor(addMonths(cursor, 1))}><ChevronRight size={18} /></Button>
          <Button data-testid="cal-today" variant="outline" className="border-slate-300 ml-2" onClick={() => { setCursor(new Date()); setSelected(new Date()); }}>Today</Button>
          <Button data-testid="cal-add-event" className="bg-black hover:bg-slate-800 rounded-md gap-2 ml-1" onClick={openChooser}><Plus size={16} /> Add Event</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Grid */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-md overflow-hidden animate-in-up">
          <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-2.5 text-center text-xs uppercase tracking-wider text-slate-500 font-semibold">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const evs = eventsForDay(day);
              const inMonth = isSameMonth(day, cursor);
              const isSel = isSameDay(day, selected);
              return (
                <button
                  key={day.toISOString()}
                  data-testid="calendar-day"
                  onClick={() => openDay(day)}
                  className={cn(
                    "min-h-[120px] border-b border-r border-slate-100 p-1.5 text-left align-top transition-colors relative",
                    !inMonth && "bg-slate-50/60 text-slate-300",
                    isSel && "ring-2 ring-inset ring-black",
                    "hover:bg-slate-50"
                  )}
                >
                  <span className={cn(
                    "inline-flex items-center justify-center w-6 h-6 text-xs font-semibold rounded-full",
                    isToday(day) ? "bg-black text-white" : inMonth ? "text-slate-700" : "text-slate-300"
                  )}>{format(day, "d")}</span>
                  <div className="mt-1 space-y-0.5">
                    {evs.slice(0, 4).map((e, i) => (
                      <div key={`${e.date}-${e.type}-${e.title}-${i}`} className="flex items-center gap-1 truncate">
                        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColor(e.status))} />
                        <span className="text-[10px] text-slate-600 truncate">{e.title}</span>
                      </div>
                    ))}
                    {evs.length > 4 && <span className="text-[10px] text-slate-400">+{evs.length - 4} more</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Day detail */}
        <div className="bg-white border border-slate-200 rounded-md p-4 animate-in-up" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <CalendarDays size={16} className="text-slate-900 shrink-0" />
              <h3 className="font-heading font-bold text-base tracking-tight truncate">{format(selected, "EEE d")}</h3>
            </div>
            <Button data-testid="day-add-event" size="sm" variant="outline" className="border-slate-300 rounded-md gap-1.5 h-8" onClick={openChooser}><Plus size={14} /> Add</Button>
          </div>
          <p className="text-xs text-slate-400 mb-4">{selectedEvents.length} event{selectedEvents.length !== 1 && "s"}{selectedEvents.length > 0 && " · click a day to enlarge"}</p>
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">Nothing scheduled for this day.</p>
          ) : (
            <div className="space-y-3" data-testid="day-events">
              {selectedEvents.map(renderEvent)}
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-slate-100 space-y-2">
            <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">Legend</p>
            <Legend color="bg-red-500" label="Overdue / safety-critical" />
            <Legend color="bg-yellow-500" label="Due soon / logged defect" />
            <Legend color="bg-green-500" label="Completed / on track" />
          </div>
        </div>
      </div>

      {/* Enlarged day view */}
      <Dialog open={dayOpen} onOpenChange={setDayOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2"><CalendarDays size={18} /> {format(selected, "EEEE d MMMM yyyy")}</DialogTitle>
            <DialogDescription>{selectedEvents.length} event{selectedEvents.length !== 1 && "s"} scheduled for this day</DialogDescription>
          </DialogHeader>
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">Nothing scheduled for this day.</p>
          ) : (
            <div className="space-y-3" data-testid="day-dialog-events">
              {selectedEvents.map(renderEvent)}
            </div>
          )}
          <DialogFooter>
            <Button data-testid="day-dialog-add" variant="outline" className="border-slate-300 rounded-md gap-1.5" onClick={() => { setDayOpen(false); openChooser(); }}><Plus size={14} /> Add for this day</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add-anything chooser */}
      <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Add to {format(selected, "EEE d MMM")}</DialogTitle>
            <DialogDescription>Pick anything — it saves to the right place and shows on the calendar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5" data-testid="add-event-chooser">
            {ADD_GROUPS.map((g) => (
              <div key={g.group}>
                <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">{g.group}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {g.items.map((it) => (
                    <button
                      key={it.key}
                      type="button"
                      data-testid={`add-choice-${it.key}`}
                      onClick={() => pickAdd(it)}
                      className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:border-slate-900 hover:bg-slate-50 transition-colors"
                    >
                      <it.icon size={16} className="text-slate-500 shrink-0" />
                      <span className="truncate">{it.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Event / reminder / driver / training / tacho / holiday form */}
      <Dialog open={evtOpen} onOpenChange={setEvtOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">{evtEditId ? (evtMode === "reminder" ? "Edit reminder" : "Edit event") : (MODE_TITLE[evtMode] || "Add to calendar")}</DialogTitle>
            <DialogDescription className="sr-only">Add or edit a calendar item</DialogDescription>
          </DialogHeader>

          <form onSubmit={saveEvent} className="space-y-4">
            {evtMode === "event" && (
              <>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Date</label>
                  <Input data-testid="event-date" type="date" required value={evtForm.date} onChange={(e) => setEvtForm({ ...evtForm, date: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Title</label>
                  <Input data-testid="event-title" required value={evtForm.title} onChange={(e) => setEvtForm({ ...evtForm, title: e.target.value })} placeholder="e.g. Tacho analysis meeting" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Notes</label>
                  <Textarea data-testid="event-notes" rows={2} value={evtForm.notes} onChange={(e) => setEvtForm({ ...evtForm, notes: e.target.value })} />
                </div>
              </>
            )}

            {evtMode === "reminder" && (
              <>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Reminder date</label>
                  <Input data-testid="reminder-date" type="date" required value={remForm.date} onChange={(e) => setRemForm({ ...remForm, date: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">What's the reminder?</label>
                  <Input data-testid="reminder-title" required value={remForm.title} onChange={(e) => setRemForm({ ...remForm, title: e.target.value })} placeholder="e.g. Call insurer about renewal" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Notes</label>
                  <Textarea data-testid="reminder-notes" rows={2} value={remForm.notes} onChange={(e) => setRemForm({ ...remForm, notes: e.target.value })} />
                </div>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input data-testid="reminder-email" type="checkbox" checked={remForm.email} onChange={(e) => setRemForm({ ...remForm, email: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                  Email me this reminder
                </label>
                {remForm.email && (
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Remind me this many days before</label>
                    <Input data-testid="reminder-days-before" type="number" min="0" value={remForm.days_before} onChange={(e) => setRemForm({ ...remForm, days_before: e.target.value })} />
                    <p className="text-xs text-slate-400 mt-1">0 = email on the day. We email at 07:00 (test mode delivers to the account owner).</p>
                  </div>
                )}
              </>
            )}

            {evtMode === "tacho" && (
              <>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Download type</label>
                  <Select value={tachoForm.source_type} onValueChange={(v) => setTachoForm({ ...tachoForm, source_type: v, reference: "", frequency_days: v === "Driver Card" ? 28 : 90 })}>
                    <SelectTrigger data-testid="tacho-source"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Vehicle Unit">Vehicle Unit (truck)</SelectItem>
                      <SelectItem value="Driver Card">Driver Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">{tachoForm.source_type === "Driver Card" ? "Driver" : "Vehicle / trailer"}</label>
                  <Select value={tachoForm.reference} onValueChange={(v) => setTachoForm({ ...tachoForm, reference: v })}>
                    <SelectTrigger data-testid="tacho-reference"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {(tachoForm.source_type === "Driver Card" ? driverNames : vehicleRegs).map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Download date</label>
                    <Input data-testid="tacho-date" type="date" value={tachoForm.last_download} onChange={(e) => setTachoForm({ ...tachoForm, last_download: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Next due in (days)</label>
                    <Input data-testid="tacho-freq" type="number" min="1" value={tachoForm.frequency_days} onChange={(e) => setTachoForm({ ...tachoForm, frequency_days: e.target.value })} />
                  </div>
                </div>
                <p className="text-xs text-slate-400">Logs the download and schedules the next due date on the calendar & Tacho Portal.</p>
              </>
            )}

            {evtMode === "holiday" && (
              <>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Who is it for?</label>
                  <Select value={holForm.name} onValueChange={(v) => setHolForm({ ...holForm, name: v })}>
                    <SelectTrigger data-testid="holiday-name"><SelectValue placeholder="Select driver or type below" /></SelectTrigger>
                    <SelectContent>{driverNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input data-testid="holiday-name-input" className="mt-2" value={holForm.name} onChange={(e) => setHolForm({ ...holForm, name: e.target.value })} placeholder="…or type a name / reason (e.g. John Smith, Office closed)" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">From</label>
                    <Input data-testid="holiday-from" type="date" required value={holForm.from_date} onChange={(e) => setHolForm({ ...holForm, from_date: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">To</label>
                    <Input data-testid="holiday-to" type="date" required value={holForm.to_date} onChange={(e) => setHolForm({ ...holForm, to_date: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Notes</label>
                  <Input data-testid="holiday-notes" value={holForm.notes} onChange={(e) => setHolForm({ ...holForm, notes: e.target.value })} placeholder="Optional" />
                </div>
                <p className="text-xs text-slate-400">Adds the holiday to every day between the two dates automatically.</p>
              </>
            )}

            {isDriverMode && (
              <>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Driver *</label>
                  <Select value={dlForm.driver_id} onValueChange={(v) => setDlForm({ ...dlForm, driver_id: v })}>
                    <SelectTrigger data-testid="driver-lifecycle-select"><SelectValue placeholder={drivers.length ? "Select driver" : "Add a driver first"} /></SelectTrigger>
                    <SelectContent>{drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">{evtMode === "driver_start" ? "Start date" : "Leaving date"}</label>
                  <Input data-testid="driver-lifecycle-date" type="date" required value={dlForm.date} onChange={(e) => setDlForm({ ...dlForm, date: e.target.value })} />
                </div>
                <p className="text-xs text-slate-400">Saved onto the driver's record (also visible on the Drivers page) and shown here on the calendar.</p>
              </>
            )}

            {evtMode === "training" && (
              <>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Driver</label>
                  <Select value={trForm.driver_name} onValueChange={(v) => setTrForm({ ...trForm, driver_name: v })}>
                    <SelectTrigger data-testid="training-driver"><SelectValue placeholder={driverNames.length ? "Select driver" : "Add a driver first"} /></SelectTrigger>
                    <SelectContent>{driverNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Course / training *</label>
                  <Input data-testid="training-course" required value={trForm.course_name} onChange={(e) => setTrForm({ ...trForm, course_name: e.target.value })} placeholder="e.g. Driver CPC Module 3" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Category</label>
                    <Select value={trForm.category} onValueChange={(v) => setTrForm({ ...trForm, category: v })}>
                      <SelectTrigger data-testid="training-category"><SelectValue /></SelectTrigger>
                      <SelectContent>{["Driver CPC", "Induction", "Toolbox Talk", "Health & Safety", "Licence Acquisition", "Other"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Hours</label>
                    <Input data-testid="training-hours" type="number" min="0" step="0.5" value={trForm.hours} onChange={(e) => setTrForm({ ...trForm, hours: e.target.value })} placeholder="e.g. 7" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Completed date</label>
                    <Input data-testid="training-completed" type="date" value={trForm.completed_date} onChange={(e) => setTrForm({ ...trForm, completed_date: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Expiry (optional)</label>
                    <Input data-testid="training-expiry" type="date" value={trForm.expiry_date} onChange={(e) => setTrForm({ ...trForm, expiry_date: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Provider</label>
                  <Input data-testid="training-provider" value={trForm.provider} onChange={(e) => setTrForm({ ...trForm, provider: e.target.value })} placeholder="Training company" />
                </div>
                <p className="text-xs text-slate-400">Saved to Office › Training. The completed & expiry dates both appear on the calendar.</p>
              </>
            )}

            <DialogFooter><Button data-testid="save-event-button" type="submit" className="bg-black hover:bg-slate-800">{btnLabel}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <MaintenanceQuickAdd
        open={maintOpen}
        onOpenChange={setMaintOpen}
        defaultDate={format(selected, "yyyy-MM-dd")}
        assets={assets}
        initialType={maintInitial}
        onSaved={loadEvents}
      />
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <span className={cn("w-2.5 h-2.5 rounded-full", color)} /> {label}
    </div>
  );
}
