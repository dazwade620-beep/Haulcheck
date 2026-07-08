import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Pencil, FolderCheck } from "lucide-react";
import { toast } from "sonner";
import { Header, Field, Empty } from "@/pages/Vehicles";
import { FileUpload, AttachmentThumbs } from "@/components/FileUpload";

const TYPES = ["Operator Licence", "Insurance", "Audit Report", "Wheel Security Check", "Motor Insurance DB", "Health & Safety", "Attestation Record", "Indoctrination Document", "Driver Infringement", "Infringement Report", "Warning Letter", "Adhoc Note", "Other"];
const empty = { title: "", doc_type: "Operator Licence", reference: "", expiry_date: "", notes: "", attachments: [] };

export function DocumentsPanel({ embedded = false }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);

  const load = async () => setItems((await api.get("/documents")).data.filter((d) => !d.driver_id));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(empty); setEditId(null); setOpen(true); };
  const openEdit = (d) => { setForm({ ...empty, ...d, expiry_date: d.expiry_date || "", attachments: d.attachments || [] }); setEditId(d.id); setOpen(true); };

  const save = async (e) => {
    e.preventDefault();
    const payload = { ...form, expiry_date: form.expiry_date || null };
    try {
      if (editId) await api.put(`/documents/${editId}`, payload);
      else await api.post("/documents", payload);
      toast.success(editId ? "Document updated" : "Document added");
      setOpen(false); load();
    } catch { toast.error("Could not save document"); }
  };
  const remove = async (id) => { await api.delete(`/documents/${id}`); toast.success("Document removed"); load(); };

  return (
    <div data-testid="documents-page">
      {!embedded && <Header title="Documents" subtitle="Operator licence, insurance, audits & wheel security" onAdd={openNew} addTestId="add-document-button" addLabel="Add Document" />}
      {embedded && (
        <div className="flex justify-end mb-4">
          <Button data-testid="add-document-button" onClick={openNew} className="bg-black hover:bg-slate-800 rounded-md gap-2">Add Document</Button>
        </div>
      )}

      {items.length === 0 ? <Empty icon={FolderCheck} text="No documents yet. Track expiry of key operator documents." /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((d) => (
            <div key={d.id} data-testid="document-card" className="bg-white border border-slate-200 rounded-md p-5 hover:-translate-y-1 hover:shadow-sm hover:border-slate-300 transition-all duration-200 animate-in-up">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">{d.doc_type}</p>
                  <h3 className="font-heading font-bold text-lg text-slate-900 truncate">{d.title}</h3>
                  {d.reference && <p className="text-xs text-slate-500 mt-0.5">Ref: {d.reference}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button data-testid="edit-document-button" onClick={() => openEdit(d)} className="text-slate-400 hover:text-slate-900 p-1"><Pencil size={15} /></button>
                  <button data-testid="delete-document-button" onClick={() => remove(d.id)} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">Expiry</p>
                  <p className="text-sm font-semibold text-slate-700">{d.expiry_date || "—"}{d.days_left != null && <span className="text-slate-400 font-normal"> · {d.days_left < 0 ? `${Math.abs(d.days_left)}d overdue` : `${d.days_left}d`}</span>}</p>
                </div>
                <StatusBadge status={d.status} />
              </div>
              <AttachmentThumbs attachments={d.attachments} />
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{editId ? "Edit Document" : "Add Document"}</DialogTitle><DialogDescription className="sr-only">Document details form</DialogDescription></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <Field label="Title *"><Input data-testid="doc-title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Standard National O-Licence" /></Field>
            <Field label="Type">
              <Select value={form.doc_type} onValueChange={(v) => setForm({ ...form, doc_type: v })}>
                <SelectTrigger data-testid="doc-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Reference"><Input data-testid="doc-reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="OB1234567" /></Field>
              <Field label="Expiry Date"><Input data-testid="doc-expiry" type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></Field>
            </div>
            <Field label="Scan / Document"><FileUpload testid="doc-upload" attachments={form.attachments} onChange={(a) => setForm({ ...form, attachments: a })} /></Field>
            <DialogFooter><Button data-testid="save-document-button" type="submit" className="bg-black hover:bg-slate-800">{editId ? "Save Changes" : "Add Document"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Documents() {
  return <DocumentsPanel />;
}
