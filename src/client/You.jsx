import React, { useCallback, useState } from "react";
import { T } from "../theme.js";
import { Button, Card, Header, InstallSheet, Medal, Toast } from "../ui/index.js";
import { DEVICE_OPTIONS } from "../data/fuel.js";
import { isIOS, isStandalone } from "../app/InstallPrompt.jsx";
import { call } from "./net.js";
import { fillBlurb } from "./you.js";
import { field, fieldLabel, kicker, muted, sectionTitle } from "./styles.js";

// A REAL BUTTON WITH role="switch"; THE WHOLE ROW IS THE 44 PX TARGET.
function Switch({ on, onChange, label, hint }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="wh-btn" onClick={() => onChange(!on)}
      style={{ display: "flex", alignItems: "center", gap: T.space[3], width: "100%", minHeight: 56, padding: `${T.space[2]}px ${T.space[3]}px`, textAlign: "left", cursor: "pointer", font: "inherit",
        background: T.color.surface, border: `1px solid ${T.color.line}`, borderRadius: T.radius.card, color: T.color.text }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 600 }}>{label}</span>
        {hint && <span style={{ ...muted, display: "block" }}>{hint}</span>}
      </span>
      <span aria-hidden="true" style={{ width: 48, height: 28, borderRadius: 14, flexShrink: 0, position: "relative", background: on ? T.color.energy : T.color.surface2, border: `1px solid ${on ? T.color.energy : T.color.lineStrong}` }}>
        <span style={{ position: "absolute", top: 2, left: on ? 22 : 2, width: 22, height: 22, borderRadius: "50%", background: on ? T.color.inkOnEnergy : T.color.muted, transition: "left .15s ease-out" }} />
      </span>
    </button>
  );
}

const dateLabel = (ts) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function You({ data, voiceOn, onVoiceChange, reload, onSignedOut }) {
  const profile = data.profile || {};
  const [toast, setToast] = useState("");
  const clearToast = useCallback(() => setToast(""), []);
  const [emailOverride, setEmailOverride] = useState(null);
  const [deviceOverride, setDeviceOverride] = useState(null);
  const [install, setInstall] = useState(false);
  const emailOn = emailOverride ?? profile.emailMessages !== false;
  const device = deviceOverride ?? profile.device ?? "";

  const patch = async (body, rollback) => {
    const res = await call("/api/profile", { method: "PATCH", body: JSON.stringify(body) }, onSignedOut);
    if (!res.ok) { rollback(); setToast("Couldn't save that. Try again."); return false; }
    await reload();
    return true;
  };

  const changeEmail = (v) => { setEmailOverride(v); patch({ emailMessages: v }, () => setEmailOverride(null)); };
  const changeDevice = (v) => { setDeviceOverride(v); patch({ device: v }, () => setDeviceOverride(null)); };

  const signOut = async () => {
    await call("/api/auth/logout", { method: "POST" });
    onSignedOut();
  };

  const earned = [...(data.achievements || [])].sort((a, b) => Date.parse(b.earned_at) - Date.parse(a.earned_at));

  return (
    <>
      <Header kicker="Your account" title="You" />
      <Card style={{ padding: T.space[4] }}>
        <p style={{ margin: 0, fontFamily: T.font.display, fontWeight: 800, fontSize: 24, color: T.color.text, lineHeight: 1.05 }}>{data.user?.name || "Athlete"}</p>
        {data.user?.email && <p style={{ ...muted, margin: `${T.space[1]}px 0 0`, overflowWrap: "anywhere" }}>{data.user.email}</p>}
      </Card>

      <h2 style={sectionTitle}>Voice</h2>
      <Switch on={voiceOn} onChange={onVoiceChange} label="Kyle's voice" hint="Kyle speaks after each exercise and at the finish." />

      <h2 style={sectionTitle}>Email</h2>
      <Switch on={emailOn} onChange={changeEmail} label="Email me when a message from Kyle waits a day" />

      <h2 style={sectionTitle}>Device</h2>
      <div>
        <label htmlFor="you-device" style={fieldLabel}>Fitness device</label>
        <select id="you-device" className="wh-field" style={{ ...field, color: device ? T.color.text : T.color.muted }} value={device} onChange={(e) => changeDevice(e.target.value)}>
          <option value="" disabled>Choose a device</option>
          {DEVICE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      <h2 style={sectionTitle}>Achievements</h2>
      {earned.length ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: T.space[2] }}>
          {earned.map((a, i) => (
            <li key={`${a.id}-${a.dedupe_key ?? i}`} style={{ display: "flex", gap: T.space[3], alignItems: "center", background: T.color.surface, border: `1px solid ${T.color.line}`, borderRadius: T.radius.card, padding: T.space[3] }}>
              <Medal n={earned.length - i} size={40} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ margin: 0, fontFamily: T.font.display, fontWeight: 700, fontSize: 18, color: T.color.text, lineHeight: 1.1 }}>{a.title}</p>
                <p style={{ ...muted, margin: `2px 0 0` }}>{fillBlurb(a.blurb, a.context)}</p>
              </div>
              <span style={{ ...kicker, flexShrink: 0 }}>{dateLabel(a.earned_at)}</span>
            </li>
          ))}
        </ul>
      ) : <p style={{ ...muted, margin: 0, fontSize: T.type.body }}>Your first achievement is one session away.</p>}

      <div style={{ display: "grid", gap: T.space[2], marginTop: T.space[3] }}>
        {!isStandalone() && <Button variant="quiet" onClick={() => setInstall(true)}>Install on your phone</Button>}
        <Button variant="ghost" onClick={signOut}>Sign out</Button>
      </div>

      {install && <InstallSheet ios={isIOS()} onClose={() => setInstall(false)} />}
      <Toast message={toast} tone="warn" onDone={clearToast} />
    </>
  );
}
