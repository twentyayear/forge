import React from "react";
import { Share, SquarePlus, MoreVertical } from "lucide-react";
import { T } from "../theme.js";
import { Button } from "./Button.jsx";
import { Sheet } from "./Sheet.jsx";

const strong = { color: T.color.text };

// THE HOME-SCREEN STEPS, SHARED BY THE INSTALL CARD AND THE You TAB. iOS HAS NO INSTALL EVENT, SO IT GETS THE SHARE-SHEET STEPS; EVERYONE ELSE GETS THE BROWSER MENU STEPS.
export function InstallSheet({ ios, onClose, onDone }) {
  const steps = ios
    ? [
        [Share, <>Tap <strong style={strong}>Share</strong> in Safari's toolbar.</>],
        [SquarePlus, <>Scroll down and tap <strong style={strong}>Add to Home Screen</strong>.</>],
        [null, <>Tap <strong style={strong}>Add</strong>. WORKHART is now on your home screen.</>],
      ]
    : [
        [MoreVertical, <>Open your browser's <strong style={strong}>menu</strong>.</>],
        [SquarePlus, <>Tap <strong style={strong}>Install app</strong> or <strong style={strong}>Add to Home screen</strong>.</>],
        [null, <>Confirm. WORKHART is now on your home screen.</>],
      ];
  return (
    <Sheet title="Add to Home Screen" onClose={onClose}>
      <ol style={{ listStyle: "none", margin: `${T.space[4]}px 0 0`, padding: 0, display: "grid", gap: T.space[3] }}>
        {steps.map(([Icon, text], i) => (
          <li key={i} style={{ display: "flex", gap: T.space[3], alignItems: "center", background: T.color.surface2, borderRadius: T.radius.control, padding: T.space[3] }}>
            <span style={{ width: 32, height: 32, borderRadius: "50%", background: T.color.energy, color: T.color.inkOnEnergy, flex: "none",
              display: "grid", placeItems: "center", fontFamily: T.font.display, fontWeight: 800, fontSize: 16 }}>{i + 1}</span>
            <span style={{ flex: 1, color: T.color.body, fontSize: T.type.body, lineHeight: 1.4 }}>{text}</span>
            {Icon && <Icon size={20} color={T.color.energy} aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <Button variant="quiet" full onClick={onDone || onClose} style={{ marginTop: T.space[5] }}>Done</Button>
    </Sheet>
  );
}
