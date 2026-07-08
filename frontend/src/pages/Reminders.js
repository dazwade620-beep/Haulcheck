import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bell, Mail, Plus, Trash2, Send } from "lucide-react";
import { toast } from "sonner";

export default function Reminders() {
  const [recipients, setRecipients] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get("/reminders/settings").then((r) => setRecipients(r.data.recipients || []));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const addEmail = () => {
    const e = newEmail.trim().toLowerCase();
    if (!isValidEmail(e)) return toast.error("Enter a valid email address");
    if (recipients.includes(e)) return toast.error("Email already added");
    setRecipients([...recipients, e]);
    setNewEmail("");
  };

  const removeEmail = (e) => setRecipients(recipients.filter((r) => r !== e));

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/reminders/settings", { recipients });
      toast.success("Recipient list saved");
    } catch { toast.error("Could not save recipients"); }
    finally { setSaving(false); }
  };

  const sendNow = async () => {
    if (recipients.length === 0) return toast.error("Add at least one recipient first");
    setSending(true);
    try {
      await api.put("/reminders/settings", { recipients });
      const r = await api.post("/reminders/send");
      toast.success(`Reminder sent to ${r.data.sent_to.length} recipient(s) — ${r.data.item_count} item(s) flagged`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not send reminder");
    } finally { setSending(false); }
  };

  return (
    <div data-testid="reminders-page">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Compliance · Notifications</p>
          <h1 className="font-heading text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mt-1">Email Reminders</h1>
          <p className="text-slate-500 text-sm mt-1">Send a compliance digest of items expiring within 30 days to your team.</p>
        </div>
        <Button data-testid="send-reminder-button" onClick={sendNow} disabled={sending} className="bg-black hover:bg-slate-800 rounded-md gap-2">
          <Send size={16} /> {sending ? "Sending…" : "Send reminder now"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-md p-6">
          <div className="flex items-center gap-2 mb-5">
            <Mail size={18} className="text-slate-900" />
            <h3 className="font-heading font-bold text-lg tracking-tight">Recipients</h3>
          </div>

          <div className="flex gap-2 mb-4">
            <Input
              data-testid="recipient-email-input"
              type="email"
              placeholder="name@company.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
            />
            <Button data-testid="add-recipient-button" onClick={addEmail} variant="outline" className="rounded-md gap-1 shrink-0">
              <Plus size={16} /> Add
            </Button>
          </div>

          {recipients.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center" data-testid="no-recipients">No recipients yet. Add one above.</p>
          ) : (
            <ul className="space-y-2" data-testid="recipient-list">
              {recipients.map((e) => (
                <li key={e} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                  <span className="text-sm text-slate-800">{e}</span>
                  <button data-testid={`remove-recipient-${e}`} onClick={() => removeEmail(e)} className="text-slate-400 hover:text-red-600 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Button data-testid="save-recipients-button" onClick={save} disabled={saving} className="mt-5 w-full bg-slate-900 hover:bg-slate-700 rounded-md">
            {saving ? "Saving…" : "Save recipient list"}
          </Button>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-6">
          <div className="flex items-center gap-2 mb-4">
            <Bell size={18} className="text-slate-900" />
            <h3 className="font-heading font-bold text-lg tracking-tight">How it works</h3>
          </div>
          <ul className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <li className="flex gap-2"><span className="text-slate-900 font-bold">1.</span> Add the email addresses that should receive compliance reminders.</li>
            <li className="flex gap-2"><span className="text-slate-900 font-bold">2.</span> The reminder digest lists every item that is expired or due within the next <strong>30 days</strong> — MOT/CVRT, tax, service, driver licence, CPC, tacho, PMI, insurance and training.</li>
            <li className="flex gap-2"><span className="text-slate-900 font-bold">3.</span> Reminders send <strong>automatically once a day</strong> — each item is emailed once when it enters the 30-day window. Or press <strong>Send reminder now</strong> to email the full current digest on demand.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
