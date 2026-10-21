import React, { useCallback, useEffect, useState } from "react";
import { T } from "../theme.js";
import { api } from "../lib/api.js";
import { Mark, UiStyles } from "../ui/index.js";
import { Login } from "./Login.jsx";
import { LegacyShell } from "./LegacyShell.jsx";
import { InstallPrompt } from "./InstallPrompt.jsx";

// THE MAGIC-LINK VERIFIER REDIRECTS HERE WITH ?auth=expired; READ IT ONCE, THEN CLEAN THE URL SO A RELOAD DOESN'T REPEAT IT.
function takeExpiredFlag() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") !== "expired") return false;
    params.delete("auth");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
    return true;
  } catch { return false; }
}

export default function App() {
  const [auth, setAuth] = useState({ stage: "boot", me: null }); // boot | out | in
  const [expired] = useState(takeExpiredFlag);

  const checkSession = useCallback(async () => {
    try {
      const res = await api("/api/auth/me");
      if (res.status === 200 && res.data && res.data.id) setAuth({ stage: "in", me: res.data });
      else setAuth({ stage: "out", me: null });
    } catch {
      setAuth({ stage: "out", me: null });
    }
  }, []);

  useEffect(() => { checkSession(); }, [checkSession]);
  const signedOut = useCallback(() => setAuth({ stage: "out", me: null }), []);

  return (
    <>
      <UiStyles />
      {auth.stage === "boot" && (
        <div aria-busy="true" aria-label="Loading WORKHART"
          style={{ minHeight: "100dvh", background: T.color.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Mark height={54} />
        </div>
      )}
      {auth.stage === "out" && <Login expired={expired} onSignedIn={checkSession} />}
      {auth.stage === "in" && (
        <>
          <LegacyShell mode={auth.me.role === "admin" ? "trainer" : "client"} session={auth.me} onSignedOut={signedOut} />
          <InstallPrompt />
        </>
      )}
    </>
  );
}
