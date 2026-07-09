import { Folder, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

// Registration-number "folder" filter used across all Maintenance tabs.
// Renders an "All" pill plus one pill per distinct registration (with counts).
export function RegFolders({ items, field = "vehicle_reg", value, onChange, className = "" }) {
  const regs = [...new Set((items || []).map((i) => i[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (regs.length === 0) return null;
  const countFor = (r) => (items || []).filter((i) => i[field] === r).length;

  const Pill = ({ v, label, count, icon: Icon }) => (
    <button
      type="button"
      data-testid={`reg-folder-${v || "all"}`}
      onClick={() => onChange(v)}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors",
        value === v
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-900"
      )}
    >
      <Icon size={13} /> {label}
      <span className={cn("ml-0.5 rounded px-1", value === v ? "bg-white/20" : "bg-slate-100 text-slate-500")}>{count}</span>
    </button>
  );

  return (
    <div className={cn("flex flex-wrap gap-2 mb-5", className)} data-testid="reg-folders">
      <Pill v="" label="All vehicles" count={(items || []).length} icon={Layers} />
      {regs.map((r) => (
        <Pill key={r} v={r} label={r} count={countFor(r)} icon={Folder} />
      ))}
    </div>
  );
}
