import { useEffect, useState } from "react";
import api from "@/lib/api";
import { PoundSterling, Gauge, X, TrendingUp, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  LineChart, Line,
} from "recharts";

const COLORS = { job_cards: "#0f172a", service: "#0ea5e9", repairs: "#f59e0b" };

function CostTooltip({ active, payload, label, currency }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-slate-900 text-white rounded-md px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold mb-1">{label}</p>
      <p className="text-slate-300">Job cards: <span className="font-bold text-white">{currency}{p.job_cards.toFixed(2)}</span></p>
      <p className="text-slate-300">Service: <span className="font-bold text-white">{currency}{p.service.toFixed(2)}</span></p>
      <p className="text-slate-300">Repairs: <span className="font-bold text-white">{currency}{p.repairs.toFixed(2)}</span></p>
      <p className="text-slate-400 mt-1 border-t border-slate-700 pt-1">Total: <span className="font-bold text-white">{currency}{p.total.toFixed(2)}</span></p>
      {p.cost_per_mile != null && <p className="text-slate-300 mt-0.5">{currency}{p.cost_per_mile.toFixed(3)}/mile · {p.miles.toLocaleString()} mi</p>}
    </div>
  );
}

const monthLabel = (m) => {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("en-GB", { month: "short", year: "2-digit" });
};

export function MaintenanceCosts() {
  const [data, setData] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = () => {
    const qs = new URLSearchParams();
    if (from) qs.set("from_date", from);
    if (to) qs.set("to_date", to);
    const url = "/maintenance/costs" + (qs.toString() ? `?${qs}` : "");
    api.get(url).then((r) => setData(r.data)).catch(() => setData({ rows: [], totals: {}, currency: "£" }));
  };
  useEffect(() => { load(); }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.get("/maintenance/costs/monthly?months=12").then((r) => setMonthly(r.data)).catch(() => setMonthly({ rows: [], currency: "£" })); }, []);

  if (data === null) return null;
  const cur = data.currency || "£";
  const rows = (data.rows || []).slice(0, 12);
  const perMile = (data.rows || []).filter((r) => r.cost_per_mile != null).sort((a, b) => b.cost_per_mile - a.cost_per_mile).slice(0, 6);
  const avgCpm = data.totals?.avg_cost_per_mile;
  const monthlyRows = monthly?.rows || [];
  const monthlyHasData = monthlyRows.some((m) => m.total > 0);

  return (
    <div data-testid="maintenance-costs-card" className="bg-white border border-slate-200 rounded-md p-6 mb-6 animate-in-up">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-center gap-2">
          <PoundSterling size={18} className="text-slate-900" />
          <h3 className="font-heading font-bold text-lg tracking-tight">Maintenance Spend by Vehicle</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input data-testid="cost-from-date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[140px] text-xs" aria-label="From date" />
          <span className="text-slate-400 text-xs">to</span>
          <Input data-testid="cost-to-date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-[140px] text-xs" aria-label="To date" />
          {(from || to) && <button data-testid="cost-clear-dates" onClick={() => { setFrom(""); setTo(""); }} title="Clear dates" className="text-slate-400 hover:text-slate-900 p-1"><X size={15} /></button>}
          <span data-testid="maintenance-total" className="text-sm font-semibold text-slate-700 ml-1">Total {cur}{Number(data.totals?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>
      <p className="text-sm text-slate-400 mb-4">Job cards, servicing and repairs combined{(from || to) ? " for the selected period" : " — top vehicles by spend"}.</p>

      {monthlyHasData && (
        <div data-testid="monthly-trend" className="mb-6 border-b border-slate-100 pb-6">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={15} className="text-slate-500" />
            <h4 className="font-heading font-bold text-sm tracking-tight">Monthly spend — last 12 months</h4>
          </div>
          <div style={{ width: "100%", height: 200 }} data-testid="monthly-trend-chart">
            <ResponsiveContainer>
              <LineChart data={monthlyRows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${cur}${v}`} width={48} />
                <Tooltip formatter={(v) => [`${cur}${Number(v).toFixed(2)}`, "Spend"]} labelFormatter={monthLabel} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                <Line type="monotone" dataKey="total" stroke="#0f172a" strokeWidth={2.5} dot={{ r: 3, fill: "#0f172a" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div data-testid="maintenance-costs-empty" className="py-12 text-center text-slate-400 text-sm">
          No maintenance costs {(from || to) ? "in this period" : "logged yet"}. Job card, service and repair costs appear here automatically.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={perMile.length ? "lg:col-span-2" : "lg:col-span-3"}>
            <div style={{ width: "100%", height: Math.max(200, rows.length * 34 + 40) }} data-testid="maintenance-costs-chart">
              <ResponsiveContainer>
                <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap={8}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${cur}${v}`} />
                  <YAxis type="category" dataKey="vehicle_reg" width={92} tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CostTooltip currency={cur} />} cursor={{ fill: "#f8fafc" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="job_cards" name="Job cards" stackId="a" fill={COLORS.job_cards} />
                  <Bar dataKey="service" name="Service" stackId="a" fill={COLORS.service} />
                  <Bar dataKey="repairs" name="Repairs" stackId="a" fill={COLORS.repairs} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {perMile.length > 0 && (
            <div data-testid="cost-per-mile-panel" className="border border-slate-100 rounded-md p-4 bg-slate-50/60">
              <div className="flex items-center gap-2 mb-1">
                <Gauge size={16} className="text-slate-700" />
                <h4 className="font-heading font-bold text-sm tracking-tight">Cost per mile</h4>
              </div>
              <p className="text-[11px] text-slate-400 mb-3 leading-snug">Total spend ÷ miles covered (fuel odometer). {avgCpm ? `Fleet avg ${cur}${avgCpm.toFixed(2)}/mi.` : ""} Highest first.</p>
              <div className="space-y-2">
                {perMile.map((r) => (
                  <div key={r.vehicle_reg} data-testid="cost-per-mile-row" className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 border ${r.high_cost ? "bg-red-50 border-red-200" : "bg-white border-slate-100"}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate flex items-center gap-1.5">
                        {r.vehicle_reg}
                        {r.high_cost && <span data-testid="high-cost-badge" title="Cost per mile well above fleet average" className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full"><AlertTriangle size={9} /> High</span>}
                      </p>
                      <p className="text-[11px] text-slate-400">{r.miles.toLocaleString()} mi</p>
                    </div>
                    <span className={`font-heading font-black tabular-nums whitespace-nowrap ${r.high_cost ? "text-red-600" : "text-slate-900"}`}>{cur}{r.cost_per_mile.toFixed(2)}<span className="text-[10px] font-semibold text-slate-400">/mi</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
