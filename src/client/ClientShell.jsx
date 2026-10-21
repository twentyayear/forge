import React, { useCallback, useState } from "react";
import { Dumbbell, Flame, Home, MessageSquare, User } from "lucide-react";
import { T } from "../theme.js";
import { Button, Mark, TabBar, Toast } from "../ui/index.js";
import Workhart from "../Workhart.jsx";
import { useBootstrap } from "./useBootstrap.js";
import { useSpeaker } from "./useSpeaker.js";
import { Checkin } from "./Checkin.jsx";
import { Today } from "./Today.jsx";
import { Train } from "./Train.jsx";
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
  // THE VOICE SWITCH LIVES IN THIS BROWSER: THE PROFILE WHITELIST ON THE SERVER HAS NO voiceOn FIELD TO STORE IT IN.
  const [voiceLocal, setVoiceLocal] = useState(() => { try { return localStorage.getItem("workhart.voiceOn") !== "0"; } catch { return true; } });
  const voiceOn = data?.profile?.voiceOn !== false && voiceLocal;
  const speaker = useSpeaker(voiceOn);
  const changeVoice = useCallback((v) => {
    setVoiceLocal(v);
    try { localStorage.setItem("workhart.voiceOn", v ? "1" : "0"); } catch { /* storage unavailable */ }
  }, []);
  const [tab, setTab] = useState("today");
  const [again, setAgain] = useState(false);
  const [skipped, setSkipped] = useState(() => wasSkipped(todayStr()));
  const [justChecked, setJustChecked] = useState(false);
  const [toast, setToast] = useState("");
  const clearToast = useCallback(() => setToast(""), []);

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
  const legacy = tab === "coach" || tab === "fuel" || tab === "you";

  return (
    <div style={frame}>
      {legacy ? (
        <Workhart key={tab} session={session} onSignedOut={onSignedOut} forcedTab={tab} voiceOn={voiceOn} onVoiceChange={changeVoice} />
      ) : (
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
        </main>
      )}
      <TabBar items={ITEMS.map((i) => (i.id === "coach" ? { ...i, badge: data.unreadMessages } : i))} active={tab} onSelect={select} />
      <Toast message={toast} tone="good" onDone={clearToast} />
    </div>
  );
}
