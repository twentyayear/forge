import React from "react";
import Workhart from "../Workhart.jsx";

// THE PRE-OVERHAUL SCREENS RUN HERE UNTIL W.10 REPLACES THEM; mode IS ALREADY DECIDED BY THE SESSION ROLE.
// view, WHEN SET, RENDERS ONLY THAT CONSOLE AREA (build | inbox | drafts | you) WITH NO LEGACY NAV; THE TRAINER SHELL OWNS THE NAV.
export function LegacyShell({ mode, session, onSignedOut, view }) {
  return <Workhart key={`${mode}:${session.id}:${view || ""}`} session={session} onSignedOut={onSignedOut} forcedView={view} />;
}
