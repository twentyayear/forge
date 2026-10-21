import React, { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardList, Inbox, Tag, User, Users } from "lucide-react";
import { T } from "../theme.js";
import { Card, TabBar, Toast } from "../ui/index.js";
import { kicker, muted } from "../client/styles.js";
import { useRoster } from "./useRoster.js";
import { Roster } from "./Roster.jsx";
import { Client } from "./Client.jsx";
import { AddClientSheet } from "./AddClientSheet.jsx";
import { Build } from "./Build.jsx";
import { Inbox as InboxScreen } from "./Inbox.jsx";
import { Offers } from "./Offers.jsx";
import { You } from "./You.jsx";
import { pickArray, useGet } from "./useGet.js";
import { inboxBadge } from "./trainer.js";

const ITEMS = [
  { id: "roster", label: "Roster", icon: Users },
  { id: "build", label: "Build", icon: ClipboardList },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "offers", label: "Offers", icon: Tag },
  { id: "you", label: "You", icon: User },
];

const WIDE = "(min-width: 901px)";

function useWide() {
  const [wide, setWide] = useState(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(WIDE).matches : false));
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

export function TrainerShell({ session, onSignedOut }) {
  const roster = useRoster(onSignedOut);
  const wide = useWide();
  const [tab, setTab] = useState("roster");
  const [clientId, setClientId] = useState(null);
  const [nav, setNav] = useState({ view: "inbox", thread: null, compose: false });
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState("");
  const clearToast = useCallback(() => setToast(""), []);

  // THE ROSTER (AND ITS NEEDS-YOU COUNTS) IS REFETCHED EVERY TIME THE TRAINER COMES BACK TO IT FROM ANOTHER TAB.
  const first = useRef(true);
  const reloadRoster = roster.refetch;
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (tab === "roster") reloadRoster();
  }, [tab, reloadRoster]);

  // THE INBOX TAB BADGE: UNREAD THREADS PLUS DRAFTS WAITING, FETCHED ONCE ON MOUNT AND AGAIN EACH TIME THE TAB OPENS.
  const inbox = useGet("/api/admin/inbox", onSignedOut, pickArray);
  const drafts = useGet("/api/admin/drafts", onSignedOut, pickArray);
  const reloadInbox = inbox.reload;
  const reloadDrafts = drafts.reload;
  const seen = useRef(false);
  useEffect(() => {
    if (!seen.current) { seen.current = true; return; }
    if (tab === "inbox") { reloadInbox(); reloadDrafts(); }
  }, [tab, reloadInbox, reloadDrafts]);
  const changed = useCallback(() => { reloadRoster(); reloadInbox(); reloadDrafts(); }, [reloadRoster, reloadInbox, reloadDrafts]);
  const badge = inboxBadge(inbox.data, drafts.data);
  const select = (id) => { if (id === "inbox") setNav({ view: "inbox", thread: null, compose: false }); setTab(id); };
  const openDrafts = () => { setNav({ view: "drafts", thread: null, compose: false }); setTab("inbox"); };
  const openThread = (thread) => { setNav({ view: "inbox", thread, compose: false }); setTab("inbox"); };
  const patchNav = (patch) => setNav((cur) => ({ ...cur, ...patch }));
  const clients = roster.data ? roster.data.clients : null;

  const frame = { minHeight: "100dvh", background: T.color.bg, color: T.color.body, fontFamily: T.font.body };
  const pad = { padding: `${T.space[4]}px ${T.space[4]}px calc(${T.space[8] * 3}px + env(safe-area-inset-bottom))` };

  const narrowMain = { ...pad, maxWidth: 430, margin: "0 auto" };

  let body;
  if (tab === "roster") {
    const rosterEl = (
      <Roster roster={roster} session={session} selectedId={clientId} onOpenClient={setClientId} onOpenDrafts={openDrafts} onAdd={() => setAdding(true)} />
    );
    const clientEl = clientId && (
      <Client key={clientId} id={clientId} narrow={!wide} onBack={() => setClientId(null)} onSignedOut={onSignedOut} onChanged={reloadRoster} />
    );
    body = wide ? (
      <main style={{ ...pad, maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(0, 380px) minmax(0, 1fr)", gap: T.space[7], alignItems: "start" }}>
        {rosterEl}
        {clientEl || (
          <Card style={{ padding: T.space[5], marginTop: T.space[8] }}>
            <p style={kicker}>No client open</p>
            <p style={{ ...muted, margin: `${T.space[2]}px 0 0`, fontSize: T.type.body }}>Pick someone from the roster to see their week, readiness and conversation.</p>
          </Card>
        )}
      </main>
    ) : (
      <main style={{ ...pad, maxWidth: 430, margin: "0 auto" }}>{clientEl || rosterEl}</main>
    );
  } else if (tab === "build") {
    body = <main style={narrowMain}><Build clients={clients} onSignedOut={onSignedOut} notify={setToast} /></main>;
  } else if (tab === "inbox") {
    body = (
      <main style={narrowMain}>
        <InboxScreen nav={nav} onNav={patchNav} inbox={inbox} drafts={drafts} clients={clients} onChanged={changed} onSignedOut={onSignedOut} notify={setToast} />
      </main>
    );
  } else if (tab === "offers") {
    body = <main style={narrowMain}><Offers onSignedOut={onSignedOut} notify={setToast} onOpenThread={openThread} /></main>;
  } else {
    body = <main style={narrowMain}><You session={session} onSignedOut={onSignedOut} /></main>;
  }

  return (
    <div style={frame}>
      {body}
      <TabBar label="Trainer" items={ITEMS.map((i) => (i.id === "inbox" ? { ...i, badge } : i))} active={tab} onSelect={select} />
      {adding && (
        <AddClientSheet onClose={() => setAdding(false)} onSignedOut={onSignedOut}
          onAdded={(email) => { setAdding(false); setToast(`Link sent to ${email}`); reloadRoster(); }} />
      )}
      <Toast message={toast} tone={/^Couldn't/.test(toast) ? "warn" : "good"} onDone={clearToast} />
    </div>
  );
}
