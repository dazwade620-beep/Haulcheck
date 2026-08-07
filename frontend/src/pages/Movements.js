import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ship, Plus, Trash2, Pencil, ExternalLink, ArrowRight, ArrowLeft, MapPin, Truck, User as UserIcon, Anchor, FileDown } from "lucide-react";
import { toast } from "sonner";
import { Field, Empty } from "@/pages/Vehicles";
import { FileUpload } from "@/components/FileUpload";
import { PrintEntryButton } from "@/components/PrintEntryButton";
import { downloadPdf } from "@/lib/download";

const HMRC_URL = "https://www.gov.uk/log-in-hmrc-goods-vehicle-movement-service";
const empty = { movement_date: "", direction: "export", vehicle_reg: "", trailer_ref: "", driver_name: "", gmr_reference: "", route: "", ferry_operator: "", status: "planned", notes: "", attachments: [] };

const statusMeta = {
  planned: { label: "Planned", cls: "bg-amber-100 text-amber-700" },
  completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-700" },
};

export default function Movements() {
  const [items, setItems] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [operatorGmr, setOperatorGmr] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [packOpen, setPackOpen] = useState(false);
  const [pack, setPack] = useState({ from_date: "", to_date: "" });
  const [packing, setPacking] = useState(false);

  const downloadPack = async () => {
    setPacking(true);
    const params = new URLSearchParams();
    if (pack.from_date) params.set("from_date", pack.from_date);
    if (pack.to_date) params.set("to_date", pack.to_date);
    const ok = await downloadPdf(`/movements/pack${params.toString() ? `?${params}` : ""}`, "border-movements-pack.pdf");
    if (ok) { toast.success("Movement pack downloaded"); setPackOpen(false); }
    setPacking(false);
  };

  const load = async () => {
    const [m, v, d, o] = await Promise.all([
      api.get("/movements"), api.get("/vehicles"), api.get("/drivers"), api.get("/operator"),
    ]);
    setItems(m.data);
    setVehicles(v.data.map((x) => x.registration).filter(Boolean));
    setDrivers(d.data.map((x) => x.name).filter(Boolean));
    setOperatorGmr(o.data?.gmr_reference || "");
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditId(null);
    setForm({ ...empty, movement_date: new Date().toISOString().slice(0, 10), gmr_reference: operatorGmr });
    setOpen(true);
  };
  const openEdit = (m) => { setEditId(m.id); setForm({ ...empty, ...m, movement_date: m.movement_date || "" }); setOpen(true); };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, movement_date: form.movement_date || null };
      if (editId) await api.put(`/movements/${editId}`, payload);
      else await api.post("/movements", payload);
      toast.success(editId ? "Movement updated" : "Movement logged");
      setOpen(false); load();
    } catch { toast.error("Could not save movement"); }
    setBusy(false);
  };
  const remove = async (id) => { try { await api.delete(`/movements/${id}`); setItems((m) => m.filter((x) => x.id !== id)); toast.success("Movement removed"); } catch { toast.error("Could not delete"); } };

  return (
    <div data-testid="movements-page">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center"><Ship size={22} /></span>
          <div>
            <h1 className="font-heading text-2xl sm:text-3xl font-black tracking-tight text-slate-900">Border Movements</h1>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-semibold mt-1">GVMS / GMR log</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a data-testid="movements-open-hmrc" href={HMRC_URL} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
            Open HMRC <ExternalLink size={14} />
          </a>
          {items.length > 0 && (
            <Button data-testid="movements-pack-button" variant="outline" onClick={() => { setPack({ from_date: "", to_date: "" }); setPackOpen(true); }} className="rounded-md gap-2 border-slate-300"><FileDown size={16} /> Download pack</Button>
          )}
          <Button data-testid="add-movement-button" onClick={openNew} className="bg-slate-900 hover:bg-slate-800 rounded-md gap-2"><Plus size={16} /> Log movement</Button>
        </div>
      </div>

      <p className="text-sm text-slate-500 mb-5 max-w-2xl">
        Log each cross-border movement. Your GMR / HMRC reference is pulled in automatically from Company Settings — use <b>Open HMRC</b> to complete the official government step on the GVMS service yourself.
      </p>

      {!operatorGmr && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-md px-4 py-3 mb-5" data-testid="movements-gmr-warning">
          No GMR / HMRC reference saved yet. Add it in <b>Company Settings</b> so it auto-fills onto new movements.
        </div>
      )}

      {items.length === 0 ? (
        <Empty icon={Ship} text="No border movements logged yet. Log your first crossing to keep a GVMS paper trail." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((m) => {
            const st = statusMeta[m.status] || statusMeta.planned;
            const isImport = m.direction === "import";
            return (
              <div key={m.id} data-testid="movement-card" className="bg-white border border-slate-200 rounded-md p-5 flex flex-col hover:border-slate-400 transition-colors animate-in-up">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 ${isImport ? "bg-blue-100 text-blue-700" : "bg-slate-900 text-white"}`}>
                        {isImport ? <ArrowLeft size={11} /> : <ArrowRight size={11} />} {isImport ? "Import" : "Export"}
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                    </div>
                    <p className="font-mono font-bold text-slate-900 mt-2 break-all">{m.gmr_reference || "— no GMR —"}</p>
                    <p className="text-xs text-slate-400">{m.movement_date || "No date"}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <PrintEntryButton kind="movement" id={m.id} hasFiles={m.attachments?.length > 0} variant="icon" />
                    <button data-testid="edit-movement-button" onClick={() => openEdit(m)} className="text-slate-400 hover:text-slate-900 p-1"><Pencil size={15} /></button>
                    <button data-testid="delete-movement-button" onClick={() => remove(m.id)} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                  {m.vehicle_reg && <p className="flex items-center gap-2"><Truck size={14} className="text-slate-400" /> {m.vehicle_reg}{m.trailer_ref ? ` · ${m.trailer_ref}` : ""}</p>}
                  {m.driver_name && <p className="flex items-center gap-2"><UserIcon size={14} className="text-slate-400" /> {m.driver_name}</p>}
                  {m.route && <p className="flex items-center gap-2"><MapPin size={14} className="text-slate-400" /> {m.route}</p>}
                  {m.ferry_operator && <p className="flex items-center gap-2"><Anchor size={14} className="text-slate-400" /> {m.ferry_operator}</p>}
                </div>
                {m.notes && <p className="text-xs text-slate-500 mt-3 whitespace-pre-line border-t border-slate-100 pt-2">{m.notes}</p>}
                <a data-testid="movement-open-hmrc" href={HMRC_URL} target="_blank" rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900">
                  Open HMRC to complete <ExternalLink size={12} />
                </a>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto" data-testid="movement-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">{editId ? "Edit movement" : "Log border movement"}</DialogTitle>
            <DialogDescription>The GMR / HMRC reference is pre-filled from Company Settings — edit if this crossing uses a different one.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Movement date"><Input data-testid="mv-date" type="date" value={form.movement_date} onChange={(e) => setForm({ ...form, movement_date: e.target.value })} /></Field>
              <Field label="Direction">
                <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                  <SelectTrigger data-testid="mv-direction"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="export">Export (leaving)</SelectItem><SelectItem value="import">Import (arriving)</SelectItem></SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="GMR / HMRC reference">
              <div className="flex gap-2">
                <Input data-testid="mv-gmr" value={form.gmr_reference} onChange={(e) => setForm({ ...form, gmr_reference: e.target.value })} placeholder="GMRA0001ABCD" className="flex-1" />
                <a href={HMRC_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">HMRC <ExternalLink size={13} /></a>
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Vehicle">
                <Select value={form.vehicle_reg || "none"} onValueChange={(v) => setForm({ ...form, vehicle_reg: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="mv-vehicle"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">None</SelectItem>{vehicles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Trailer (optional)"><Input data-testid="mv-trailer" value={form.trailer_ref} onChange={(e) => setForm({ ...form, trailer_ref: e.target.value })} placeholder="Trailer no." /></Field>
            </div>
            <Field label="Driver">
              <Select value={form.driver_name || "none"} onValueChange={(v) => setForm({ ...form, driver_name: v === "none" ? "" : v })}>
                <SelectTrigger data-testid="mv-driver"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent><SelectItem value="none">None</SelectItem>{drivers.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Route / crossing"><Input data-testid="mv-route" value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })} placeholder="Dover → Calais" /></Field>
              <Field label="Ferry / tunnel operator"><Input data-testid="mv-ferry" value={form.ferry_operator} onChange={(e) => setForm({ ...form, ferry_operator: e.target.value })} placeholder="DFDS / Eurotunnel" /></Field>
            </div>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger data-testid="mv-status"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="planned">Planned</SelectItem><SelectItem value="completed">Completed</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Notes"><Textarea data-testid="mv-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Load details, customs notes, etc." /></Field>
            <div>
              <p className="text-sm font-medium text-slate-700 mb-1.5">Attachments</p>
              <FileUpload testid="mv-files" label="Upload files" attachments={form.attachments} onChange={(a) => setForm({ ...form, attachments: a })} />
            </div>
            <DialogFooter><Button data-testid="save-movement-button" type="submit" disabled={busy} className="bg-slate-900 hover:bg-slate-800">{busy ? "Saving…" : editId ? "Save changes" : "Log movement"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={packOpen} onOpenChange={setPackOpen}>
        <DialogContent className="max-w-md" data-testid="movements-pack-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">Download movement pack</DialogTitle>
            <DialogDescription>One combined, audit-ready PDF of every border movement. Leave dates blank for all movements, or pick a range.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <Field label="From date"><Input data-testid="pack-from" type="date" value={pack.from_date} onChange={(e) => setPack({ ...pack, from_date: e.target.value })} /></Field>
            <Field label="To date"><Input data-testid="pack-to" type="date" value={pack.to_date} onChange={(e) => setPack({ ...pack, to_date: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            <Button data-testid="pack-download-button" onClick={downloadPack} disabled={packing} className="bg-slate-900 hover:bg-slate-800 gap-2"><FileDown size={16} /> {packing ? "Building…" : "Download PDF"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
