import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { getTerms } from "@/lib/terms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Pencil, Fuel as FuelIcon, Gauge, Leaf, PoundSterling } from "lucide-react";
import { toast } from "sonner";
import { Field, Empty } from "@/pages/Vehicles";

const empty = { vehicle_reg: "", fill_date: new Date().toISOString().slice(0, 10), diesel_litres: "", adblue_litres: "", cost: "", odometer: "", notes: "" };

export function FuelPanel() {
  const { user } = useAuth();
  const terms = getTerms(user?.region);
  const cur = user?.region === "IE" ? "€" : "£";
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ vehicles: [], totals: {} });
  const [assets, setAssets] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);

  const load = async () => {
    const [f, s, v, t] = await Promise.all([api.get("/fuel"), api.get("/fuel/summary"), api.get("/vehicles"), api.get("/trailers")]);
    setItems(f.data); setSummary(s.data);
    setAssets([...v.data.map((x) => x.registration), ...t.data.map((x) => x.registration)].filter(Boolean));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(empty); setEditId(null); setOpen(true); };
  const openEdit = (r) => { setForm({ ...empty, ...r, fill_date: r.fill_date || "" }); setEditId(r.id); setOpen(true); };
  const num = (v) => (v === "" || v == null ? 0 : Number(v));

  const save = async (e) => {
    e.preventDefault();
    if (!form.vehicle_reg) { toast.error("Select a vehicle"); return; }
    const payload = { ...form, diesel_litres: num(form.diesel_litres), adblue_litres: num(form.adblue_litres), cost: num(form.cost), odometer: num(form.odometer), fill_date: form.fill_date || null };
    try {
      if (editId) await api.put(`/fuel/${editId}`, payload);
      else await api.post("/fuel", payload);
      toast.success(editId ? "Fuel record updated" : "Fuel record added");
      setOpen(false); load();
    } catch { toast.error("Could not save fuel record"); }
  };
  const remove = async (id) => { await api.delete(`/fuel/${id}`); toast.success("Record removed"); load(); };

  const t = summary.totals || {};

  return (
    <div data-testid="fuel-page">
      <div className="flex justify-end mb-4">
        <Button data-testid="add-fuel-button" onClick={openNew} className="bg-black hover:bg-slate-800 rounded-md gap-2">Add Fuel Record</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6" data-testid="fuel-totals">
        <Stat icon={FuelIcon} label="Diesel used" value={`${t.diesel_litres || 0} L`} sub={`${t.adblue_litres || 0} L AdBlue`} />
        <Stat icon={Gauge} label="Fleet avg MPG" value={t.avg_mpg != null ? `${t.avg_mpg}` : "—"} sub={`${t.miles || 0} mi`} />
        <Stat icon={Leaf} label="CO₂ emitted" value={`${t.co2_tonnes || 0} t`} sub={`${t.co2_kg || 0} kg`} />
        <Stat icon={PoundSterling} label="Total spend" value={`${cur}${t.cost || 0}`} sub={t.fills ? `${t.fills} fills` : "—"} />
      </div>

      {summary.vehicles?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden mb-6" data-testid="fuel-league">
          <div className="px-5 py-3 border-b border-slate-100"><h3 className="font-heading font-bold text-sm tracking-tight">Per-vehicle efficiency ({terms.authority})</h3></div>
          <div className="divide-y divide-slate-100">
            {summary.vehicles.map((v) => (
              <div key={v.vehicle_reg} data-testid="fuel-vehicle-row" className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="font-semibold text-slate-800">{v.vehicle_reg}</span>
                <div className="flex items-center gap-5 text-slate-500 text-xs">
                  <span><b className="text-slate-800 text-sm">{v.avg_mpg ?? "—"}</b> mpg</span>
                  <span>{v.diesel_litres} L</span>
                  <span>{v.co2_kg} kg CO₂</span>
                  <span>{v.cost_per_mile != null ? `${cur}${v.cost_per_mile}/mi` : "—"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 ? <Empty icon={FuelIcon} text="No fuel records yet. Log diesel/AdBlue fills to track MPG and CO₂." /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((r) => (
            <div key={r.id} data-testid="fuel-card" className="bg-white border border-slate-200 rounded-md p-5 hover:-translate-y-1 hover:shadow-sm hover:border-slate-300 transition-all duration-200 animate-in-up">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-heading font-bold text-lg text-slate-900">{r.vehicle_reg}</h3>
                  <p className="text-xs text-slate-500">{r.fill_date || "—"}{r.odometer ? ` · ${r.odometer} mi` : ""}</p>
                </div>
                <div className="flex gap-1">
                  <button data-testid="edit-fuel-button" onClick={() => openEdit(r)} className="text-slate-400 hover:text-slate-900 p-1"><Pencil size={15} /></button>
                  <button data-testid="delete-fuel-button" onClick={() => remove(r.id)} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <KV label="Diesel" value={`${r.diesel_litres || 0} L`} />
                <KV label="AdBlue" value={`${r.adblue_litres || 0} L`} />
                <KV label="MPG" value={r.mpg != null ? `${r.mpg}` : "—"} strong />
                <KV label="CO₂" value={`${r.co2_kg || 0} kg`} />
                <KV label="Miles" value={r.miles != null ? `${r.miles}` : "—"} />
                <KV label="Cost" value={`${cur}${r.cost || 0}`} />
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{editId ? "Edit Fuel Record" : "Add Fuel Record"}</DialogTitle><DialogDescription>MPG is calculated from the miles between fills; CO₂ at 2.64 kg per litre of diesel.</DialogDescription></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <Field label="Vehicle *">
              <Select value={form.vehicle_reg} onValueChange={(v) => setForm({ ...form, vehicle_reg: v })}>
                <SelectTrigger data-testid="fuel-vehicle"><SelectValue placeholder={assets.length ? "Select vehicle" : "Add a vehicle first"} /></SelectTrigger>
                <SelectContent>{assets.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date"><Input data-testid="fuel-date" type="date" value={form.fill_date} onChange={(e) => setForm({ ...form, fill_date: e.target.value })} /></Field>
              <Field label="Odometer (miles)"><Input data-testid="fuel-odometer" type="number" step="1" value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value })} placeholder="e.g. 128400" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Diesel (litres)"><Input data-testid="fuel-diesel" type="number" step="0.01" value={form.diesel_litres} onChange={(e) => setForm({ ...form, diesel_litres: e.target.value })} /></Field>
              <Field label="AdBlue (litres)"><Input data-testid="fuel-adblue" type="number" step="0.01" value={form.adblue_litres} onChange={(e) => setForm({ ...form, adblue_litres: e.target.value })} /></Field>
            </div>
            <Field label={`Cost (${cur})`}><Input data-testid="fuel-cost" type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
            <Field label="Notes"><Input data-testid="fuel-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <DialogFooter><Button data-testid="save-fuel-button" type="submit" className="bg-black hover:bg-slate-800">{editId ? "Save Changes" : "Add Record"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md p-4 animate-in-up">
      <div className="flex items-center gap-1.5 text-slate-400 mb-1"><Icon size={14} /><span className="text-[10px] uppercase tracking-widest font-semibold">{label}</span></div>
      <p className="font-heading font-black text-2xl text-slate-900 tracking-tight">{value}</p>
      <p className="text-xs text-slate-400">{sub}</p>
    </div>
  );
}

function KV({ label, value, strong }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">{label}</p>
      <p className={strong ? "font-bold text-slate-900" : "text-slate-700"}>{value}</p>
    </div>
  );
}

export default function Fuel() {
  return <FuelPanel />;
}
