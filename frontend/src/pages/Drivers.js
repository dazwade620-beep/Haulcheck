import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Trash2, Pencil, Users, Clock, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { Header, Field, Empty } from "@/pages/Vehicles";

const empty = { name: "", licence_number: "", licence_expiry: "", cpc_expiry: "", tacho_card_expiry: "", weekly_hours: 0, max_weekly_hours: 56, notes: "" };

export default function Drivers() {
  const [items, setItems] = useState([]);
  const [training, setTraining] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);

  const load = async () => {
    const [d, t] = await Promise.all([api.get("/drivers"), api.get("/training")]);
    setItems(d.data); setTraining(t.data);
  };
  const driverTraining = (d) => training.filter((t) => (t.driver_id && t.driver_id === d.id) || t.driver_name === d.name);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(empty); setEditId(null); setOpen(true); };
  const openEdit = (d) => {
    setForm({ ...empty, ...d, licence_expiry: d.licence_expiry || "", cpc_expiry: d.cpc_expiry || "", tacho_card_expiry: d.tacho_card_expiry || "" });
    setEditId(d.id); setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    const payload = { ...form, weekly_hours: Number(form.weekly_hours), max_weekly_hours: Number(form.max_weekly_hours) };
    ["licence_expiry", "cpc_expiry", "tacho_card_expiry"].forEach((k) => { if (!payload[k]) payload[k] = null; });
    try {
      if (editId) await api.put(`/drivers/${editId}`, payload);
      else await api.post("/drivers", payload);
      toast.success(editId ? "Driver updated" : "Driver added");
      setOpen(false); load();
    } catch { toast.error("Could not save driver"); }
  };
  const remove = async (id) => { await api.delete(`/drivers/${id}`); toast.success("Driver removed"); load(); };

  return (
    <div data-testid="drivers-page">
      <Header title="Drivers" subtitle="Licence, CPC, tachograph card & weekly hours" onAdd={openNew} addTestId="add-driver-button" addLabel="Add Driver" />

      {items.length === 0 ? <Empty icon={Users} text="No drivers yet. Add drivers to track licences and hours." /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((d) => {
            const over = d.weekly_hours > d.max_weekly_hours;
            return (
              <div key={d.id} data-testid="driver-card" className="bg-white border border-slate-200 rounded-md p-5 hover:-translate-y-1 hover:shadow-sm hover:border-slate-300 transition-all duration-200 animate-in-up">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-heading font-bold text-lg text-slate-900">{d.name}</h3>
                    <p className="text-xs text-slate-500">{d.licence_number || "No licence no."}</p>
                  </div>
                  <div className="flex gap-1">
                    <button data-testid="edit-driver-button" onClick={() => openEdit(d)} className="text-slate-400 hover:text-slate-900 p-1"><Pencil size={15} /></button>
                    <button data-testid="delete-driver-button" onClick={() => remove(d.id)} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <Row label="Licence" status={d.licence_status} date={d.licence_expiry} />
                  <Row label="CPC" status={d.cpc_status} date={d.cpc_expiry} />
                  <Row label="Tacho Card" status={d.tacho_status} date={d.tacho_card_expiry} />
                </div>
                <div className={`mt-4 flex items-center justify-between rounded-md px-3 py-2 text-sm ${over ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600"}`}>
                  <span className="flex items-center gap-1.5"><Clock size={15} /> Weekly hours</span>
                  <span className="font-bold">{d.weekly_hours} / {d.max_weekly_hours}h</span>
                </div>
                {driverTraining(d).length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-3" data-testid="driver-training-list">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1.5 flex items-center gap-1"><GraduationCap size={12} /> Training</p>
                    <div className="space-y-1.5">
                      {driverTraining(d).map((t) => (
                        <div key={t.id} className="flex items-center justify-between text-xs gap-2">
                          <span className="text-slate-600 truncate">{t.course_name || t.category}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-slate-400">{t.expiry_date || "—"}</span>
                            <StatusBadge status={t.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-heading">{editId ? "Edit Driver" : "Add Driver"}</DialogTitle><DialogDescription className="sr-only">Driver details form</DialogDescription></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <Field label="Name *"><Input data-testid="drv-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Smith" /></Field>
            <Field label="Licence Number"><Input data-testid="drv-licence-no" value={form.licence_number} onChange={(e) => setForm({ ...form, licence_number: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Licence Expiry"><Input data-testid="drv-licence-exp" type="date" value={form.licence_expiry} onChange={(e) => setForm({ ...form, licence_expiry: e.target.value })} /></Field>
              <Field label="CPC Expiry"><Input data-testid="drv-cpc-exp" type="date" value={form.cpc_expiry} onChange={(e) => setForm({ ...form, cpc_expiry: e.target.value })} /></Field>
            </div>
            <Field label="Tacho Card Expiry"><Input data-testid="drv-tacho-exp" type="date" value={form.tacho_card_expiry} onChange={(e) => setForm({ ...form, tacho_card_expiry: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Weekly Hours"><Input data-testid="drv-hours" type="number" step="0.5" value={form.weekly_hours} onChange={(e) => setForm({ ...form, weekly_hours: e.target.value })} /></Field>
              <Field label="Max Weekly Hours"><Input data-testid="drv-max-hours" type="number" step="0.5" value={form.max_weekly_hours} onChange={(e) => setForm({ ...form, max_weekly_hours: e.target.value })} /></Field>
            </div>
            <DialogFooter><Button data-testid="save-driver-button" type="submit" className="bg-black hover:bg-slate-800">{editId ? "Save Changes" : "Add Driver"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, status, date }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">{date || "—"}</span>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}
