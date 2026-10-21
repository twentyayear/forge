import React from "react";
import { T } from "../theme.js";

const c = T.color;

// INLINE STYLES CANNOT HOLD KEYFRAMES, :hover, :focus-visible OR MEDIA QUERIES; THIS ONE SHEET CARRIES THEM FOR EVERY PRIMITIVE.
const SHEET = `
::selection { background: ${c.energyDeep}; color: ${c.onDeep}; }
input, textarea, select { caret-color: ${c.energy}; }
.wh-btn, .wh-tab, .wh-ck, .wh-chip-btn { -webkit-tap-highlight-color: transparent; transition: filter .15s ease-out, background-color .15s ease-out, transform .12s ease-out; }
.wh-btn:hover:not(:disabled), .wh-chip-btn:hover:not(:disabled) { filter: brightness(1.12); }
.wh-btn:active:not(:disabled), .wh-ck:active, .wh-chip-btn:active:not(:disabled) { transform: scale(.98); }
.wh-btn:disabled, .wh-chip-btn:disabled { opacity: .45; cursor: not-allowed; }
.wh-btn:focus-visible, .wh-tab:focus-visible, .wh-ck:focus-visible, .wh-chip-btn:focus-visible, .wh-field:focus-visible {
  outline: 2px solid ${c.recovery}; outline-offset: 2px;
}
.wh-tab:hover { color: ${c.body}; }
.wh-tab[aria-current="page"]:hover { color: ${c.energy}; }
.wh-field::placeholder { color: ${c.muted}; }
.wh-field:focus { border-color: ${c.energy}; }
.wh-field:disabled { opacity: .55; }
.wh-wave i { display: block; width: 3px; height: 4px; border-radius: 2px; background: ${c.energy}; }
.wh-ring-arc { transition: stroke-dashoffset .7s cubic-bezier(.16,1,.3,1); }
@keyframes wh-wave { from { height: 4px; } to { height: 100%; } }
@keyframes wh-medal { 0% { transform: scale(.4); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 80% { transform: scale(.97); } 100% { transform: scale(1); } }
@keyframes wh-rise { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: no-preference) {
  .wh-wave.on i { animation: wh-wave 1.1s ease-in-out infinite alternate; }
  .wh-wave.on i:nth-child(2n) { animation-delay: .15s; }
  .wh-wave.on i:nth-child(3n) { animation-delay: .3s; }
  .wh-medal { animation: wh-medal .6s cubic-bezier(.16,1,.3,1) both; }
  .wh-rise { animation: wh-rise .28s cubic-bezier(.16,1,.3,1) both; }
}
@media (prefers-reduced-motion: reduce) {
  .wh-ring-arc { transition: none; }
  .wh-btn, .wh-tab, .wh-ck, .wh-chip-btn { transition: none; }
}
`;

export function UiStyles() {
  return <style>{SHEET}</style>;
}
