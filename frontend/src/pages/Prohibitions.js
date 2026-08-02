import { useEffect, useState } from "react";
import api from "@/lib/api";
import { downloadPdf } from "@/lib/download";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, Trash2, Pencil, Download, MapPin, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Field, Empty } from "@/pages/Vehicles";
import { FileUpload } from "@/components/FileUpload";

const today = () => new Date().toISOString().slice(0, 10);
const AUTHORITIES = ["DVSA", "RSA", "Police", "Other"];
const ENCOUNTERS = ["Roadside check", "Fleet check", "Targeted check", "Follow-up"];
const PROHIBITIONS = [
  { v: "immediate", l: "Immediate (PG9)" },
  { v: "delayed", l: "Delayed (PG9)" },
  { v: "S-marked", l: "S-marked (PG9S)" },
  { v: "none", l: "No prohibition / advisory" },
];
const CATEGORIES = ["Mechanical", "Overload", "Drivers hours", "Tacho", "Load security", "Other"];
const empty = {
  vehicle_reg: "", driver_name: "", encounter_date: today(), location: "", authority: "DVSA",
  encounter_type: "Roadside check", prohibition_type: "immediate", category: "Mechanical",
  reference: "", details: "", fixed_penalty: false, penalty_amount: 0, points: 0,
  status: "open", cleared_date: "", notes: "", attachments: [],
};

const PROHIB_LABEL = Object.fromEntries(PROHIBITIONS.map((p) => [p.v, p.l]));

export function ProhibitionsPanel() {
  const [items, setItems] = useState([]);
  const [assets, setAssets] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);

  const load = async () => {
    const [p, v, t, d] = await Promise.all([api.get("/prohibitions"), api.get("/vehicles"), api.get("/trailers"), api.get("/drivers")]);
    setItems(p.data);
    setAssets([...v.data.map((x) => x.registration), ...t.data.map((x) => x.trailer_number)].filter(Boolean));
    setDrivers(d.data.map((x) => x.name).filter(Boolean));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => { setForm(empty); setEditId(null); setOpen(true); };
  const openEdit = (p) => { setForm({ ...empty, ...p, encounter_date: p.encounter_date || "", cleared_date: p.cleared_date || "", attachments: p.attachments || [] }); setEditId(p.id); setOpen(true); };

  const save = async (e) => {
    e.preventDefault();
    if (!form.vehicle_reg) return toast.error("Select a vehicle");
    const payload = {
      ...form, encounter_date: form.encounter_date || null, cleared_date: form.cleared_date || null,
      penalty_amount: Number(form.penalty_amount) || 0, points: Number(form.points) || 0,
    };
    try {
      if (editId) await api.put(`/prohibitions/${editId}`, payload);
      else await api.post("/prohibitions", payload);
      toast.success(editId ? "Prohibition updated" : "Prohibition logged");
      setOpen(false); load();
    } catch { toast.error("Could not save prohibition"); }
  };
  const remove = async (id) => { await api.delete(`/prohibitions/${id}`); toast.success("Deleted"); load(); };

  const total = items.length;
  const openCount = items.filter((i) => i.status !== "cleared").length;
  const pg9 = items.filter((i) => (i.prohibition_type || "") !== "none").length;
  const penalties = items.reduce((s, i) => s + (i.fixed_penalty ? Number(i.penalty_amount) || 0 : 0), 0);

  return (
    <div data-testid="prohibitions-page">
      {items.length > 0 && (
        <div data-testid="prohibitions-summary" className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Stat label="Encounters logged" value={total} />
          <Stat label="Prohibitions (PG9)" value={pg9} tone={pg9 ? "text-red-600" : "text-slate-900"} />
          <Stat label="Outstanding" value={openCount} tone={openCount ? "text-red-600" : "text-green-700"} />
          <Stat label="Fixed penalties" value={`£${penalties.toFixed(0)}`} tone={penalties ? "text-amber-600" : "text-slate-900"} />
        </div>
      )}

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p className="text-sm text-slate-500">Log DVSA / RSA roadside stops, prohibitions (PG9) and follow-up clearance.</p>
        <div className="flex gap-2">
          {items.length > 0 && (
            <Button data-testid="prohibitions-report-button" variant="outline" onClick={() => downloadPdf("/reports/prohibitions", "prohibitions.pdf")} className="rounded-md gap-2"><Download size={16} /> Report</Button>
          )}
          <Button data-testid="add-prohibition-button" onClick={openNew} className="bg-black hover:bg-slate-800 rounded-md gap-2"><ShieldAlert size={16} /> Log Encounter</Button>
        </div>
      </div>

      {items.length === 0 ? (
        <Empty icon={ShieldAlert} text="No roadside encounters logged yet. Record any DVSA/RSA stop, prohibition (PG9) or fleet check here." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((p) => {
            const cleared = p.status === "cleared";
            const none = (p.prohibition_type || "") === "none";
            return (
              <div key={p.id} data-testid="prohibition-card" className="bg-white border border-slate-200 rounded-md p-5 animate-in-up flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-heading font-bold text-lg tracking-tight">{p.vehicle_reg}</h4>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${none ? "bg-slate-100 text-slate-600" : "bg-red-100 text-red-700"}`}>{PROHIB_LABEL[p.prohibition_type] || p.prohibition_type}</span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${cleared ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{cleared ? "Cleared" : "Open"}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{p.authority} · {p.encounter_type} · {p.encounter_date || "—"}{p.reference ? ` · ${p.reference}` : ""}</p>
                  </div>
                  <div className="flex items-center shrink-0">
                    <button data-testid="edit-prohibition-button" onClick={() => openEdit(p)} className="text-slate-400 hover:text-slate-900 p-1.5"><Pencil size={15} /></button>
                    <button data-testid="delete-prohibition-button" onClick={() => remove(p.id)} className="text-slate-400 hover:text-red-600 p-1.5"><Trash2 size={15} /></button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{p.category}</span>
                  {p.location && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {p.location}</span>}
                  {p.driver_name && <span>Driver: {p.driver_name}</span>}
                  {p.fixed_penalty && <span className="text-amber-600 font-semibold">Fixed penalty £{Number(p.penalty_amount || 0).toFixed(0)}{p.points ? ` · ${p.points} pts` : ""}</span>}
                </div>
                {p.details && <p className="text-sm text-slate-600 mt-2 whitespace-pre-line">{p.details}</p>}
                {cleared && p.cleared_date && <p className="text-xs text-green-700 mt-2">Cleared {p.cleared_date}</p>}
                {(p.attachments || []).length > 0 && <p className="text-[11px] text-slate-400 mt-2 inline-flex items-center gap-1"><Paperclip size={12} /> {p.attachments.length} file(s)</p>}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{editId ? "Edit Encounter" : "Log Roadside Encounter"}</DialogTitle>
            <DialogDescription className="sr-only">Prohibition form</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Vehicle *">
                <Select value={form.vehicle_reg} onValueChange={(v) => setForm({ ...form, vehicle_reg: v })}>
                  <SelectTrigger data-testid="pb-vehicle"><SelectValue placeholder={assets.length ? "Select" : "Add a vehicle first"} /></SelectTrigger>
                  <SelectContent>{assets.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Driver">
                <Select value={form.driver_name || "none"} onValueChange={(v) => setForm({ ...form, driver_name: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="pb-driver"><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">—</SelectItem>{drivers.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date"><Input data-testid="pb-date" type="date" value={form.encounter_date} onChange={(e) => setForm({ ...form, encounter_date: e.target.value })} /></Field>
              <Field label="Location"><Input data-testid="pb-location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. M6 J10 check site" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Authority">
                <Select value={form.authority} onValueChange={(v) => setForm({ ...form, authority: v })}>
                  <SelectTrigger data-testid="pb-authority"><SelectValue /></SelectTrigger>
                  <SelectContent>{AUTHORITIES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Encounter type">
                <Select value={form.encounter_type} onValueChange={(v) => setForm({ ...form, encounter_type: v })}>
                  <SelectTrigger data-testid="pb-encounter"><SelectValue /></SelectTrigger>
                  <SelectContent>{ENCOUNTERS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Prohibition">
                <Select value={form.prohibition_type} onValueChange={(v) => setForm({ ...form, prohibition_type: v })}>
                  <SelectTrigger data-testid="pb-prohibition"><SelectValue /></SelectTrigger>
                  <SelectContent>{PROHIBITIONS.map((a) => <SelectItem key={a.v} value={a.v}>{a.l}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Category">
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger data-testid="pb-category"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Reference / notice number"><Input data-testid="pb-reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="PG9 / notice number" /></Field>
            <Field label="Defects / details"><Textarea data-testid="pb-details" value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder="What was found at the stop" /></Field>
            <div className="flex items-center gap-3">
              <Checkbox id="pb-fp" data-testid="pb-fixed-penalty" checked={form.fixed_penalty} onCheckedChange={(v) => setForm({ ...form, fixed_penalty: !!v })} />
              <label htmlFor="pb-fp" className="text-sm text-slate-700">Fixed penalty issued</label>
            </div>
            {form.fixed_penalty && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Penalty amount (£)"><Input data-testid="pb-penalty" type="number" value={form.penalty_amount} onChange={(e) => setForm({ ...form, penalty_amount: e.target.value })} /></Field>
                <Field label="Penalty points"><Input data-testid="pb-points" type="number" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} /></Field>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Status">
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger data-testid="pb-status"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="cleared">Cleared</SelectItem></SelectContent>
                </Select>
              </Field>
              {form.status === "cleared" && <Field label="Cleared date"><Input data-testid="pb-cleared-date" type="date" value={form.cleared_date} onChange={(e) => setForm({ ...form, cleared_date: e.target.value })} /></Field>}
            </div>
            <Field label="Notes"><Textarea data-testid="pb-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></Field>
            <div>
              <p className="text-sm font-medium text-slate-700 mb-1.5">Attachments (PG9 notice, photos)</p>
              <FileUpload testid="pb-files" attachments={form.attachments} onChange={(a) => setForm({ ...form, attachments: a })} />
            </div>
            <DialogFooter><Button data-testid="save-prohibition-button" type="submit" className="bg-black hover:bg-slate-800">{editId ? "Save Changes" : "Log Encounter"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, tone = "text-slate-900" }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md p-3">
      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">{label}</p>
      <p className={`font-heading text-2xl font-black mt-1 ${tone}`}>{value}</p>
    </div>
  );
}

export default function Prohibitions() { return <ProhibitionsPanel />; }
