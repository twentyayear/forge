import React, { useCallback, useEffect, useRef, useState } from "react";
import { Dumbbell, Flame, Home, MessageSquare, User } from "lucide-react";
import { T } from "../theme.js";
import { Button, Mark, TabBar, Toast } from "../ui/index.js";
import { useBootstrap } from "./useBootstrap.js";
import { useSpeaker } from "./useSpeaker.js";
import { Checkin } from "./Checkin.jsx";
import { Today } from "./Today.jsx";
import { Train } from "./Train.jsx";
import { Coach } from "./Coach.jsx";
import { Fuel } from "./Fuel.jsx";
import { You } from "./You.jsx";
import { call } from "./net.js";
import { dayOf, todayStr } from "./engine.js";

const ITEMS = [
  { id: "today", label: "Today", icon: Home },
  { id: "train", label: "Train", icon: Dumbbell },
  { id: "coach", label: "Coach", icon: MessageSquare },
  { id: "fuel", label: "Fuel", icon: Flame },
  { id: "you", label: "You", icon: User },
];

const skipKey = (day) => `workhart.checkinSkipped.${day}`;
function wasSkipped(day) {
  try { return sessionStorage.getItem(skipKey(day)) === "1"; } catch { return false; }
}

const frame = { minHeight: "100dvh", background: T.color.bg, color: T.color.body, fontFamily: T.font.body };

export function ClientShell({ session, onSignedOut }) {
  const { data, loading, error, refetch: reload } = useBootstrap(session, onSignedOut);
  // THE PROFILE IS THE RECORD FOR THE VOICE SWITCH. THE OLD BROWSER-LOCAL KEY IS READ ONCE, AS A FALLBACK FOR A PROFILE THAT HAS NEVER SET IT, THEN REMOVED.
  const [legacyVoice] = useState(() => { try { return localStorage.getItem("workhart.voiceOn"); } catch { return null; } });
  const [voiceOverride, setVoiceOverride] = useState(null);
  const profileVoice = data?.profile?.voiceOn;
  const voiceOn = voiceOverride ?? (typeof profileVoice === "boolean" ? profileVoice : legacyVoice !== "0");
  const speaker = useSpeaker(voiceOn);
  const [tab, setTab] = useState("today");
  const [again, setAgain] = useState(false);
  const [skipped, setSkipped] = useState(() => wasSkipped(todayStr()));
  const [justChecked, setJustChecked] = useState(false);
  const [toast, setToast] = useState("");
  const clearToast = useCallback(() => setToast(""), []);

  const saveVoice = useCallback(async (v) => {
    const res = await call("/api/profile", { method: "PATCH", body: JSON.stringify({ voiceOn: v }) }, onSignedOut);
    return res.ok;
  }, [onSignedOut]);
  const changeVoice = useCallback(async (v) => {
    setVoiceOverride(v);
    if (!v) speaker.stop();
    if (await saveVoice(v)) { reload(); }
    else { setVoiceOverride(null); setToast("Couldn't save the voice setting. Try again."); }
  }, [saveVoice, reload, speaker]);

  // ONE-TIME MIGRATION OF THE OLD LOCAL SWITCH: A LOCAL "0" IS SAVED TO THE PROFILE, THEN THE KEY GOES AWAY.
  const migrated = useRef(false);
  useEffect(() => {
    if (!data || migrated.current) return;
    migrated.current = true;
    if (legacyVoice === null) return;
    (async () => {
      if (typeof data.profile?.voiceOn === "boolean" || legacyVoice !== "0" || (await saveVoice(false))) {
        try { localStorage.removeItem("workhart.voiceOn"); } catch { /* storage unavailable */ }
      }
    })();
  }, [data, legacyVoice, saveVoice]);
  if (!data) {
    return (
      <div style={{ ...frame, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: T.space[4], padding: T.space[4] }}>
        <Mark height={54} />
        {loading && <span role="status" style={{ color: T.color.muted }}>Loading</span>}
        {error && (
          <>
            <p role="alert" style={{ margin: 0, color: T.color.warn, textAlign: "center" }}>{error}</p>
            <Button variant="quiet" onClick={reload}>Try again</Button>
          </>
        )}
      </div>
    );
  }

  const day = todayStr();
  const hasCheckin = justChecked || data.checkins.some((c) => dayOf(c.day) === day);
  if (!hasCheckin && !skipped) {
    return (
      <>
        <Checkin day={day} onSignedOut={onSignedOut}
          onSkip={() => { try { sessionStorage.setItem(skipKey(day), "1"); } catch { /* storage unavailable */ } setSkipped(true); }}
          onDone={(row) => {
            setJustChecked(true);
            const first = row?.earned?.[0];
            if (first) setToast(`Earned: ${first.title}`);
            reload();
          }} />
        <Toast message={toast} tone="good" onDone={clearToast} />
      </>
    );
  }

  const select = (id) => { if (id !== "train") setAgain(false); setTab(id); };

  return (
    <div style={frame}>
      <main style={{ maxWidth: 430, margin: "0 auto", padding: `${T.space[4]}px ${T.space[4]}px calc(${T.space[8] * 3}px + env(safe-area-inset-bottom))`, display: "flex", flexDirection: "column", gap: T.space[3] }}>
        {tab === "today" && (
          <Today data={data} session={session} speaker={speaker} onSignedOut={onSignedOut}
            onSelect={select}
            onCheckin={() => { setSkipped(false); setJustChecked(false); try { sessionStorage.removeItem(skipKey(day)); } catch { /* storage unavailable */ } }}
            onTrainAgain={() => { setAgain(true); setTab("train"); }} />
        )}
        {tab === "train" && (
          <Train key={again ? "again" : "once"} data={data} session={session} speaker={speaker} again={again} reload={reload} onSignedOut={onSignedOut}
            onFinished={() => { setAgain(false); setTab("today"); }}
            onLeave={(to) => { if (to === "again") setAgain(true); else { setAgain(false); setTab("today"); } }} />
        )}
        {tab === "coach" && <Coach data={data} speaker={speaker} reload={reload} onSignedOut={onSignedOut} />}
        {tab === "fuel" && <Fuel data={data} speaker={speaker} reload={reload} onSignedOut={onSignedOut} />}
        {tab === "you" && <You data={data} voiceOn={voiceOn} onVoiceChange={changeVoice} reload={reload} onSignedOut={onSignedOut} />}
      </main>
      <TabBar items={ITEMS.map((i) => (i.id === "coach" ? { ...i, badge: data.unreadMessages } : i))} active={tab} onSelect={select} />
      <Toast message={toast} tone="good" onDone={clearToast} />
    </div>
  );
}
