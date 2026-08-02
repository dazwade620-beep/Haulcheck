import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Trash2, Pencil, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Field, Empty } from "@/pages/Vehicles";
import { FileUpload } from "@/components/FileUpload";

const STATUS = { open: { label: "Open", cls: "bg-amber-100 text-amber-700" }, in_progress: { label: "In progress", cls: "bg-blue-100 text-blue-700" }, completed: { label: "Completed", cls: "bg-green-100 text-green-700" } };
const empty = { vehicle_reg: "", date_raised: new Date().toISOString().slice(0, 10), status: "open", work_requested: "", work_carried_out: "", parts_used: "", labour_hours: 0, technician: "", cost: 0, odometer: 0, signed_off_by: "", notes: "", attachments: [] };

export function JobCardsPanel() {
  const [items, setItems] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);

  const load = async () => {
    const [j, v] = await Promise.all([api.get("/job-cards"), api.get("/vehicles")]);
    setItems(j.data); setVehicles(v.data);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => { setForm({ ...empty, vehicle_reg: vehicles[0]?.registration || "" }); setEditId(null); setOpen(true); };
  const openEdit = (j) => { setForm({ ...empty, ...j, date_raised: j.date_raised || "", attachments: j.attachments || [] }); setEditId(j.id); setOpen(true); };

  const save = async (e) => {
    e.preventDefault();
    if (!form.vehicle_reg) return toast.error("Select a vehicle");
    const payload = { ...form, date_raised: form.date_raised || null, labour_hours: Number(form.labour_hours) || 0, cost: Number(form.cost) || 0, odometer: Number(form.odometer) || 0 };
    try {
      if (editId) await api.put(`/job-cards/${editId}`, payload);
      else await api.post("/job-cards", payload);
      toast.success(editId ? "Job card updated" : "Job card created");
      setOpen(false); load();
    } catch { toast.error("Could not save job card"); }
  };
  const remove = async (id) => { await api.delete(`/job-cards/${id}`); toast.success("Job card deleted"); load(); };

  return (
    <div data-testid="job-cards-page">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <p className="text-sm text-slate-500">Raise and track workshop job cards — work requested, work carried out, parts, labour and sign-off.</p>
        <Button data-testid="add-job-card-button" onClick={openNew} className="bg-black hover:bg-slate-800 rounded-md gap-2 shrink-0"><ClipboardList size={16} /> New Job Card</Button>
      </div>

      {items.length === 0 ? (
        <Empty icon={ClipboardList} text="No job cards yet. Raise one to record workshop work against a vehicle." />
      ) : (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden overflow-x-auto animate-in-up">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr className="text-xs uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-semibold">Job #</th>
                <th className="px-5 py-3 font-semibold">Vehicle</th>
                <th className="px-5 py-3 font-semibold">Raised</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Technician</th>
                <th className="px-5 py-3 font-semibold">Cost</th>
                <th className="px-5 py-3 font-semibold">Files</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((j) => (
                <tr key={j.id} data-testid="job-card-row" className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-mono font-bold text-slate-900">{j.job_number}</td>
                  <td className="px-5 py-3 font-semibold text-slate-800">{j.vehicle_reg}</td>
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{j.date_raised || "—"}</td>
                  <td className="px-5 py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${(STATUS[j.status] || STATUS.open).cls}`}>{(STATUS[j.status] || STATUS.open).label}</span></td>
                  <td className="px-5 py-3 text-slate-600">{j.technician || "—"}</td>
                  <td className="px-5 py-3 text-slate-600">{j.cost ? `£${Number(j.cost).toFixed(2)}` : "—"}</td>
                  <td className="px-5 py-3">{(j.attachments || []).length > 0 ? <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><Paperclip size={12} /> {j.attachments.length}</span> : "—"}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button data-testid="edit-job-card-button" onClick={() => openEdit(j)} className="text-slate-400 hover:text-slate-900 p-1.5"><Pencil size={16} /></button>
                    <button data-testid="delete-job-card-button" onClick={() => remove(j.id)} className="text-slate-400 hover:text-red-600 p-1.5"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{editId ? `Edit Job Card ${form.job_number || ""}` : "New Job Card"}</DialogTitle>
            <DialogDescription className="sr-only">Job card form</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Vehicle *">
                <Select value={form.vehicle_reg} onValueChange={(v) => setForm({ ...form, vehicle_reg: v })}>
                  <SelectTrigger data-testid="jc-vehicle"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                  <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.registration}>{v.registration}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Date raised"><Input data-testid="jc-date" type="date" value={form.date_raised} onChange={(e) => setForm({ ...form, date_raised: e.target.value })} /></Field>
            </div>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger data-testid="jc-status"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUS).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Work requested"><Textarea data-testid="jc-requested" value={form.work_requested} onChange={(e) => setForm({ ...form, work_requested: e.target.value })} placeholder="Reported fault / work required" /></Field>
            <Field label="Work carried out"><Textarea data-testid="jc-carried-out" value={form.work_carried_out} onChange={(e) => setForm({ ...form, work_carried_out: e.target.value })} placeholder="What was done" /></Field>
            <Field label="Parts used"><Textarea data-testid="jc-parts" value={form.parts_used} onChange={(e) => setForm({ ...form, parts_used: e.target.value })} placeholder="Parts / materials" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Technician / mechanic"><Input data-testid="jc-technician" value={form.technician} onChange={(e) => setForm({ ...form, technician: e.target.value })} /></Field>
              <Field label="Labour hours"><Input data-testid="jc-hours" type="number" step="0.25" value={form.labour_hours} onChange={(e) => setForm({ ...form, labour_hours: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cost (£)"><Input data-testid="jc-cost" type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
              <Field label="Odometer"><Input data-testid="jc-odometer" type="number" value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value })} /></Field>
            </div>
            <Field label="Signed off by"><Input data-testid="jc-signoff" value={form.signed_off_by} onChange={(e) => setForm({ ...form, signed_off_by: e.target.value })} placeholder="Name of person signing off" /></Field>
            <Field label="Notes"><Textarea data-testid="jc-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></Field>
            <div>
              <p className="text-sm font-medium text-slate-700 mb-1.5">Attachments (photos, invoices)</p>
              <FileUpload testid="jc-files" label="Upload files" attachments={form.attachments} onChange={(a) => setForm({ ...form, attachments: a })} />
            </div>
            <DialogFooter><Button data-testid="save-job-card-button" type="submit" className="bg-black hover:bg-slate-800">{editId ? "Save Changes" : "Create Job Card"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function JobCards() { return <JobCardsPanel />; }
