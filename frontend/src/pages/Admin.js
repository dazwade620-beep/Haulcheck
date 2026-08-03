import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Users, ShieldCheck, Ban, RotateCcw, MailCheck, MailWarning, Search, Globe, Truck, Eye, TrendingUp } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, CartesianGrid } from "recharts";
import { toast } from "sonner";

const relTime = (iso) => {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

const ROLE_LABEL = { manager: "Operator", viewer: "Viewer", staff: "Staff", driver: "Driver" };
const ACTIVITY = {
  active: { label: "Active", cls: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  idle: { label: "Idle", cls: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  dormant: { label: "Dormant", cls: "bg-red-100 text-red-700", dot: "bg-red-500" },
  never: { label: "Never", cls: "bg-slate-100 text-slate-500", dot: "bg-slate-400" },
};

function Stat({ label, value, tone = "text-slate-900", Icon }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md p-4 animate-in-up">
      <div className="flex items-center gap-2 text-slate-400">
        {Icon && <Icon size={15} />}
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className={`font-heading text-3xl font-black mt-1 ${tone}`}>{value}</p>
    </div>
  );
}

const fmtDay = (d) => {
  try { return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" }); }
  catch { return d; }
};

function SignupTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-slate-900 text-white rounded-md px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold">{fmtDay(p.date)}</p>
      <p className="text-slate-300">{p.count} new signup{p.count === 1 ? "" : "s"}</p>
    </div>
  );
}

function SignupTrend({ signups }) {
  if (!signups) return null;
  const daily = signups.daily || [];
  const hasData = daily.some((d) => d.count > 0);
  return (
    <div data-testid="admin-signup-trend" className="bg-white border border-slate-200 rounded-md p-6 mb-6 animate-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-slate-900" />
            <h3 className="font-heading font-bold text-lg tracking-tight">Signup Trend</h3>
          </div>
          <p className="text-sm text-slate-400 mt-0.5">New accounts registered over the last 30 days.</p>
        </div>
        <div className="flex gap-3">
          <div data-testid="signups-this-week" className="bg-slate-50 border border-slate-200 rounded-md px-4 py-2 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">This week</p>
            <p className="font-heading text-2xl font-black text-emerald-600 leading-tight">{signups.this_week ?? 0}</p>
          </div>
          <div data-testid="signups-this-month" className="bg-slate-50 border border-slate-200 rounded-md px-4 py-2 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">This month</p>
            <p className="font-heading text-2xl font-black text-slate-900 leading-tight">{signups.this_month ?? 0}</p>
          </div>
        </div>
      </div>
      {hasData ? (
        <div style={{ width: "100%", height: 180 }} data-testid="signup-chart">
          <ResponsiveContainer>
            <BarChart data={daily} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} minTickGap={28} />
              <Tooltip content={<SignupTooltip />} cursor={{ fill: "#f8fafc" }} />
              <Bar dataKey="count" fill="#0f172a" radius={[3, 3, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div data-testid="signup-chart-empty" className="py-10 text-center text-slate-400 text-sm">No new signups in the last 30 days yet.</div>
      )}
    </div>
  );
}

export default function Admin() {
  const { user, viewAs } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      setData(r.data);
    } catch (e) {
      toast.error(e.response?.status === 403 ? "Admin access only" : "Could not load users");
    }
  }, [q]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const setActive = async (u, active) => {
    try {
      await api.put(`/admin/users/${u.user_id}/active`, { active });
      toast.success(active ? `${u.name || u.email} reactivated` : `${u.name || u.email} suspended`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not update user");
    }
  };

  const handleViewAs = async (u) => {
    setBusy(u.user_id);
    try {
      await viewAs(u);
      toast.success(`Now viewing as ${u.name || u.email} (read-only)`);
      navigate("/dashboard");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not start view-as session");
    } finally {
      setBusy(null);
    }
  };

  const stats = data?.stats;
  const users = data?.users || [];

  return (
    <div data-testid="admin-page">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-amber-600 font-semibold flex items-center gap-1.5"><ShieldCheck size={13} /> Super Admin</p>
        <h1 className="font-heading text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mt-1">Registered Users</h1>
        <p className="text-slate-500 text-sm mt-1">Every account on HaulCheck. Suspend an account to sign them out immediately and block login until you re-enable it.</p>
      </div>

      {stats && <SignupTrend signups={stats.signups} />}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6" data-testid="admin-stats">
          <Stat label="Registered users" value={stats.total} Icon={Users} />
          <Stat label="Active (7d)" value={stats.active_7d ?? 0} tone="text-emerald-600" Icon={ShieldCheck} />
          <Stat label="Dormant (30d+)" value={stats.dormant_30d ?? 0} tone={stats.dormant_30d ? "text-red-600" : "text-slate-900"} Icon={Ban} />
          <Stat label="Unverified" value={stats.unverified} tone={stats.unverified ? "text-amber-600" : "text-slate-900"} Icon={MailWarning} />
        </div>
      )}

      {stats && (
        <div className="flex flex-wrap items-center gap-2 mb-6 text-xs text-slate-500">
          <Globe size={13} className="text-slate-400" />
          {["UK", "IE", "EU"].map((r) => (
            <span key={r} className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-full px-2.5 py-1 font-semibold">
              {r} · {stats.by_region?.[r] || 0}
            </span>
          ))}
          <span className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-full px-2.5 py-1 font-semibold">Account owners · {stats.owners}</span>
        </div>
      )}

      <div className="relative mb-4 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input data-testid="admin-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" className="pl-9" />
      </div>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">User</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 font-semibold">Region</th>
                <th className="px-5 py-3 font-semibold">Fleet</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Last active</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400" data-testid="admin-no-users">No users found.</td></tr>
              ) : users.map((u) => {
                const self = u.user_id === user?.user_id;
                const protectedAcct = self || u.is_admin;
                return (
                  <tr key={u.user_id} data-testid="admin-user-row" className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{u.name || "—"}</span>
                        {u.is_admin && <span className="text-[9px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Admin</span>}
                        {u.account_owner && <span className="text-[10px] text-slate-400">under {u.account_owner}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{ROLE_LABEL[u.role] || u.role}</td>
                    <td className="px-5 py-3 text-slate-600">{u.region}</td>
                    <td className="px-5 py-3" data-testid="admin-fleet-cell">
                      {u.role === "manager" || u.account_owner ? (
                        <span className="inline-flex items-center gap-1 text-slate-700"><Truck size={13} className="text-slate-400" /><span className="font-semibold">{u.fleet_size ?? 0}</span>{u.drivers ? <span className="text-slate-400 text-xs">· {u.drivers} drv</span> : null}</span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        {u.email_verified ? <MailCheck size={13} className="text-emerald-600" /> : <MailWarning size={13} className="text-amber-600" />}
                        {u.email}
                      </span>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap" data-testid="admin-activity-cell">
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-500 text-xs">{relTime(u.last_login_at)}</span>
                        <span className={`inline-flex items-center gap-1 w-fit text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${(ACTIVITY[u.activity] || ACTIVITY.never).cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${(ACTIVITY[u.activity] || ACTIVITY.never).dot}`} />
                          {(ACTIVITY[u.activity] || ACTIVITY.never).label}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {u.active === false
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full"><Ban size={12} /> Suspended</span>
                        : <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full"><ShieldCheck size={12} /> Active</span>}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        {u.role === "manager" && !u.account_owner && u.active !== false && !u.is_admin && !self && (
                          <Button data-testid="admin-view-as-button" variant="outline" size="sm" disabled={busy === u.user_id}
                            className="rounded-md gap-1.5 h-8 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                            onClick={() => handleViewAs(u)} title="View exactly what this operator sees (read-only)">
                            <Eye size={14} /> View as</Button>
                        )}
                        {u.active === false ? (
                          <Button data-testid="admin-reactivate-button" variant="outline" size="sm" className="rounded-md gap-1.5 h-8 text-emerald-700 hover:bg-emerald-50"
                            onClick={() => setActive(u, true)}><RotateCcw size={14} /> Reactivate</Button>
                        ) : (
                          <Button data-testid="admin-suspend-button" variant="outline" size="sm" disabled={protectedAcct}
                            className="rounded-md gap-1.5 h-8 text-red-600 hover:bg-red-50 disabled:opacity-40"
                            onClick={() => setActive(u, false)} title={protectedAcct ? "Admins can't be suspended" : "Suspend"}>
                            <Ban size={14} /> Suspend</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
