import React from "react";
import Workhart from "../Workhart.jsx";

// THE PRE-OVERHAUL SCREENS RUN HERE UNTIL W.7-W.10 REPLACE THEM; mode IS ALREADY DECIDED BY THE SESSION ROLE.
export function LegacyShell({ mode, session, onSignedOut }) {
  return <Workhart key={`${mode}:${session.id}`} session={session} onSignedOut={onSignedOut} />;
}
