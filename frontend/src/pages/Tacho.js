import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trash2, Pencil, Gauge, Download, AlertTriangle, CreditCard, Cpu, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Header, Field, Empty } from "@/pages/Vehicles";
import { FileUpload, AttachmentThumbs } from "@/components/FileUpload";

const FREQ = { "Driver Card": 28, "Vehicle Unit": 90 };
const today = () => new Date().toISOString().slice(0, 10);
const empty = { source_type: "Driver Card", reference: "", frequency_days: 28, last_download: "", infringements: 0, notes: "", attachments: [] };

export default function Tacho() {
  const [items, setItems] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [reading, setReading] = useState(false);

  const load = async () => {
    setItems((await api.get("/tacho")).data);
    setDrivers((await api.get("/drivers")).data);
    setVehicles((await api.get("/vehicles")).data);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(empty); setEditId(null); setOpen(true); };
  const openEdit = (t) => { setForm({ ...empty, ...t, last_download: t.last_download || "", attachments: t.attachments || [] }); setEditId(t.id); setOpen(true); };

  const setType = (v) => setForm({ ...form, source_type: v, frequency_days: FREQ[v] || form.frequency_days, reference: "" });

  const refOptions = form.source_type === "Vehicle Unit"
    ? vehicles.map((v) => v.registration).filter(Boolean)
    : drivers.map((d) => d.name).filter(Boolean);

  const save = async (e) => {
    e.preventDefault();
    if (!form.reference) { toast.error(form.source_type === "Vehicle Unit" ? "Select a vehicle" : "Select a driver"); return; }
    const payload = { ...form, frequency_days: Number(form.frequency_days), infringements: Number(form.infringements) || 0, last_download: form.last_download || null };
    try {
      if (editId) await api.put(`/tacho/${editId}`, payload);
      else await api.post("/tacho", payload);
      toast.success(editId ? "Record updated" : "Tacho record added");
      setOpen(false); load();
    } catch { toast.error("Could not save record"); }
  };
  const remove = async (id) => { await api.delete(`/tacho/${id}`); toast.success("Record removed"); load(); };
  const logDownload = async (t) => {
    try {
      await api.post(`/tacho/${t.id}/download`, { download_date: today() });
      toast.success("Download logged · next due rescheduled");
      load();
    } catch { toast.error("Could not log download"); }
  };

  const autoRead = async () => {
    const att = form.attachments[form.attachments.length - 1];
    if (!att) { toast.error("Upload a tacho file first"); return; }
    setReading(true);
    try {
      const res = await api.post("/tacho/parse", { file_id: att.file_id });
      const upd = {};
      if (res.data.last_download) upd.last_download = res.data.last_download;
      if (res.data.infringements != null) upd.infringements = res.data.infringements;
      setForm((f) => ({ ...f, ...upd }));
      toast.success(res.data.last_download ? `Read last download: ${res.data.last_download}` : "No date found in file — please enter manually");
    } catch {
      toast.error("Could not read the file");
    } finally {
      setReading(false);
    }
  };

  const grouped = (sourceType) => {
    const list = items.filter((i) => i.source_type === sourceType);
    const map = {};
    list.forEach((i) => { (map[i.reference || "—"] = map[i.reference || "—"] || []).push(i); });
    return Object.entries(map).map(([ref, recs]) => {
      recs.sort((a, b) => (b.last_download || b.next_due || "").localeCompare(a.last_download || a.next_due || ""));
      return { ref, latest: recs[0], history: recs.slice(1) };
    });
  };

  const renderGroups = (sourceType, emptyText) => {
    const groups = grouped(sourceType);
    const Icon = sourceType === "Vehicle Unit" ? Cpu : CreditCard;
    if (groups.length === 0) return <Empty icon={Gauge} text={emptyText} />;
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {groups.map(({ ref, latest: t, history }) => (
          <div key={sourceType + ref} data-testid="tacho-card" className="bg-white border border-slate-200 rounded-md p-5 hover:-translate-y-1 hover:shadow-sm hover:border-slate-300 transition-all duration-200 animate-in-up">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold flex items-center gap-1"><Icon size={12} /> {t.source_type}</p>
                <h3 className="font-heading font-bold text-lg text-slate-900 truncate">{ref}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Every {t.frequency_days} days · last {t.last_download || "—"}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button data-testid="edit-tacho-button" onClick={() => openEdit(t)} className="text-slate-400 hover:text-slate-900 p-1"><Pencil size={15} /></button>
                <button data-testid="delete-tacho-button" onClick={() => remove(t.id)} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Next download due</p>
                <p className="text-sm font-semibold text-slate-700">{t.next_due || "—"}{t.days_left != null && <span className="text-slate-400 font-normal"> · {t.days_left < 0 ? `${Math.abs(t.days_left)}d overdue` : `${t.days_left}d`}</span>}</p>
              </div>
              <StatusBadge status={t.status} />
            </div>
            {t.infringements > 0 && (
              <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 rounded-md px-2.5 py-1.5">
                <AlertTriangle size={13} /> {t.infringements} infringement{t.infringements > 1 ? "s" : ""} logged
              </div>
            )}
            <AttachmentThumbs attachments={t.attachments} />
            {history.length > 0 && (
              <details className="mt-3">
                <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">{history.length} earlier download{history.length > 1 ? "s" : ""}</summary>
                <div className="mt-2 space-y-1">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-1">
                      <span>{h.last_download || "—"}</span>
                      <button onClick={() => remove(h.id)} className="text-slate-300 hover:text-red-600"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              </details>
            )}
            <Button data-testid="log-download-button" onClick={() => logDownload(t)} variant="outline" className="w-full mt-4 gap-2 border-slate-300">
              <Download size={15} /> Log Download Today
            </Button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div data-testid="tacho-page">
      <Header title="Tacho Portal" subtitle="Driver card (28d) & vehicle unit (90d) download tracking" onAdd={openNew} addTestId="add-tacho-button" addLabel="Add Record" />

      <Tabs defaultValue="Driver Card">
        <TabsList className="mb-6">
          <TabsTrigger value="Driver Card" data-testid="tacho-tab-drivers"><CreditCard size={15} className="mr-1.5" /> Driver Cards</TabsTrigger>
          <TabsTrigger value="Vehicle Unit" data-testid="tacho-tab-vehicles"><Cpu size={15} className="mr-1.5" /> Vehicle Units</TabsTrigger>
        </TabsList>
        <TabsContent value="Driver Card">{renderGroups("Driver Card", "No driver card downloads yet. Add a record to start tracking.")}</TabsContent>
        <TabsContent value="Vehicle Unit">{renderGroups("Vehicle Unit", "No vehicle unit downloads yet. Add a record to start tracking.")}</TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{editId ? "Edit Tacho Record" : "Add Tacho Record"}</DialogTitle><DialogDescription className="sr-only">Tachograph download record form</DialogDescription></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Source Type">
                <Select value={form.source_type} onValueChange={setType}>
                  <SelectTrigger data-testid="tacho-type-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Driver Card">Driver Card</SelectItem>
                    <SelectItem value="Vehicle Unit">Vehicle Unit</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Frequency (days)"><Input data-testid="tacho-frequency" type="number" min="1" value={form.frequency_days} onChange={(e) => setForm({ ...form, frequency_days: e.target.value })} /></Field>
            </div>
            <Field label={form.source_type === "Vehicle Unit" ? "Vehicle Registration *" : "Driver *"}>
              <Select value={form.reference || undefined} onValueChange={(v) => setForm({ ...form, reference: v })}>
                <SelectTrigger data-testid="tacho-reference"><SelectValue placeholder={form.source_type === "Vehicle Unit" ? "Select vehicle" : "Select driver"} /></SelectTrigger>
                <SelectContent>
                  {[...new Set([...(form.reference ? [form.reference] : []), ...refOptions])].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  {refOptions.length === 0 && !form.reference && (
                    <div className="px-3 py-2 text-xs text-slate-400">{form.source_type === "Vehicle Unit" ? "No vehicles — add one in Fleet first" : "No drivers — add one in Drivers first"}</div>
                  )}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Last Download"><Input data-testid="tacho-last" type="date" value={form.last_download} onChange={(e) => setForm({ ...form, last_download: e.target.value })} /></Field>
              <Field label="Infringements"><Input data-testid="tacho-infringements" type="number" min="0" value={form.infringements} onChange={(e) => setForm({ ...form, infringements: e.target.value })} /></Field>
            </div>
            <Field label="Upload Tacho Data (download files)"><FileUpload testid="tacho-upload" label="Upload tacho files (.ddd / .tgd / .c1b / .v1b / image / PDF)" accept="image/*,application/pdf,.ddd,.tgd,.c1b,.v1b,.dtc,.esm,.tgz" attachments={form.attachments} onChange={(a) => setForm({ ...form, attachments: a })} /></Field>
            {form.attachments.length > 0 && (
              <Button type="button" data-testid="tacho-autoread-button" onClick={autoRead} disabled={reading} variant="outline" className="w-full gap-2 border-slate-300">
                {reading ? <><Loader2 size={15} className="animate-spin" /> Reading file…</> : <><Sparkles size={15} /> Auto-read dates from file</>}
              </Button>
            )}
            <Field label="Notes"><Textarea data-testid="tacho-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Infringement details, analysis notes…" /></Field>
            <DialogFooter><Button data-testid="save-tacho-button" type="submit" className="bg-black hover:bg-slate-800">{editId ? "Save Changes" : "Add Record"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
