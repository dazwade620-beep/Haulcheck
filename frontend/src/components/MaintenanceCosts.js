import { useEffect, useState } from "react";
import api from "@/lib/api";
import { PoundSterling } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
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
    </div>
  );
}

export function MaintenanceCosts() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/maintenance/costs").then((r) => setData(r.data)).catch(() => setData({ rows: [], totals: {}, currency: "£" }));
  }, []);

  if (data === null) return null;
  const cur = data.currency || "£";
  const rows = (data.rows || []).slice(0, 12);

  return (
    <div data-testid="maintenance-costs-card" className="bg-white border border-slate-200 rounded-md p-6 mb-6 animate-in-up">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-center gap-2">
          <PoundSterling size={18} className="text-slate-900" />
          <h3 className="font-heading font-bold text-lg tracking-tight">Maintenance Spend by Vehicle</h3>
        </div>
        <span data-testid="maintenance-total" className="text-sm font-semibold text-slate-700">Total {cur}{Number(data.totals?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <p className="text-sm text-slate-400 mb-4">Job cards, servicing and repairs combined — top vehicles by spend.</p>
      {rows.length === 0 ? (
        <div data-testid="maintenance-costs-empty" className="py-12 text-center text-slate-400 text-sm">
          No maintenance costs logged yet. Job card, service and repair costs appear here automatically.
        </div>
      ) : (
        <div style={{ width: "100%", height: Math.max(200, rows.length * 34 + 40) }} data-testid="maintenance-costs-chart">
          <ResponsiveContainer>
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap={8}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${cur}${v}`} />
              <YAxis type="category" dataKey="vehicle_reg" width={92} tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CostTooltip currency={cur} />} cursor={{ fill: "#f8fafc" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="job_cards" name="Job cards" stackId="a" fill={COLORS.job_cards} radius={[0, 0, 0, 0]} />
              <Bar dataKey="service" name="Service" stackId="a" fill={COLORS.service} />
              <Bar dataKey="repairs" name="Repairs" stackId="a" fill={COLORS.repairs} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
