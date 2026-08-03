import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Truck, ShieldCheck, MailCheck } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const [mode, setMode] = useState("login"); // login | register | forgot | verify
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();

  // Handle the one-click verification link: /verify-email?token=...&email=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const email = params.get("email");
    if (window.location.pathname === "/verify-email" && token && email) {
      setMode("verify");
      setSentTo(email);
      setVerifying(true);
      api.post("/auth/verify", { email, token, base_url: window.location.origin })
        .then((res) => {
          loginWithToken(res.data.token, res.data.user);
          toast.success("Email verified — welcome to HaulCheck!");
          navigate("/dashboard");
        })
        .catch(() => {
          toast.error("That verification link is invalid or has expired. Enter the code from your email instead.");
          setVerifying(false);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        await api.post("/auth/forgot-password", { email: form.email, base_url: window.location.origin });
        setSentTo(form.email);
        return;
      }
      if (mode === "register") {
        await api.post("/auth/register", { email: form.email, password: form.password, name: form.name, base_url: window.location.origin });
        setSentTo(form.email);
        setMode("verify");
        toast.success("Account created — check your email to verify");
        return;
      }
      // login
      const res = await api.post("/auth/login", { email: form.email, password: form.password });
      loginWithToken(res.data.token, res.data.user);
      navigate("/dashboard");
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (mode === "login" && detail === "email_not_verified") {
        setSentTo(form.email);
        setMode("verify");
        try { await api.post("/auth/resend-verification", { email: form.email, base_url: window.location.origin }); } catch { /* ignore */ }
        toast.message("Please verify your email — we've sent you a fresh code");
      } else {
        toast.error(detail || "Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    if (code.trim().length !== 6) return toast.error("Enter the 6-digit code");
    setBusy(true);
    try {
      const res = await api.post("/auth/verify", { email: sentTo, code: code.trim(), base_url: window.location.origin });
      loginWithToken(res.data.token, res.data.user);
      toast.success("Email verified — welcome to HaulCheck!");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid or expired code");
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    try {
      await api.post("/auth/resend-verification", { email: sentTo, base_url: window.location.origin });
      toast.success("A new code is on its way");
    } catch { toast.error("Could not resend the code"); }
  };

  const googleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between bg-slate-900 text-white p-12 overflow-hidden">
        <div
          className="absolute inset-0 opacity-25 bg-cover bg-center"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1766561993607-58d30bf6b86f?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/70 to-slate-900/40" />
        <div className="relative flex items-center gap-2">
          <Truck size={28} />
          <span className="font-heading font-black text-xl tracking-tight">HAULCHECK</span>
        </div>
        <div className="relative">
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tight leading-[1.05]">
            Keep your O-licence<br />bulletproof.
          </h1>
          <p className="mt-5 text-slate-300 max-w-md text-base">
            Track MOTs, driver CPC, tachograph hours, defect reports and operator documents — with AI risk scoring built for UK, Ireland &amp; EU road haulage operators.
          </p>
          <div className="mt-8 flex items-center gap-2 text-sm text-slate-400">
            <ShieldCheck size={18} /> DVSA, RSA &amp; EU-aligned compliance tracking
          </div>
        </div>
        <div className="relative text-xs text-slate-500 tracking-widest uppercase">Fleet Compliance Control Room</div>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-6 sm:p-10 bg-white">
        <div className="w-full max-w-md animate-in-up">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <Truck size={26} className="text-slate-900" />
            <span className="font-heading font-black text-lg tracking-tight">HAULCHECK</span>
          </div>

          {mode === "verify" ? (
            <div data-testid="verify-screen">
              <div className="w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center mb-5">
                <MailCheck size={22} />
              </div>
              <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Verify your email</h2>
              <p className="text-slate-500 mt-2 text-sm">
                We've sent a verification link and a 6-digit code to <span className="font-semibold text-slate-700">{sentTo}</span>. Click the link in the email, or enter the code below.
              </p>
              {verifying ? (
                <p className="mt-8 text-sm text-slate-500">Verifying your link…</p>
              ) : (
                <form onSubmit={verifyCode} className="space-y-4 mt-6">
                  <div>
                    <Label htmlFor="code">6-digit code</Label>
                    <Input data-testid="verify-code-input" id="code" inputMode="numeric" maxLength={6} required value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000" className="mt-1.5 tracking-[0.5em] text-center text-lg font-semibold" />
                  </div>
                  <Button data-testid="verify-submit-button" type="submit" disabled={busy}
                    className="w-full bg-black hover:bg-slate-800 text-white py-2.5 rounded-md font-semibold">
                    {busy ? "Verifying…" : "Verify & continue"}
                  </Button>
                  <div className="flex items-center justify-between text-sm">
                    <button type="button" data-testid="resend-code-button" onClick={resendCode}
                      className="font-semibold text-slate-500 hover:text-slate-900">Resend code</button>
                    <button type="button" data-testid="verify-back-button" onClick={() => { setMode("login"); setCode(""); }}
                      className="font-semibold text-slate-500 hover:text-slate-900">← Back to sign in</button>
                  </div>
                </form>
              )}
            </div>
          ) : (
          <>
          <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            {mode === "login" ? "Sign in" : mode === "register" ? "Create your account" : "Reset your password"}
          </h2>
          <p className="text-slate-500 mt-2 text-sm">
            {mode === "login" ? "Access your fleet compliance dashboard." : mode === "register" ? "Start tracking compliance in minutes." : "Enter your email and we'll send you a secure reset link."}
          </p>

          {mode !== "forgot" && (
          <div className="flex gap-2 mt-6 mb-6 bg-slate-100 p-1 rounded-md">
            <button
              data-testid="tab-login"
              onClick={() => setMode("login")}
              className={`flex-1 py-2 text-sm font-semibold rounded transition-all ${mode === "login" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
            >Sign In</button>
            <button
              data-testid="tab-register"
              onClick={() => setMode("register")}
              className={`flex-1 py-2 text-sm font-semibold rounded transition-all ${mode === "register" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
            >Register</button>
          </div>
          )}

          {mode === "forgot" && sentTo ? (
            <div data-testid="forgot-success" className="mt-8 rounded-md border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm text-slate-700 leading-relaxed">
                If an account exists for <span className="font-semibold">{sentTo}</span>, a password reset link is on its way. Check your inbox (and spam folder) — the link expires in 1 hour.
              </p>
              <button
                data-testid="back-to-login-button"
                onClick={() => { setMode("login"); setSentTo(""); }}
                className="mt-4 text-sm font-semibold text-slate-900 hover:underline"
              >← Back to sign in</button>
            </div>
          ) : (
          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <div>
                <Label htmlFor="name">Full name</Label>
                <Input data-testid="name-input" id="name" required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Alex Morgan" className="mt-1.5" />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input data-testid="email-input" id="email" type="email" required value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@fleet.co.uk" className="mt-1.5" />
            </div>
            {mode !== "forgot" && (
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "login" && (
                  <button
                    type="button"
                    data-testid="forgot-password-link"
                    onClick={() => { setMode("forgot"); setSentTo(""); }}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                  >Forgot password?</button>
                )}
              </div>
              <Input data-testid="password-input" id="password" type="password" required value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" className="mt-1.5" />
            </div>
            )}
            <Button data-testid="submit-auth-button" type="submit" disabled={busy}
              className="w-full bg-black hover:bg-slate-800 text-white py-2.5 rounded-md font-semibold">
              {busy ? "Please wait…" : mode === "login" ? "Sign In" : mode === "register" ? "Create Account" : "Send reset link"}
            </Button>
            {mode === "forgot" && (
              <button
                type="button"
                data-testid="back-to-login-link"
                onClick={() => { setMode("login"); setSentTo(""); }}
                className="w-full text-center text-sm font-semibold text-slate-500 hover:text-slate-900"
              >← Back to sign in</button>
            )}
          </form>
          )}

          {mode !== "forgot" && (
          <>
          <div className="flex items-center gap-3 my-6">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400 uppercase tracking-widest">or</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <Button data-testid="google-login-button" onClick={googleLogin} variant="outline"
            className="w-full py-2.5 rounded-md font-semibold border-slate-300 flex items-center justify-center gap-2">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="w-5 h-5" />
            Continue with Google
          </Button>

          <p className="text-center text-sm text-slate-500 mt-6">
            Are you a driver?{" "}
            <a data-testid="driver-app-link" href="/driver" className="font-semibold text-slate-900 underline underline-offset-4">Open the driver app</a>
          </p>
          </>
          )}
          <p className="text-center text-sm text-slate-400 mt-6">
            Questions?{" "}
            <a data-testid="contact-us-link" href="/contact" className="font-semibold text-slate-600 hover:text-slate-900 underline underline-offset-4">Contact us</a>
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
