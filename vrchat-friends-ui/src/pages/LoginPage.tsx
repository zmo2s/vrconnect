import { vrchatFetch, hasRememberedLogin, forgetLogin } from "@/lib/vrchat-api";
import { FormEvent, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Gamepad2, Loader2, ShieldCheck } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [twoFactor, setTwoFactor] = useState(false);
  const [method, setMethod] = useState("emailOtp");
  const [remembered, setRemembered] = useState(hasRememberedLogin);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      const response = await vrchatFetch(`http://localhost:5000/vrchat/${twoFactor ? (method === "totp" ? "2fa/totp" : "2fa/email") : "login"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(twoFactor ? { code } : { username, password }) });
      const data = await response.json();
      if (!twoFactor && data.requiresTwoFactorAuth?.length) {
        const supported = data.requiresTwoFactorAuth.includes("emailOtp") ? "emailOtp" : data.requiresTwoFactorAuth.includes("totp") ? "totp" : null;
        if (!supported) throw new Error("This verification method is not supported yet.");
        setMethod(supported); setTwoFactor(true); setPassword(""); return;
      }
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to sign in. Please try again.");
      if (data.token) localStorage.setItem("token", data.token);
      const userId = data.userId || data.data?.id;
      if (userId) localStorage.setItem("userId", userId);
      localStorage.setItem("vrchat-session", "connected");
      queryClient.clear();
      navigate("/Index");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not reach the server."); }
    finally { setBusy(false); }
  }
  async function resume() {
    setBusy(true); setError("");
    try {
      const response = await vrchatFetch("http://localhost:5000/vrchat/resume", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.success || !data.data?.id) throw new Error(data.error || "Please sign in again.");
      localStorage.setItem("userId", data.data.id);
      localStorage.setItem("vrchat-session", "connected");
      queryClient.clear(); navigate("/Index");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not restore your login."); }
    finally { setBusy(false); }
  }
  async function forget() {
    setBusy(true); setError("");
    try { await forgetLogin(); localStorage.removeItem("vrchat-session"); setRemembered(false); queryClient.clear(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not sign out."); }
    finally { setBusy(false); }
  }  return <main className="login-page"><Link to="/" className="absolute left-5 top-5 flex h-9 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ArrowLeft size={16} /> Back to friends</Link><ThemeToggle className="login-theme" /><Card className="login-card"><div className="brand-icon mx-auto mb-6"><Gamepad2 /></div><div className="text-center mb-8"><div className="eyebrow">WELCOME TO VRCONNECT</div><h1 className="text-3xl font-semibold mt-3 mb-3">{twoFactor ? "One more little step." : "Your people are waiting."}</h1><p className="text-sm text-muted-foreground">{twoFactor ? (method === "totp" ? "Enter the code from your authenticator app." : "Enter the verification code sent to your email.") : "Connect your VRChat account to see who’s around."}</p></div><form className="space-y-5" onSubmit={submit}>{!twoFactor && remembered && <div className="space-y-2"><Button type="button" className="w-full" disabled={busy} onClick={resume}>Continue saved login</Button><Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={forget}>Forget saved login</Button></div>}{twoFactor ? <div className="space-y-2"><Label htmlFor="code">{method === "totp" ? "Authenticator code" : "Email verification code"}</Label><Input id="code" autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9 ]*" maxLength={8} placeholder="123456" className="h-12 text-center text-lg tracking-[0.4em]" required value={code} onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ""))} /></div> : <><div className="space-y-2"><Label htmlFor="username">Username</Label><Input id="username" autoFocus={!remembered} autoComplete="username" placeholder="Your VRChat username" required value={username} onChange={e => setUsername(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="password">Password</Label><div className="relative"><Input id="password" autoComplete="current-password" type={showPassword ? "text" : "password"} placeholder="Enter your password" className="pr-11" required value={password} onChange={e => setPassword(e.target.value)} /><button type="button" className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div></>}{error && <p role="alert" className="text-sm">{error}</p>}<Button className="w-full" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}{twoFactor ? "Verify & connect" : "Connect VRChat"}</Button>{twoFactor && <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => { setTwoFactor(false); setCode(""); setError(""); }}>Back to login</Button>}</form><p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={14} /> Connects through your local companion API</p></Card></main>;
}


