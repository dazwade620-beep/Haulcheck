import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Truck, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

const empty = { registration: "", make: "", model: "", type: "HGV", mot_due: "", service_due: "", tax_due: "", notes: "" };

export default function Vehicles() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);

  const load = async () => setItems((await api.get("/vehicles")).data);
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(empty); setEditId(null); setOpen(true); };
  const openEdit = (v) => {
    setForm({ ...empty, ...v, mot_due: v.mot_due || "", service_due: v.service_due || "", tax_due: v.tax_due || "" });
    setEditId(v.id); setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    const payload = { ...form };
    ["mot_due", "service_due", "tax_due"].forEach((k) => { if (!payload[k]) payload[k] = null; });
    try {
      if (editId) await api.put(`/vehicles/${editId}`, payload);
      else await api.post("/vehicles", payload);
      toast.success(editId ? "Vehicle updated" : "Vehicle added");
      setOpen(false); load();
    } catch (err) { toast.error("Could not save vehicle"); }
  };

  const remove = async (id) => { await api.delete(`/vehicles/${id}`); toast.success("Vehicle removed"); load(); };

  return (
    <div data-testid="vehicles-page">
      <Header title="Vehicles" subtitle="MOT, service & tax due-date tracking" onAdd={openNew} addTestId="add-vehicle-button" addLabel="Add Vehicle" />

      {items.length === 0 ? (
        <Empty icon={Truck} text="No vehicles yet. Add your first vehicle to start tracking." />
      ) : (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden overflow-x-auto animate-in-up">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr className="text-xs uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-semibold">Registration</th>
                <th className="px-5 py-3 font-semibold">Vehicle</th>
                <th className="px-5 py-3 font-semibold">MOT</th>
                <th className="px-5 py-3 font-semibold">Service</th>
                <th className="px-5 py-3 font-semibold">Tax</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((v) => (
                <tr key={v.id} data-testid="vehicle-row" className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-bold text-slate-900">{v.registration}</td>
                  <td className="px-5 py-3 text-slate-600">{[v.make, v.model].filter(Boolean).join(" ") || "—"} <span className="text-slate-400">({v.type})</span></td>
                  <td className="px-5 py-3"><div className="flex flex-col gap-1"><StatusBadge status={v.mot_status} /><span className="text-xs text-slate-400">{v.mot_due || "—"}</span></div></td>
                  <td className="px-5 py-3"><div className="flex flex-col gap-1"><StatusBadge status={v.service_status} /><span className="text-xs text-slate-400">{v.service_due || "—"}</span></div></td>
                  <td className="px-5 py-3"><div className="flex flex-col gap-1"><StatusBadge status={v.tax_status} /><span className="text-xs text-slate-400">{v.tax_due || "—"}</span></div></td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button data-testid="edit-vehicle-button" onClick={() => openEdit(v)} className="text-slate-400 hover:text-slate-900 p-1.5"><Pencil size={16} /></button>
                    <button data-testid="delete-vehicle-button" onClick={() => remove(v.id)} className="text-slate-400 hover:text-red-600 p-1.5"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-heading">{editId ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle><DialogDescription className="sr-only">Vehicle details form</DialogDescription></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <Field label="Registration *"><Input data-testid="veh-registration" required value={form.registration} onChange={(e) => setForm({ ...form, registration: e.target.value })} placeholder="AB12 CDE" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Make"><Input data-testid="veh-make" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} placeholder="DAF" /></Field>
              <Field label="Model"><Input data-testid="veh-model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="XF 480" /></Field>
            </div>
            <Field label="MOT Due"><Input data-testid="veh-mot" type="date" value={form.mot_due} onChange={(e) => setForm({ ...form, mot_due: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Service Due"><Input data-testid="veh-service" type="date" value={form.service_due} onChange={(e) => setForm({ ...form, service_due: e.target.value })} /></Field>
              <Field label="Tax Due"><Input data-testid="veh-tax" type="date" value={form.tax_due} onChange={(e) => setForm({ ...form, tax_due: e.target.value })} /></Field>
            </div>
            <DialogFooter><Button data-testid="save-vehicle-button" type="submit" className="bg-black hover:bg-slate-800">{editId ? "Save Changes" : "Add Vehicle"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function Header({ title, subtitle, onAdd, addTestId, addLabel }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Compliance</p>
        <h1 className="font-heading text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mt-1">{title}</h1>
        <p className="text-slate-500 text-sm mt-1">{subtitle}</p>
      </div>
      {onAdd && <Button data-testid={addTestId} onClick={onAdd} className="bg-black hover:bg-slate-800 rounded-md gap-2"><Plus size={16} /> {addLabel}</Button>}
    </div>
  );
}
export function Field({ label, children }) {
  return <div><Label className="mb-1.5 block">{label}</Label>{children}</div>;
}
export function Empty({ icon: Icon, text }) {
  return (
    <div className="bg-white border border-dashed border-slate-300 rounded-md p-14 text-center text-slate-500 flex flex-col items-center gap-3 animate-in-up">
      <Icon size={36} className="text-slate-300" />
      <p className="text-sm max-w-xs">{text}</p>
    </div>
  );
}
