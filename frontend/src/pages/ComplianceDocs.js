import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PrintEntryButton } from "@/components/PrintEntryButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Trash2, Pencil, Paperclip, Link2, FilePlus2, ExternalLink, Megaphone, Globe } from "lucide-react";
import { toast } from "sonner";
import { Field, Empty } from "@/pages/Vehicles";
import { FileUpload } from "@/components/FileUpload";

const CATEGORIES = [
  "Operator Licence", "Insurance", "Health & Safety", "Environmental / Waste",
  "Policies & Procedures", "Certificates", "HR / Employment", "Financial", "Web Link", "Other",
];
const empty = { title: "", category: "Operator Licence", reference: "", expiry_date: "", link_url: "", notes: "", attachments: [] };

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const fileHref = (att) => `${BACKEND}/api/files/${att.file_id}?auth=${localStorage.getItem("token") || ""}`;
const globalFileHref = (att) => `${BACKEND}/api/global-docs/files/${att.file_id}?auth=${localStorage.getItem("token") || ""}`;

const GLOBAL_CATEGORIES = ["Guidance", "Legislation", "DVSA / RSA Notice", "Safety Alert", "Best Practice", "Template", "Other"];
const gEmpty = { title: "", category: "Guidance", link_url: "", notes: "", attachments: [] };

function SharedDocs() {
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(gEmpty);
  const [busy, setBusy] = useState(false);

  const load = async () => { try { const r = await api.get("/global-docs"); setItems(r.data); } catch { /* ignore */ } };
  useEffect(() => {
    load();
    api.post("/global-docs/mark-seen").then(() => window.dispatchEvent(new Event("shared-docs-seen"))).catch(() => {});
  }, []);

  const save = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Enter a title");
    setBusy(true);
    try {
      await api.post("/admin/global-docs", form);
      toast.success("Shared with all HaulCheck users");
      setOpen(false); setForm(gEmpty); load();
    } catch (err) { toast.error(err.response?.data?.detail || "Could not share document"); }
    setBusy(false);
  };
  const remove = async (id) => { try { await api.delete(`/admin/global-docs/${id}`); setItems((m) => m.filter((x) => x.id !== id)); } catch { toast.error("Could not remove"); } };

  if (items.length === 0 && !isAdmin) return null;

  return (
    <div className="mb-8" data-testid="shared-docs-section">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center"><Megaphone size={16} /></span>
          <div>
            <h3 className="font-heading font-bold text-slate-900 tracking-tight leading-tight">Shared by HaulCheck</h3>
            <p className="text-xs text-slate-400">Compliance guidance & resources for every operator</p>
          </div>
        </div>
        {isAdmin && <Button data-testid="add-shared-doc-button" onClick={() => { setForm(gEmpty); setOpen(true); }} className="bg-slate-900 hover:bg-slate-800 rounded-md gap-2 shrink-0"><FilePlus2 size={15} /> Add shared doc</Button>}
      </div>

      {items.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-md p-6 text-center text-sm text-slate-400" data-testid="shared-docs-empty">No shared resources yet.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((d) => (
            <div key={d.id} data-testid="shared-doc-card" className="bg-slate-900 text-white rounded-md p-5 flex flex-col animate-in-up">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">{d.category}</span>
                  <h4 className="font-heading font-bold leading-tight mt-0.5 break-words">{d.title}</h4>
                </div>
                {isAdmin && <button data-testid="delete-shared-doc" onClick={() => remove(d.id)} className="text-slate-500 hover:text-red-400 shrink-0"><Trash2 size={15} /></button>}
              </div>
              {d.notes && <p className="text-sm text-slate-300 mt-2 whitespace-pre-line">{d.notes}</p>}
              <div className="flex flex-wrap items-center gap-3 mt-auto pt-3">
                {d.link_url && (
                  <a data-testid="open-shared-link" href={d.link_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:underline">
                    <Link2 size={13} /> Open link <ExternalLink size={11} />
                  </a>
                )}
                {(d.attachments || []).map((a, i) => (
                  <a key={i} data-testid="open-shared-file" href={globalFileHref(a)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-white">
                    <Paperclip size={13} /> {a.filename || `File ${i + 1}`}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto" data-testid="shared-doc-dialog">
          <DialogHeader><DialogTitle className="font-heading">Share a compliance doc / link</DialogTitle>
            <DialogDescription>This appears for <b>every registered HaulCheck user</b> to help everyone stay compliant.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <Field label="Title *"><Input data-testid="sd-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. DVSA Guide to Maintaining Roadworthiness" /></Field>
            <Field label="Category">
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger data-testid="sd-category"><SelectValue /></SelectTrigger>
                <SelectContent>{GLOBAL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Web link (optional)"><Input data-testid="sd-link" value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} placeholder="https://www.gov.uk/…" /></Field>
            <Field label="Notes"><Textarea data-testid="sd-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Short description of what this is and why it matters" /></Field>
            <div>
              <p className="text-sm font-medium text-slate-700 mb-1.5">Attachments</p>
              <FileUpload testid="sd-files" label="Upload files" attachments={form.attachments} onChange={(a) => setForm({ ...form, attachments: a })} />
            </div>
            <DialogFooter><Button data-testid="save-shared-doc-button" type="submit" disabled={busy} className="bg-slate-900 hover:bg-slate-800 gap-2"><Globe size={15} /> {busy ? "Sharing…" : "Share with everyone"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const dayStatus = (dateStr) => {
  if (!dateStr) return null;
  const days = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  if (days < 0) return { cls: "bg-red-100 text-red-700", label: "Expired" };
  if (days <= 30) return { cls: "bg-amber-100 text-amber-700", label: `${days}d left` };
  return { cls: "bg-green-100 text-green-700", label: "Valid" };
};

export function ComplianceDocsPanel() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState("All");

  const load = async () => {
    const r = await api.get("/compliance-docs");
    setItems(r.data);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => { setForm(empty); setEditId(null); setOpen(true); };
  const openEdit = (d) => { setForm({ ...empty, ...d, expiry_date: d.expiry_date || "", attachments: d.attachments || [] }); setEditId(d.id); setOpen(true); };

  const save = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Enter a title");
    let link = form.link_url.trim();
    if (link && !/^https?:\/\//i.test(link)) link = `https://${link}`;
    const payload = { ...form, link_url: link, expiry_date: form.expiry_date || null };
    try {
      if (editId) await api.put(`/compliance-docs/${editId}`, payload);
      else await api.post("/compliance-docs", payload);
      toast.success(editId ? "Document updated" : "Document added");
      setOpen(false); load();
    } catch { toast.error("Could not save document"); }
  };
  const remove = async (id) => { await api.delete(`/compliance-docs/${id}`); toast.success("Document deleted"); load(); };

  const categories = ["All", ...CATEGORIES.filter((c) => items.some((i) => i.category === c))];
  const shown = filter === "All" ? items : items.filter((i) => i.category === filter);

  return (
    <div data-testid="compliance-docs-page">
      <SharedDocs />
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <p className="text-sm text-slate-500">Store compliance documents and quick web links — operator licence, policies, certificates, portals and more.</p>
        <Button data-testid="add-compliance-doc-button" onClick={openNew} className="bg-black hover:bg-slate-800 rounded-md gap-2 shrink-0"><FilePlus2 size={16} /> Add Document / Link</Button>
      </div>

      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {categories.map((c) => (
            <button key={c} data-testid={`cd-filter-${c}`} onClick={() => setFilter(c)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${filter === c ? "bg-black text-white border-black" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}>
              {c}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <Empty icon={ShieldCheck} text="No compliance documents yet. Add operator licence paperwork, policies, certificates or a useful web link." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map((d) => {
            const st = dayStatus(d.expiry_date);
            return (
              <div key={d.id} data-testid="compliance-doc-card" className="bg-white border border-slate-200 rounded-md p-5 animate-in-up flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{d.category}</span>
                    <h4 className="font-heading font-bold text-slate-900 leading-tight mt-0.5 break-words">{d.title}</h4>
                    {d.reference && <p className="text-xs text-slate-500 mt-0.5">Ref: {d.reference}</p>}
                  </div>
                  <div className="flex items-center shrink-0">
                    <button data-testid="edit-compliance-doc-button" onClick={() => openEdit(d)} className="text-slate-400 hover:text-slate-900 p-1.5"><Pencil size={15} /></button>
                    <div className="flex items-center gap-1"><PrintEntryButton kind="compliance-doc" id={d.id} hasFiles={d.attachments?.length > 0} variant="icon" /><button data-testid="delete-compliance-doc-button" onClick={() => remove(d.id)} className="text-slate-400 hover:text-red-600 p-1.5"><Trash2 size={15} /></button></div>
                  </div>
                </div>

                {d.notes && <p className="text-sm text-slate-600 mt-2 whitespace-pre-line">{d.notes}</p>}

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {d.expiry_date && st && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>Expires {d.expiry_date} · {st.label}</span>}
                </div>

                <div className="flex flex-wrap items-center gap-3 mt-auto pt-3">
                  {d.link_url && (
                    <a data-testid="open-compliance-link" href={d.link_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
                      <Link2 size={13} /> Open link <ExternalLink size={11} />
                    </a>
                  )}
                  {(d.attachments || []).map((a, i) => (
                    <a key={i} data-testid="open-compliance-file" href={fileHref(a)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900">
                      <Paperclip size={13} /> {a.filename || `File ${i + 1}`}
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{editId ? "Edit Document" : "Add Document / Link"}</DialogTitle>
            <DialogDescription className="sr-only">Compliance document form</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <Field label="Title *"><Input data-testid="cd-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Operator Licence disc, H&S Policy" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category">
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger data-testid="cd-category"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Reference"><Input data-testid="cd-reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Doc / policy no." /></Field>
            </div>
            <Field label="Expiry / review date"><Input data-testid="cd-expiry" type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></Field>
            <Field label="Web link (optional)"><Input data-testid="cd-link" value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} placeholder="https://…" /></Field>
            <Field label="Notes"><Textarea data-testid="cd-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></Field>
            <div>
              <p className="text-sm font-medium text-slate-700 mb-1.5">Attachments</p>
              <FileUpload testid="cd-files" label="Upload files" attachments={form.attachments} onChange={(a) => setForm({ ...form, attachments: a })} />
            </div>
            <DialogFooter><Button data-testid="save-compliance-doc-button" type="submit" className="bg-black hover:bg-slate-800">{editId ? "Save Changes" : "Add Document"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ComplianceDocs() { return <ComplianceDocsPanel />; }
