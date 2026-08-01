import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Handshake, Trash2, Pencil, Paperclip, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import { Field, Empty } from "@/pages/Vehicles";
import { FileUpload } from "@/components/FileUpload";

const PROVIDER_TYPES = ["Garage / Workshop", "PMI / Safety inspector", "Tyre supplier", "Tacho calibration", "Brake test (RBT) centre", "Recovery / Breakdown", "Parts supplier", "MOT / Test station", "Other"];
const empty = { name: "", provider_type: "Garage / Workshop", contact_name: "", phone: "", email: "", address: "", services: "", contract_start: "", contract_end: "", notes: "", attachments: [] };

export function MaintenanceProvidersPanel() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);

  const load = async () => { const { data } = await api.get("/maintenance-providers"); setItems(data); };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => { setForm(empty); setEditId(null); setOpen(true); };
  const openEdit = (p) => {
    setForm({ ...empty, ...p, contract_start: p.contract_start || "", contract_end: p.contract_end || "", attachments: p.attachments || [] });
    setEditId(p.id); setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Enter a provider name");
    const payload = { ...form, contract_start: form.contract_start || null, contract_end: form.contract_end || null };
    try {
      if (editId) await api.put(`/maintenance-providers/${editId}`, payload);
      else await api.post("/maintenance-providers", payload);
      toast.success(editId ? "Provider updated" : "Provider added");
      setOpen(false); load();
    } catch { toast.error("Could not save provider"); }
  };
  const remove = async (id) => { await api.delete(`/maintenance-providers/${id}`); toast.success("Provider removed"); load(); };

  return (
    <div data-testid="providers-page">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <p className="text-sm text-slate-500">Keep your maintenance contractors on record — garages, inspectors, tyre &amp; tacho providers — and store their signed contracts / service agreements.</p>
        <Button data-testid="add-provider-button" onClick={openNew} className="bg-black hover:bg-slate-800 rounded-md gap-2 shrink-0"><Handshake size={16} /> Add Provider</Button>
      </div>

      {items.length === 0 ? (
        <Empty icon={Handshake} text="No maintenance providers added yet. Add your garages, PMI inspectors and suppliers, and upload their signed contracts." />
      ) : (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden overflow-x-auto animate-in-up">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr className="text-xs uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-semibold">Provider</th>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">Contact</th>
                <th className="px-5 py-3 font-semibold">Contract</th>
                <th className="px-5 py-3 font-semibold">Contracts</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((p) => (
                <tr key={p.id} data-testid="provider-row" className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="font-bold text-slate-900">{p.name}</div>
                    {p.services && <div className="text-xs text-slate-400 line-clamp-1 max-w-xs">{p.services}</div>}
                  </td>
                  <td className="px-5 py-3"><span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{p.provider_type}</span></td>
                  <td className="px-5 py-3 text-slate-600">
                    {p.contact_name && <div className="font-medium text-slate-700">{p.contact_name}</div>}
                    {p.phone && <div className="text-xs text-slate-500 flex items-center gap-1"><Phone size={11} /> {p.phone}</div>}
                    {p.email && <div className="text-xs text-slate-500 flex items-center gap-1"><Mail size={11} /> {p.email}</div>}
                    {!p.contact_name && !p.phone && !p.email && "—"}
                  </td>
                  <td className="px-5 py-3 text-slate-600 whitespace-nowrap text-xs">
                    {p.contract_start || p.contract_end ? `${p.contract_start || "—"} → ${p.contract_end || "ongoing"}` : "—"}
                  </td>
                  <td className="px-5 py-3">
                    {(p.attachments || []).length > 0
                      ? <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><Paperclip size={12} /> {p.attachments.length} file(s)</span>
                      : <span className="text-xs text-amber-600">No contract</span>}
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button data-testid="edit-provider-button" onClick={() => openEdit(p)} className="text-slate-400 hover:text-slate-900 p-1.5"><Pencil size={16} /></button>
                    <button data-testid="delete-provider-button" onClick={() => remove(p.id)} className="text-slate-400 hover:text-red-600 p-1.5"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{editId ? "Edit Provider" : "Add Maintenance Provider"}</DialogTitle>
            <DialogDescription className="sr-only">Maintenance provider details form</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Provider name *"><Input data-testid="provider-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. ABC Commercials Ltd" /></Field>
              <Field label="Type">
                <Select value={form.provider_type} onValueChange={(v) => setForm({ ...form, provider_type: v })}>
                  <SelectTrigger data-testid="provider-type"><SelectValue /></SelectTrigger>
                  <SelectContent>{PROVIDER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contact name"><Input data-testid="provider-contact" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></Field>
              <Field label="Phone"><Input data-testid="provider-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email"><Input data-testid="provider-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Services provided"><Input data-testid="provider-services" value={form.services} onChange={(e) => setForm({ ...form, services: e.target.value })} placeholder="e.g. PMI, servicing, MOT prep" /></Field>
            </div>
            <Field label="Address"><Textarea data-testid="provider-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Provider address" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contract start"><Input data-testid="provider-contract-start" type="date" value={form.contract_start} onChange={(e) => setForm({ ...form, contract_start: e.target.value })} /></Field>
              <Field label="Contract end / review"><Input data-testid="provider-contract-end" type="date" value={form.contract_end} onChange={(e) => setForm({ ...form, contract_end: e.target.value })} /></Field>
            </div>
            <Field label="Notes"><Textarea data-testid="provider-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></Field>
            <div>
              <p className="text-sm font-medium text-slate-700 mb-1.5">Signed contracts / service agreements</p>
              <FileUpload testid="provider-files" label="Upload signed contract (PDF or scan)" attachments={form.attachments} onChange={(a) => setForm({ ...form, attachments: a })} />
            </div>
            <DialogFooter><Button data-testid="save-provider-button" type="submit" className="bg-black hover:bg-slate-800">{editId ? "Save Changes" : "Add Provider"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function MaintenanceProviders() { return <MaintenanceProvidersPanel />; }
