import React, { useState } from "react";
import { T } from "../theme.js";
import { api } from "../lib/api.js";
import { Button } from "../ui/index.js";

const fieldLabel = {
  display: "block", fontFamily: T.font.display, fontWeight: 700, fontSize: T.type.label,
  letterSpacing: ".1em", textTransform: "uppercase", color: T.color.muted, marginBottom: T.space[2],
};
// 16 PX TEXT IN THE FIELDS STOPS iOS SAFARI ZOOMING THE PAGE ON FOCUS.
const field = {
  width: "100%", boxSizing: "border-box", minHeight: 48, padding: `0 ${T.space[4]}px`,
  background: T.color.surface2, border: `1px solid ${T.color.line}`, borderRadius: T.radius.control,
  color: T.color.text, fontFamily: T.font.body, fontSize: 16, outline: "none",
};

export function Login({ expired = false, onSignedIn }) {
  const [stage, setStage] = useState("form"); // "form" | "sent"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(null); // null | "password" | "link"
  const [error, setError] = useState("");
  const emailOk = email.trim().length > 0;

  const signIn = async (e) => {
    e.preventDefault();
    if (!emailOk || !password || busy) return;
    setBusy("password"); setError("");
    try {
      const res = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: email.trim(), password }) });
      setPassword("");
      if (res.ok) { await onSignedIn(); return; }
      if (res.status === 401) setError("That email and password don't match. Check both, or get a sign-in link instead.");
      else if (res.status === 429) setError("Too many tries. Wait a few minutes, then sign in again.");
      else setError("We couldn't sign you in just now. Try again in a moment.");
    } catch {
      setPassword("");
      setError("No connection. Check your signal, then try again.");
    }
    setBusy(null);
  };

  const sendLink = async () => {
    if (!emailOk || busy) return;
    setBusy("link"); setError("");
    try {
      const res = await api("/api/auth/request-link", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
      if (res.ok) setStage("sent");
      else if (res.status === 429) setError("Too many links asked for. Wait a few minutes, then try again.");
      else setError("We couldn't send a link just now. Try again in a moment.");
    } catch {
      setError("No connection. Check your signal, then try again.");
    }
    setBusy(null);
  };

  return (
    <main style={{ minHeight: "100dvh", background: T.color.bg, color: T.color.text, fontFamily: T.font.body,
      display: "flex", alignItems: "center", justifyContent: "center", padding: `${T.space[6]}px ${T.space[4]}px` }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <img src="/brand/workhart_lockup.png" alt="WORKHART"
          style={{ display: "block", height: 44, width: "auto", maxWidth: "100%", margin: `0 0 ${T.space[8]}px` }} />

        {expired && stage === "form" && (
          <div role="alert" style={{ background: T.color.warnBg, color: T.color.warn, borderRadius: T.radius.control,
            padding: `${T.space[3]}px ${T.space[4]}px`, fontSize: T.type.small + 1, lineHeight: 1.4, marginBottom: T.space[5] }}>
            That sign-in link has expired. Ask for a new one below.
          </div>
        )}

        {stage === "form" ? (
          <form onSubmit={signIn} noValidate>
            <h1 style={{ margin: `0 0 ${T.space[5]}px`, fontFamily: T.font.display, fontWeight: 800, fontSize: T.type.display, lineHeight: 0.95, textTransform: "uppercase", letterSpacing: ".02em" }}>
              Sign in
            </h1>
            <label htmlFor="wh-email" style={fieldLabel}>Email</label>
            <input id="wh-email" className="wh-field" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false}
              value={email} onChange={(e) => setEmail(e.target.value)} style={field} />
            <label htmlFor="wh-password" style={{ ...fieldLabel, marginTop: T.space[4] }}>Password</label>
            <input id="wh-password" className="wh-field" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} style={field} />

            {error && (
              <p role="alert" style={{ margin: `${T.space[3]}px 0 0`, color: T.color.warn, fontSize: T.type.small + 1, lineHeight: 1.4 }}>{error}</p>
            )}

            <Button type="submit" full busy={busy === "password"} disabled={!emailOk || !password || busy === "link"} style={{ marginTop: T.space[5] }}>
              {busy === "password" ? "Signing in…" : "Sign in"}
            </Button>
            <Button variant="ghost" full onClick={sendLink} busy={busy === "link"} disabled={!emailOk || busy === "password"} style={{ marginTop: T.space[3] }}>
              {busy === "link" ? "Sending…" : "Email me a link instead"}
            </Button>
            {!emailOk && (
              <p style={{ margin: `${T.space[3]}px 0 0`, color: T.color.muted, fontSize: T.type.small, textAlign: "center" }}>
                Enter your email to get a link.
              </p>
            )}
          </form>
        ) : (
          <div aria-live="polite">
            <h1 style={{ margin: 0, fontFamily: T.font.display, fontWeight: 800, fontSize: T.type.display, lineHeight: 0.95, textTransform: "uppercase", letterSpacing: ".02em" }}>
              Check your email
            </h1>
            <p style={{ margin: `${T.space[3]}px 0 0`, color: T.color.body, fontSize: T.type.body, lineHeight: 1.5 }}>
              If <strong style={{ color: T.color.text, fontWeight: 600 }}>{email.trim()}</strong> has an account, a sign-in link is on its way. Open it on this device.
            </p>
            <Button variant="ghost" full onClick={() => { setStage("form"); setError(""); }} style={{ marginTop: T.space[6] }}>
              Use a different email
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
