import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays, Wrench, CheckCircle2, FileWarning, GraduationCap, ShieldCheck } from "lucide-react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isToday, addMonths, subMonths, parseISO, isSameDay,
} from "date-fns";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TYPE_META = {
  pmi_due: { icon: Wrench, label: "PMI Due" },
  pmi_done: { icon: CheckCircle2, label: "PMI Completed" },
  defect: { icon: FileWarning, label: "Defect" },
  training: { icon: GraduationCap, label: "Training Expiry" },
  insurance: { icon: ShieldCheck, label: "Insurance Renewal" },
};

const dotColor = (status) => (status === "expired" ? "bg-red-500" : status === "due_soon" ? "bg-yellow-500" : "bg-green-500");
const pillColor = (status) => (status === "expired" ? "bg-red-100 text-red-700" : status === "due_soon" ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-700");

export default function Calendar() {
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(new Date());

  useEffect(() => { api.get("/calendar").then((r) => setEvents(r.data)); }, []);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const eventsForDay = (day) => events.filter((e) => {
    try { return isSameDay(parseISO(e.date), day); } catch { return false; }
  });

  const selectedEvents = eventsForDay(selected);

  return (
    <div data-testid="calendar-page">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Compliance</p>
          <h1 className="font-heading text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mt-1">Calendar</h1>
          <p className="text-slate-500 text-sm mt-1">PMI inspections & driver defect reports</p>
        </div>
        <div className="flex items-center gap-2">
          <Button data-testid="cal-prev" variant="outline" size="icon" className="border-slate-300" onClick={() => setCursor(subMonths(cursor, 1))}><ChevronLeft size={18} /></Button>
          <span data-testid="cal-month-label" className="font-heading font-bold text-lg tracking-tight w-40 text-center">{format(cursor, "MMMM yyyy")}</span>
          <Button data-testid="cal-next" variant="outline" size="icon" className="border-slate-300" onClick={() => setCursor(addMonths(cursor, 1))}><ChevronRight size={18} /></Button>
          <Button data-testid="cal-today" variant="outline" className="border-slate-300 ml-2" onClick={() => { setCursor(new Date()); setSelected(new Date()); }}>Today</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Grid */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-md overflow-hidden animate-in-up">
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
                  onClick={() => setSelected(day)}
                  className={cn(
                    "min-h-[84px] border-b border-r border-slate-100 p-1.5 text-left align-top transition-colors relative",
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
                    {evs.slice(0, 3).map((e, i) => (
                      <div key={`${e.date}-${e.type}-${e.title}-${i}`} className="flex items-center gap-1 truncate">
                        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColor(e.status))} />
                        <span className="text-[10px] text-slate-600 truncate">{e.title}</span>
                      </div>
                    ))}
                    {evs.length > 3 && <span className="text-[10px] text-slate-400">+{evs.length - 3} more</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Day detail */}
        <div className="bg-white border border-slate-200 rounded-md p-5 animate-in-up" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays size={18} className="text-slate-900" />
            <h3 className="font-heading font-bold text-lg tracking-tight">{format(selected, "EEEE d MMM")}</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">{selectedEvents.length} event{selectedEvents.length !== 1 && "s"}</p>
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">Nothing scheduled for this day.</p>
          ) : (
            <div className="space-y-3" data-testid="day-events">
              {selectedEvents.map((e, i) => {
                const M = TYPE_META[e.type] || TYPE_META.defect;
                return (
                  <div key={`${e.date}-${e.type}-${e.title}-${i}`} className="flex items-start gap-3 border border-slate-100 rounded-md p-3">
                    <M.icon size={16} className="text-slate-500 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">{e.title}</p>
                      <p className="text-xs text-slate-500">{e.subtitle}</p>
                    </div>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0", pillColor(e.status))}>{M.label}</span>
                  </div>
                );
              })}
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
