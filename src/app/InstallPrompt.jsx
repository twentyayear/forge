import React, { useEffect, useState } from "react";
import { Share, SquarePlus } from "lucide-react";
import { T } from "../theme.js";
import { Button, Mark, Sheet } from "../ui/index.js";

const DISMISS_KEY = "workhart.installDismissed";

function isStandalone() {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  } catch { return false; }
}
// iPADOS REPORTS ITSELF AS A MAC; THE TOUCH-POINT CHECK CATCHES IT.
function isIOS() {
  const ua = window.navigator.userAgent || "";
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1);
}
function readDismissed() {
  try { return window.localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [installed, setInstalled] = useState(isStandalone);
  const [steps, setSteps] = useState(false);
  const ios = isIOS();

  useEffect(() => {
    // CHROME FIRES THIS ONCE PER PAGE LOAD; preventDefault KEEPS ITS MINI-BAR AWAY SO OUR CARD ASKS INSTEAD.
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try { window.localStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
  };
  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* closed */ }
    setDeferred(null);
  };

  if (installed || dismissed || (!deferred && !ios)) return null;

  return (
    <>
      <aside aria-label="Install WORKHART" className="wh-rise"
        style={{ position: "fixed", zIndex: 45, left: "50%", transform: "translateX(-50%)", width: `calc(100% - ${T.space[4] * 2}px)`, maxWidth: 398,
          bottom: `calc(${T.space[8] * 2 + T.space[2]}px + env(safe-area-inset-bottom))`,
          background: T.color.surface, border: `1px solid ${T.color.energy}`, borderRadius: T.radius.card, padding: T.space[4],
          boxShadow: `0 12px 32px -12px ${T.color.scrim}`, fontFamily: T.font.body, color: T.color.text }}>
        <div style={{ display: "flex", gap: T.space[3], alignItems: "center" }}>
          <Mark height={22} />
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontFamily: T.font.display, fontWeight: 800, fontSize: 18, textTransform: "uppercase", letterSpacing: ".04em", lineHeight: 1 }}>Install WORKHART</p>
            <p style={{ margin: `${T.space[1]}px 0 0`, color: T.color.body, fontSize: T.type.small, lineHeight: 1.35 }}>Open it from your home screen, full screen, like any app.</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: T.space[2], marginTop: T.space[3] }}>
          <Button variant="ghost" onClick={dismiss} style={{ flex: 1 }}>Not now</Button>
          {deferred
            ? <Button onClick={install} style={{ flex: 1 }}>Install</Button>
            : <Button onClick={() => setSteps(true)} style={{ flex: 1 }}>Show me how</Button>}
        </div>
      </aside>

      {steps && (
        <Sheet title="Add to Home Screen" onClose={() => setSteps(false)}>
          <ol style={{ listStyle: "none", margin: `${T.space[4]}px 0 0`, padding: 0, display: "grid", gap: T.space[3] }}>
            {[
              [Share, <>Tap <strong style={{ color: T.color.text }}>Share</strong> in Safari's toolbar.</>],
              [SquarePlus, <>Scroll down and tap <strong style={{ color: T.color.text }}>Add to Home Screen</strong>.</>],
              [null, <>Tap <strong style={{ color: T.color.text }}>Add</strong>. WORKHART is now on your home screen.</>],
            ].map(([Icon, text], i) => (
              <li key={i} style={{ display: "flex", gap: T.space[3], alignItems: "center", background: T.color.surface2, borderRadius: T.radius.control, padding: T.space[3] }}>
                <span style={{ width: 32, height: 32, borderRadius: "50%", background: T.color.energy, color: T.color.inkOnEnergy, flex: "none",
                  display: "grid", placeItems: "center", fontFamily: T.font.display, fontWeight: 800, fontSize: 16 }}>{i + 1}</span>
                <span style={{ flex: 1, color: T.color.body, fontSize: T.type.body, lineHeight: 1.4 }}>{text}</span>
                {Icon && <Icon size={20} color={T.color.energy} aria-hidden="true" />}
              </li>
            ))}
          </ol>
          <Button variant="quiet" full onClick={() => { setSteps(false); dismiss(); }} style={{ marginTop: T.space[5] }}>Done</Button>
        </Sheet>
      )}
    </>
  );
}
