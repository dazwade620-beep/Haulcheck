import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Truck, Users, FolderCheck, FileWarning, AlertTriangle, Sparkles, ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const scoreColor = (s) => (s >= 85 ? "text-green-600" : s >= 60 ? "text-yellow-600" : "text-red-600");
const scoreRing = (s) => (s >= 85 ? "#16A34A" : s >= 60 ? "#EAB308" : "#DC2626");

function Kpi({ icon: Icon, label, value, tone, testid, delay }) {
  return (
    <div data-testid={testid} className="bg-white border border-slate-200 rounded-md p-5 hover:-translate-y-1 hover:shadow-sm hover:border-slate-300 transition-all duration-200 animate-in-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.15em] text-slate-500 font-semibold">{label}</p>
        <Icon size={18} className="text-slate-400" />
      </div>
      <p className={cn("font-heading text-4xl font-black mt-3 tracking-tight", tone)}>{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [insight, setInsight] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const load = async () => {
    const res = await api.get("/dashboard");
    setData(res.data);
  };

  useEffect(() => { load(); }, []);

  const runAi = async () => {
    setAiBusy(true);
    try {
      const res = await api.post("/ai/risk-insight");
      setInsight(res.data.insight);
    } finally {
      setAiBusy(false);
    }
  };

  if (!data) return <div className="text-slate-400">Loading dashboard…</div>;
  const { counts, alerts, risk_score, risk_band } = data;
  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (risk_score / 100) * circumference;

  return (
    <div data-testid="dashboard-page">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Compliance Control Room</p>
          <h1 className="font-heading text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mt-1">Fleet Overview</h1>
        </div>
        <Button data-testid="ai-insight-button" onClick={runAi} disabled={aiBusy} className="bg-black hover:bg-slate-800 rounded-md gap-2">
          <Sparkles size={16} /> {aiBusy ? "Analysing…" : "AI Risk Briefing"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Risk score */}
        <div className="bg-slate-900 text-white rounded-md p-6 flex items-center gap-6 animate-in-up">
          <div className="relative w-32 h-32 shrink-0">
            <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="#334155" strokeWidth="10" />
              <circle cx="60" cy="60" r="52" fill="none" stroke={scoreRing(risk_score)} strokeWidth="10"
                strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease-out" }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span data-testid="risk-score-value" className="font-heading text-4xl font-black">{risk_score}</span>
              <span className="text-[10px] text-slate-400 uppercase tracking-widest">Score</span>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-semibold">Compliance Health</p>
            <p className="font-heading text-2xl font-bold mt-1">{risk_band}</p>
            <p className="text-sm text-slate-400 mt-2">{counts.expired} expired · {counts.due_soon} due soon</p>
          </div>
        </div>

        {/* AI insight */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-md p-6 animate-in-up" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={18} className="text-slate-900" />
            <h3 className="font-heading font-bold text-lg tracking-tight">AI Compliance Briefing</h3>
          </div>
          {insight ? (
            <p data-testid="ai-insight-text" className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">{insight}</p>
          ) : (
            <p className="text-slate-400 text-sm">Click <strong>AI Risk Briefing</strong> to generate a prioritised action plan for your operator licence based on current fleet data.</p>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi testid="kpi-vehicles" icon={Truck} label="Vehicles" value={counts.vehicles} tone="text-slate-900" delay={0} />
        <Kpi testid="kpi-drivers" icon={Users} label="Drivers" value={counts.drivers} tone="text-slate-900" delay={60} />
        <Kpi testid="kpi-documents" icon={FolderCheck} label="Documents" value={counts.documents} tone="text-slate-900" delay={120} />
        <Kpi testid="kpi-defects" icon={FileWarning} label="Open Defects" value={counts.open_defects} tone={counts.open_defects ? "text-red-600" : "text-slate-900"} delay={180} />
      </div>

      {/* Alerts feed */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden animate-in-up">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <AlertTriangle size={18} className="text-slate-900" />
          <h3 className="font-heading font-bold tracking-tight">Compliance Alerts</h3>
        </div>
        {alerts.length === 0 ? (
          <div className="p-10 text-center text-slate-500 flex flex-col items-center gap-2">
            <ShieldCheck size={32} className="text-green-500" />
            <p className="font-semibold text-slate-700">All clear</p>
            <p className="text-sm">No expired or upcoming compliance items.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {alerts.map((a, i) => (
              <div key={`${a.type}-${a.name}-${a.item}-${i}`} data-testid="alert-row" className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold w-20 shrink-0">{a.type}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 text-sm truncate">{a.name}</p>
                    <p className="text-xs text-slate-500">{a.item}{a.days != null && ` · ${a.days < 0 ? `${Math.abs(a.days)}d overdue` : `${a.days}d left`}`}</p>
                  </div>
                </div>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
