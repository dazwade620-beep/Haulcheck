import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, FileWarning, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Header, Field, Empty } from "@/pages/Vehicles";

const empty = { vehicle_reg: "", reported_by: "", category: "General", severity: "minor", description: "" };
const SEVERITY = [["minor", "Minor"], ["major", "Major"], ["safety_critical", "Safety Critical"]];
const CATEGORY = ["General", "Brakes", "Tyres & Wheels", "Lights", "Steering", "Bodywork", "Load Security", "Other"];
const STATUS = [["open", "Open"], ["monitoring", "Monitoring"], ["resolved", "Resolved"]];

export default function Defects() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  const load = async () => setItems((await api.get("/defects")).data);
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/defects", form);
      toast.success("Defect logged & AI summary generated");
      setForm(empty); setOpen(false); load();
    } catch { toast.error("Could not log defect"); }
    finally { setBusy(false); }
  };
  const setStatus = async (id, status) => { await api.put(`/defects/${id}/status?status=${status}`); load(); };
  const remove = async (id) => { await api.delete(`/defects/${id}`); toast.success("Defect removed"); load(); };

  return (
    <div data-testid="defects-page">
      <Header title="Defect Reports" subtitle="Driver defect reporting with AI safety triage" onAdd={() => { setForm(empty); setOpen(true); }} addTestId="add-defect-button" addLabel="Report Defect" />

      {items.length === 0 ? <Empty icon={FileWarning} text="No defects reported. Drivers can log vehicle defects here." /> : (
        <div className="space-y-4">
          {items.map((d) => (
            <div key={d.id} data-testid="defect-card" className="bg-white border border-slate-200 rounded-md p-5 animate-in-up">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900">{d.vehicle_reg}</span>
                    <StatusBadge status={d.severity} />
                    <StatusBadge status={d.status} />
                    <span className="text-xs text-slate-400">{d.category}</span>
                  </div>
                  <p className="text-slate-700 text-sm mt-2">{d.description}</p>
                  {d.ai_summary && (
                    <div className="mt-3 flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-md p-3">
                      <Sparkles size={15} className="text-slate-900 mt-0.5 shrink-0" />
                      <p data-testid="defect-ai-summary" className="text-sm text-slate-600">{d.ai_summary}</p>
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-2">{d.reported_by && `Reported by ${d.reported_by} · `}{new Date(d.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Select value={d.status} onValueChange={(v) => setStatus(d.id, v)}>
                    <SelectTrigger data-testid="defect-status-select" className="w-36 h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                  <button data-testid="delete-defect-button" onClick={() => remove(d.id)} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-heading">Report a Defect</DialogTitle><DialogDescription className="sr-only">Defect report form</DialogDescription></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Vehicle Reg *"><Input data-testid="defect-reg" required value={form.vehicle_reg} onChange={(e) => setForm({ ...form, vehicle_reg: e.target.value })} placeholder="AB12 CDE" /></Field>
              <Field label="Reported By"><Input data-testid="defect-reporter" value={form.reported_by} onChange={(e) => setForm({ ...form, reported_by: e.target.value })} placeholder="Driver name" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category">
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger data-testid="defect-category-select"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORY.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Severity">
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                  <SelectTrigger data-testid="defect-severity-select"><SelectValue /></SelectTrigger>
                  <SelectContent>{SEVERITY.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Description *"><Textarea data-testid="defect-description" required rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe the defect in detail…" /></Field>
            <DialogFooter><Button data-testid="save-defect-button" type="submit" disabled={busy} className="bg-black hover:bg-slate-800 gap-2"><Sparkles size={15} /> {busy ? "Analysing…" : "Log & Summarise"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
