import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Truck, Mail, Send, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const CONTACT_EMAIL = "info@haulcheck.co.uk";

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [messages, setMessages] = useState(null);
  const loggedIn = !!localStorage.getItem("token");

  const loadMessages = async () => {
    if (!loggedIn) return;
    try { const { data } = await api.get("/contact-messages"); setMessages(data); } catch { /* not a manager / no access */ }
  };
  useEffect(() => { loadMessages(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      return toast.error("Please add your name, email and a message");
    }
    setBusy(true);
    try {
      await api.post("/contact", form);
      setSent(true);
      setForm({ name: "", email: "", message: "" });
      toast.success("Message sent — thanks for getting in touch!");
      loadMessages();
    } catch { toast.error("Could not send your message. Please try again."); }
    setBusy(false);
  };

  const removeMsg = async (id) => {
    try { await api.delete(`/contact-messages/${id}`); setMessages((m) => m.filter((x) => x.id !== id)); }
    catch { toast.error("Could not delete"); }
  };

  return (
    <div className="min-h-screen bg-slate-50" data-testid="contact-page">
      <header className="bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" data-testid="contact-home-link">
            <Truck size={24} />
            <span className="font-heading font-black text-lg tracking-tight">HAULCHECK</span>
          </Link>
          <div className="flex items-center gap-5">
            <Link to="/about" className="text-sm font-semibold text-slate-300 hover:text-white" data-testid="contact-about-link">About</Link>
            <Link to={loggedIn ? "/dashboard" : "/login"} className="text-sm font-semibold text-slate-200 hover:text-white" data-testid="contact-signin-link">
              {loggedIn ? "Back to app" : "Sign in"}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 lg:py-16">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
          <div className="animate-in-up">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-semibold">Contact</p>
            <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tight text-slate-900 mt-2">Get in touch</h1>
            <p className="mt-5 text-slate-600 text-base leading-relaxed max-w-md">
              Questions about HaulCheck, your subscription, or getting your fleet set up? We'd love to hear from you. Leave your name, email address and a short message and we'll get back to you.
            </p>
            <a href={`mailto:${CONTACT_EMAIL}`} data-testid="contact-email-link"
              className="mt-7 inline-flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800 font-semibold hover:border-slate-400 transition-colors">
              <span className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center"><Mail size={18} /></span>
              {CONTACT_EMAIL}
            </a>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm animate-in-up">
            {sent ? (
              <div data-testid="contact-success" className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto"><Send size={22} /></div>
                <h2 className="font-heading text-xl font-bold text-slate-900 mt-4">Message sent</h2>
                <p className="text-slate-500 text-sm mt-2">Thanks for getting in touch — we'll reply to your email shortly.</p>
                <button onClick={() => setSent(false)} className="mt-5 text-sm font-semibold text-slate-900 hover:underline" data-testid="contact-send-another">Send another message</button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <Label htmlFor="c-name">Your name</Label>
                  <Input id="c-name" data-testid="contact-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Alex Morgan" className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="c-email">Email address</Label>
                  <Input id="c-email" data-testid="contact-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@fleet.co.uk" className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="c-message">Message</Label>
                  <Textarea id="c-message" data-testid="contact-message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="How can we help?" rows={5} className="mt-1.5" />
                </div>
                <Button type="submit" data-testid="contact-submit" disabled={busy} className="w-full bg-slate-900 hover:bg-slate-800 gap-2">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send message
                </Button>
              </form>
            )}
          </div>
        </div>

        {loggedIn && messages && messages.length > 0 && (
          <div className="mt-14" data-testid="contact-inbox">
            <h2 className="font-heading text-xl font-bold text-slate-900">Received messages <span className="text-slate-400 font-normal">({messages.length})</span></h2>
            <div className="mt-4 space-y-3">
              {messages.map((m) => (
                <div key={m.id} data-testid="contact-message-row" className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{m.name} <a href={`mailto:${m.email}`} className="text-slate-400 font-normal text-sm hover:text-slate-700">&lt;{m.email}&gt;</a></p>
                      {m.subject && <p className="text-xs text-slate-500 mt-0.5">{m.subject}</p>}
                      <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{m.message}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-[11px] text-slate-400">{(m.created_at || "").slice(0, 10)}</span>
                      <button onClick={() => removeMsg(m.id)} data-testid="contact-delete-message" className="text-slate-300 hover:text-red-600"><Trash2 size={15} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
