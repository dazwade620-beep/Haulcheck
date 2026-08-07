import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MessageSquareHeart, Bug, Lightbulb, MessageSquare, Star, Send, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const CATEGORIES = [
  { id: "general", label: "General feedback", icon: MessageSquare },
  { id: "bug", label: "Report an issue", icon: Bug },
  { id: "feature", label: "Suggest a feature", icon: Lightbulb },
];

const CAT_META = {
  general: { label: "General", cls: "bg-slate-100 text-slate-700" },
  bug: { label: "Issue", cls: "bg-red-100 text-red-700" },
  feature: { label: "Feature idea", cls: "bg-emerald-100 text-emerald-700" },
};

export default function Feedback() {
  const { user } = useAuth();
  const [category, setCategory] = useState("general");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [items, setItems] = useState([]);

  const load = async () => {
    try { const { data } = await api.get("/feedback"); setItems(data); } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return toast.error("Please add a short message");
    setBusy(true);
    try {
      await api.post("/feedback", { category, rating: rating || null, subject: subject.trim(), message: message.trim() });
      setSent(true);
      setCategory("general"); setRating(0); setSubject(""); setMessage("");
      toast.success("Thanks — your feedback has been sent!");
      load();
    } catch { toast.error("Could not send feedback. Please try again."); }
    setBusy(false);
  };

  const remove = async (id) => {
    try { await api.delete(`/feedback/${id}`); setItems((m) => m.filter((x) => x.id !== id)); }
    catch { toast.error("Could not delete"); }
  };

  return (
    <div className="max-w-3xl mx-auto" data-testid="feedback-page">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center"><MessageSquareHeart size={22} /></span>
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-black tracking-tight text-slate-900">Help us improve HaulCheck</h1>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-semibold mt-1">Feedback</p>
        </div>
      </div>
      <p className="mt-4 text-slate-600 text-base leading-relaxed">
        We're always looking for ways to make HaulCheck better. Share your feedback, report any issues, or suggest new features. Your input helps us improve the platform and ensure it continues to meet your compliance needs.
      </p>

      <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
        {sent ? (
          <div data-testid="feedback-success" className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto"><CheckCircle2 size={24} /></div>
            <h2 className="font-heading text-xl font-bold text-slate-900 mt-4">Thank you!</h2>
            <p className="text-slate-500 text-sm mt-2">Thank you for helping us improve HaulCheck. We read every message.</p>
            <button onClick={() => setSent(false)} className="mt-5 text-sm font-semibold text-slate-900 hover:underline" data-testid="feedback-send-another">Send more feedback</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-6">
            <div>
              <Label className="mb-2 block">What's this about?</Label>
              <div className="grid sm:grid-cols-3 gap-3" data-testid="feedback-categories">
                {CATEGORIES.map((c) => (
                  <button type="button" key={c.id} data-testid={`feedback-cat-${c.id}`} onClick={() => setCategory(c.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-all",
                      category === c.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"
                    )}>
                    <c.icon size={17} /> {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">How would you rate HaulCheck? <span className="text-slate-400 font-normal">(optional)</span></Label>
              <div className="flex items-center gap-1.5" data-testid="feedback-rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button type="button" key={n} data-testid={`feedback-star-${n}`}
                    onClick={() => setRating(n === rating ? 0 : n)}
                    onMouseEnter={() => setHoverRating(n)} onMouseLeave={() => setHoverRating(0)}
                    className="p-0.5 transition-transform hover:scale-110">
                    <Star size={26} className={cn("transition-colors", (hoverRating || rating) >= n ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="fb-subject">Subject <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Input id="fb-subject" data-testid="feedback-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="A short summary" className="mt-1.5" />
            </div>

            <div>
              <Label htmlFor="fb-message">Your feedback</Label>
              <Textarea id="fb-message" data-testid="feedback-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={5} className="mt-1.5"
                placeholder="Tell us what's working well, what's not, or what you'd love to see next…" />
            </div>

            <Button type="submit" data-testid="feedback-submit" disabled={busy} className="w-full bg-slate-900 hover:bg-slate-800 gap-2">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send feedback
            </Button>
          </form>
        )}
      </div>

      {items.length > 0 && (
        <div className="mt-10" data-testid="feedback-list">
          <h2 className="font-heading text-lg font-bold text-slate-900">
            {user?.is_admin ? "All feedback" : "Your feedback"} <span className="text-slate-400 font-normal">({items.length})</span>
          </h2>
          <div className="mt-4 space-y-3">
            {items.map((m) => (
              <div key={m.id} data-testid="feedback-row" className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5", (CAT_META[m.category] || CAT_META.general).cls)}>
                        {(CAT_META[m.category] || CAT_META.general).label}
                      </span>
                      {m.rating ? (
                        <span className="flex items-center gap-0.5 text-amber-400">
                          {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={12} className={n <= m.rating ? "fill-amber-400" : "text-slate-200"} />)}
                        </span>
                      ) : null}
                      {user?.is_admin && m.email && <span className="text-xs text-slate-400">{m.name} &lt;{m.email}&gt;</span>}
                    </div>
                    {m.subject && <p className="font-semibold text-slate-900 text-sm mt-2">{m.subject}</p>}
                    <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{m.message}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-[11px] text-slate-400">{(m.created_at || "").slice(0, 10)}</span>
                    <button onClick={() => remove(m.id)} data-testid="feedback-delete" className="text-slate-300 hover:text-red-600"><Trash2 size={15} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
