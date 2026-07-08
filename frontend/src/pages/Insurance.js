import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Header, Field, Empty } from "@/pages/Vehicles";
import { FileUpload, AttachmentThumbs } from "@/components/FileUpload";

const TYPES = [
  "Goods in Transit (GIT)",
  "Motor — Truck",
  "Motor — Trailer",
  "Green Card",
  "Public Liability (PL)",
  "Employers' Liability (EL)",
  "Other",
];
const empty = { policy_type: "Motor — Truck", insurer: "", policy_number: "", start_date: "", expiry_date: "", cover_amount: "", notes: "", attachments: [] };

export default function Insurance() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);

  const load = async () => setItems((await api.get("/insurance")).data);
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(empty); setEditId(null); setOpen(true); };
  const openEdit = (p) => {
    setForm({ ...empty, ...p, start_date: p.start_date || "", expiry_date: p.expiry_date || "", attachments: p.attachments || [] });
    setEditId(p.id); setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    const payload = { ...form, start_date: form.start_date || null, expiry_date: form.expiry_date || null };
    try {
      if (editId) await api.put(`/insurance/${editId}`, payload);
      else await api.post("/insurance", payload);
      toast.success(editId ? "Policy updated" : "Policy added");
      setOpen(false); load();
    } catch { toast.error("Could not save policy"); }
  };
  const remove = async (id) => { await api.delete(`/insurance/${id}`); toast.success("Policy removed"); load(); };

  return (
    <div data-testid="insurance-page">
      <Header title="Insurance" subtitle="GIT, motor, green card, PL & EL policy tracking" onAdd={openNew} addTestId="add-insurance-button" addLabel="Add Policy" />

      {items.length === 0 ? <Empty icon={ShieldCheck} text="No insurance policies yet. Track GIT, motor, green card, public & employers' liability cover." /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((p) => (
            <div key={p.id} data-testid="insurance-card" className="bg-white border border-slate-200 rounded-md p-5 hover:-translate-y-1 hover:shadow-sm hover:border-slate-300 transition-all duration-200 animate-in-up">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">{p.policy_type}</p>
                  <h3 className="font-heading font-bold text-lg text-slate-900 truncate">{p.insurer || "Insurer TBC"}</h3>
                  {p.policy_number && <p className="text-xs text-slate-500 mt-0.5">Policy: {p.policy_number}</p>}
                  {p.cover_amount && <p className="text-xs text-slate-500">Cover: {p.cover_amount}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button data-testid="edit-insurance-button" onClick={() => openEdit(p)} className="text-slate-400 hover:text-slate-900 p-1"><Pencil size={15} /></button>
                  <button data-testid="delete-insurance-button" onClick={() => remove(p.id)} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">Renewal / expiry</p>
                  <p className="text-sm font-semibold text-slate-700">{p.expiry_date || "—"}{p.days_left != null && <span className="text-slate-400 font-normal"> · {p.days_left < 0 ? `${Math.abs(p.days_left)}d overdue` : `${p.days_left}d`}</span>}</p>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <AttachmentThumbs attachments={p.attachments} />
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{editId ? "Edit Policy" : "Add Insurance Policy"}</DialogTitle><DialogDescription className="sr-only">Insurance policy form</DialogDescription></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <Field label="Policy Type">
              <Select value={form.policy_type} onValueChange={(v) => setForm({ ...form, policy_type: v })}>
                <SelectTrigger data-testid="ins-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Insurer"><Input data-testid="ins-insurer" value={form.insurer} onChange={(e) => setForm({ ...form, insurer: e.target.value })} placeholder="e.g. Aviva" /></Field>
              <Field label="Policy Number"><Input data-testid="ins-number" value={form.policy_number} onChange={(e) => setForm({ ...form, policy_number: e.target.value })} placeholder="POL-123456" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Start Date"><Input data-testid="ins-start" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
              <Field label="Expiry / Renewal *"><Input data-testid="ins-expiry" type="date" required value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></Field>
            </div>
            <Field label="Cover Amount"><Input data-testid="ins-cover" value={form.cover_amount} onChange={(e) => setForm({ ...form, cover_amount: e.target.value })} placeholder="e.g. £250,000" /></Field>
            <Field label="Certificate / Schedule"><FileUpload testid="ins-upload" attachments={form.attachments} onChange={(a) => setForm({ ...form, attachments: a })} /></Field>
            <DialogFooter><Button data-testid="save-insurance-button" type="submit" className="bg-black hover:bg-slate-800">{editId ? "Save Changes" : "Add Policy"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
