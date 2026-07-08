import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Pencil, ClipboardCheck, CheckCircle2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Header, Field, Empty } from "@/pages/Vehicles";

const emptySched = { vehicle_reg: "", frequency_weeks: 6, next_due: "", inspector: "", notes: "" };
const RESULTS = [["pass", "Pass"], ["advisory", "Advisory"], ["fail", "Fail"]];
const today = () => new Date().toISOString().slice(0, 10);

const resultBadge = { pass: "bg-green-100 text-green-700", advisory: "bg-yellow-100 text-yellow-800", fail: "bg-red-100 text-red-700" };

export function InspectionsPanel({ embedded = false }) {
  const [items, setItems] = useState([]);
  const [records, setRecords] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptySched);
  const [editId, setEditId] = useState(null);
  const [completeFor, setCompleteFor] = useState(null);
  const [cForm, setCForm] = useState({ inspection_date: today(), result: "pass", inspector: "", notes: "" });
  const [assets, setAssets] = useState([]);

  const load = async () => {
    const [p, r, v, t] = await Promise.all([api.get("/pmi"), api.get("/pmi/records"), api.get("/vehicles"), api.get("/trailers")]);
    setItems(p.data); setRecords(r.data);
    setAssets([...v.data.map((x) => x.registration), ...t.data.map((x) => x.trailer_number)]);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(emptySched); setEditId(null); setOpen(true); };
  const openEdit = (p) => { setForm({ ...emptySched, ...p, next_due: p.next_due || "" }); setEditId(p.id); setOpen(true); };

  const save = async (e) => {
    e.preventDefault();
    const payload = { ...form, frequency_weeks: Number(form.frequency_weeks), next_due: form.next_due || null };
    try {
      if (editId) await api.put(`/pmi/${editId}`, payload);
      else await api.post("/pmi", payload);
      toast.success(editId ? "Schedule updated" : "PMI schedule created");
      setOpen(false); load();
    } catch { toast.error("Could not save schedule"); }
  };
  const remove = async (id) => { await api.delete(`/pmi/${id}`); toast.success("Schedule removed"); load(); };

  const openComplete = (p) => { setCompleteFor(p); setCForm({ inspection_date: today(), result: "pass", inspector: p.inspector || "", notes: "" }); };
  const submitComplete = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/pmi/${completeFor.id}/complete`, cForm);
      toast.success("Inspection recorded · next due updated");
      setCompleteFor(null); load();
    } catch { toast.error("Could not record inspection"); }
  };

  return (
    <div data-testid="inspections-page">
      {!embedded && <Header title="PMI Inspections" subtitle="Recurring maintenance schedules & inspection records" onAdd={openNew} addTestId="add-pmi-button" addLabel="New Schedule" />}
      {embedded && (
        <div className="flex justify-end mb-4">
          <Button data-testid="add-pmi-button" onClick={openNew} className="bg-black hover:bg-slate-800 rounded-md gap-2">New Schedule</Button>
        </div>
      )}

      {items.length === 0 ? <Empty icon={ClipboardCheck} text="No PMI schedules yet. Add a recurring inspection schedule per vehicle." /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-10">
          {items.map((p) => (
            <div key={p.id} data-testid="pmi-card" className="bg-white border border-slate-200 rounded-md p-5 hover:-translate-y-1 hover:shadow-sm hover:border-slate-300 transition-all duration-200 animate-in-up">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Wrench size={16} className="text-slate-400" />
                    <h3 className="font-heading font-bold text-lg text-slate-900">{p.vehicle_reg}</h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">Every {p.frequency_weeks} weeks</p>
                </div>
                <div className="flex gap-1">
                  <button data-testid="edit-pmi-button" onClick={() => openEdit(p)} className="text-slate-400 hover:text-slate-900 p-1"><Pencil size={15} /></button>
                  <button data-testid="delete-pmi-button" onClick={() => remove(p.id)} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">Next inspection due</p>
                  <p className="text-sm font-semibold text-slate-700">{p.next_due || "—"}{p.days_left != null && <span className="text-slate-400 font-normal"> · {p.days_left < 0 ? `${Math.abs(p.days_left)}d overdue` : `${p.days_left}d`}</span>}</p>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <Button data-testid="complete-pmi-button" onClick={() => openComplete(p)} variant="outline" className="w-full mt-4 gap-2 border-slate-300">
                <CheckCircle2 size={15} /> Record Inspection
              </Button>
            </div>
          ))}
        </div>
      )}

      {records.length > 0 && (
        <div className="animate-in-up">
          <h3 className="font-heading font-bold text-lg tracking-tight text-slate-900 mb-3">Recent Inspections</h3>
          <div className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">
            {records.map((r) => (
              <div key={r.id} data-testid="pmi-record-row" className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{r.vehicle_reg}</p>
                  <p className="text-xs text-slate-500">{r.inspection_date}{r.inspector && ` · ${r.inspector}`}{r.notes && ` · ${r.notes}`}</p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${resultBadge[r.result] || resultBadge.pass}`}>{r.result?.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add / edit schedule */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-heading">{editId ? "Edit PMI Schedule" : "New PMI Schedule"}</DialogTitle><DialogDescription className="sr-only">PMI schedule form</DialogDescription></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <Field label="Vehicle *">
              <Select value={form.vehicle_reg} onValueChange={(v) => setForm({ ...form, vehicle_reg: v })}>
                <SelectTrigger data-testid="pmi-reg"><SelectValue placeholder={assets.length ? "Select vehicle / trailer" : "Add a vehicle first"} /></SelectTrigger>
                <SelectContent>{assets.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Frequency (weeks)"><Input data-testid="pmi-frequency" type="number" min="1" value={form.frequency_weeks} onChange={(e) => setForm({ ...form, frequency_weeks: e.target.value })} /></Field>
              <Field label="Next Due"><Input data-testid="pmi-next-due" type="date" value={form.next_due} onChange={(e) => setForm({ ...form, next_due: e.target.value })} /></Field>
            </div>
            <Field label="Default Inspector"><Input data-testid="pmi-inspector" value={form.inspector} onChange={(e) => setForm({ ...form, inspector: e.target.value })} placeholder="e.g. In-house / ABC Commercials" /></Field>
            <DialogFooter><Button data-testid="save-pmi-button" type="submit" className="bg-black hover:bg-slate-800">{editId ? "Save Changes" : "Create Schedule"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record inspection */}
      <Dialog open={!!completeFor} onOpenChange={(v) => !v && setCompleteFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-heading">Record PMI — {completeFor?.vehicle_reg}</DialogTitle><DialogDescription className="sr-only">Record completed inspection form</DialogDescription></DialogHeader>
          <form onSubmit={submitComplete} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Inspection Date *"><Input data-testid="complete-date" type="date" required value={cForm.inspection_date} onChange={(e) => setCForm({ ...cForm, inspection_date: e.target.value })} /></Field>
              <Field label="Result">
                <Select value={cForm.result} onValueChange={(v) => setCForm({ ...cForm, result: v })}>
                  <SelectTrigger data-testid="complete-result-select"><SelectValue /></SelectTrigger>
                  <SelectContent>{RESULTS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Inspector"><Input data-testid="complete-inspector" value={cForm.inspector} onChange={(e) => setCForm({ ...cForm, inspector: e.target.value })} /></Field>
            <Field label="Notes"><Textarea data-testid="complete-notes" rows={3} value={cForm.notes} onChange={(e) => setCForm({ ...cForm, notes: e.target.value })} placeholder="Advisories, work carried out…" /></Field>
            <DialogFooter><Button data-testid="submit-complete-button" type="submit" className="bg-black hover:bg-slate-800 gap-2"><CheckCircle2 size={15} /> Record & Reschedule</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Inspections() {
  return <InspectionsPanel />;
}
