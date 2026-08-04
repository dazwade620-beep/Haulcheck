import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Palmtree, AlertTriangle } from "lucide-react";

export function RosterStrip() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/roster/week").then((r) => setData(r.data)).catch(() => {}); }, []);
  if (!data) return null;
  return (
    <div data-testid="roster-strip" className="bg-white border border-slate-200 rounded-md p-5 mb-6 animate-in-up">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Palmtree size={18} className="text-slate-900" />
          <h3 className="font-heading font-bold text-lg tracking-tight">Who's off this week</h3>
        </div>
        <span className="text-xs text-slate-400">{data.total_off === 0 ? "Full roster — nobody booked off" : `${data.total_off} driver-day${data.total_off === 1 ? "" : "s"} booked off`}</span>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {data.days.map((d) => (
          <div
            key={d.date}
            data-testid="roster-day"
            className={`rounded-md border p-2.5 text-center transition-colors ${d.clash ? "border-amber-300 bg-amber-50" : d.is_today ? "border-slate-900" : "border-slate-200"}`}
          >
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{d.weekday}</p>
            <p className={`font-heading text-lg font-black leading-tight ${d.is_today ? "text-slate-900" : "text-slate-600"}`}>{d.day_num}</p>
            {d.count === 0 ? (
              <p className="text-[11px] text-slate-300 mt-1">—</p>
            ) : (
              <div className="mt-1 space-y-0.5" data-testid="roster-off-names">
                {d.off.slice(0, 3).map((n) => (
                  <p key={n} className="text-[10px] text-slate-600 truncate leading-tight" title={n}>{n}</p>
                ))}
                {d.off.length > 3 && <p className="text-[10px] text-slate-400">+{d.off.length - 3} more</p>}
              </div>
            )}
            {d.clash && (
              <div className="mt-1 flex items-center justify-center gap-0.5 text-[9px] font-bold text-amber-700">
                <AlertTriangle size={9} /> clash
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
