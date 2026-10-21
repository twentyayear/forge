import React, { useState } from "react";
import { T } from "../theme.js";
import { Button, Card, Header } from "../ui/index.js";
import { call } from "../client/net.js";
import { muted } from "../client/styles.js";

export function You({ session, onSignedOut }) {
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    await call("/api/auth/logout", { method: "POST" });
    onSignedOut();
  };
  return (
    <section aria-label="You" style={{ display: "grid", gap: T.space[3], alignContent: "start" }}>
      <Header kicker="Your account" title="You" />
      <Card style={{ padding: T.space[4] }}>
        <p style={{ margin: 0, fontFamily: T.font.display, fontWeight: 800, fontSize: 24, color: T.color.text, lineHeight: 1.05 }}>{session.name || "Trainer"}</p>
        {session.email && <p style={{ ...muted, margin: `${T.space[1]}px 0 0`, fontSize: T.type.body, overflowWrap: "anywhere" }}>{session.email}</p>}
      </Card>
      <Button variant="ghost" busy={busy} onClick={signOut}>Sign out</Button>
    </section>
  );
}
