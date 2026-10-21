import React from "react";
import { T } from "../theme.js";
import { Button, Chip, KyleLine } from "../ui/index.js";
import { fmtLbs, percentVs } from "./engine.js";

// THE SET-END MOMENT. text IS null WHILE THE LINE IS BEING WRITTEN; SPEECH IS STARTED BY THE CALLER ONCE THE TEXT LANDS AND A SPEECH FAILURE LEAVES THE TEXT ON SCREEN.
export function KyleMoment({ text, failed, talking, hit, volume, lastVolume, setsDone, nextName, onNext, onReplay }) {
  const delta = lastVolume > 0 && volume > 0 ? percentVs(volume, lastVolume) : null;
  const shown = text ?? (failed
    ? "Kyle's note didn't load. Your sets are saved on this phone."
    : "Kyle is looking at your sets…");
  return (
    <div className="wh-rise" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: T.space[5], minHeight: "60dvh" }}>
      <KyleLine size="lg" text={shown} talking={talking} />
      <div style={{ display: "flex", justifyContent: "center", gap: T.space[2], flexWrap: "wrap" }}>
        {hit.total > 0 && <Chip tone={hit.hit === hit.total ? "good" : "default"}>{hit.hit} of {hit.total} hit</Chip>}
        {volume > 0 ? <Chip>Volume {fmtLbs(volume)} lb</Chip> : <Chip>{setsDone} set{setsDone === 1 ? "" : "s"}</Chip>}
        {delta !== null && <Chip tone={delta > 0 ? "good" : "default"}>{delta === 0 ? "= last time" : delta > 0 ? `+${delta}%` : `−${Math.abs(delta)}%`}</Chip>}
      </div>
      <div style={{ display: "grid", gap: T.space[2] }}>
        <Button full onClick={onNext}>{nextName ? `Next: ${nextName}` : "Finish session"}</Button>
        {text && <Button variant="quiet" full onClick={onReplay}>Say it again</Button>}
      </div>
    </div>
  );
}
