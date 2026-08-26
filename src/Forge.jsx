import React, { useState, useEffect, useRef } from "react";
import {
  Home, Dumbbell, TrendingUp, TrendingDown, MessageSquare, Volume2, VolumeX, Mic,
  ChevronDown, Award, Watch, Activity, Flame, Play, Check, Moon, Trash2,
  Plus, Minus, Timer, X, PartyPopper, Gauge
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, BarChart, Bar, Tooltip, CartesianGrid } from "recharts";

// ---- Tokens ----
const C = {
  bg: "#0D0F14", surface: "#151922", surface2: "#1C2230",
  line: "#262E3D", lineStrong: "#38445A",
  text: "#F1F3F7", body: "#C7CEDB", muted: "#8A93A6",
  energy: "#F7B733", energyDeep: "#C98F1B",
  recovery: "#4FD8BC", inkOnEnergy: "#181206",
};

const css = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap');
.ff-d { font-family: 'Barlow Condensed', sans-serif; }
.ff-b { font-family: 'Space Grotesk', system-ui, sans-serif; }
button { cursor: pointer; font-family: 'Space Grotesk', system-ui, sans-serif; }
button:focus-visible, input:focus-visible { outline: 2px solid ${C.recovery}; outline-offset: 2px; border-radius: 12px; }
button:active { transform: scale(.985); }
@keyframes orbPulse { 0%,100%{transform:scale(1);opacity:.55} 50%{transform:scale(1.28);opacity:.12} }
.orb-live { animation: orbPulse 1.4s ease-in-out infinite; }
@keyframes eq { 0%,100%{transform:scaleY(.35)} 50%{transform:scaleY(1)} }
.eq span { display:inline-block; width:3px; height:14px; margin:0 2px; border-radius:2px;
  background:${C.inkOnEnergy}; transform-origin:bottom; animation: eq .7s ease-in-out infinite; }
.eq span:nth-child(2){animation-delay:.15s}.eq span:nth-child(3){animation-delay:.3s}.eq span:nth-child(4){animation-delay:.1s}
@keyframes popIn { 0%{transform:scale(.6);opacity:0} 70%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
.pop { animation: popIn .5s cubic-bezier(.2,.9,.3,1) both; }
@keyframes chipIn { from{transform:translateY(4px);opacity:0} to{transform:translateY(0);opacity:1} }
.chip-in { animation: chipIn .25s ease-out both; }
.cal-row { scrollbar-width: none; }
.cal-row::-webkit-scrollbar { display: none; }
@media (prefers-reduced-motion: reduce){ .orb-live,.eq span,.pop,.chip-in{animation:none} button:active{transform:none} }
`;

// ---- Data ----
const workout = {
  name: "Push Day A", duration: "45 min", focus: "Chest · Shoulders · Triceps",
  exercises: [
    { name: "Barbell Bench Press", sets: 4, reps: "6–8", load: "185 lb",
      cues: ["Feet planted, slight arch, shoulder blades pinned back", "Bar touches mid-chest — no bouncing", "Drive up and slightly back toward the rack"],
      note: "Coach note: bar path drifted forward on set 3 last week. Slow the descent." },
    { name: "Seated DB Shoulder Press", sets: 3, reps: "8–10", load: "55 lb",
      cues: ["Ribs down — don't flare at the bottom", "Elbows about 30° in front of your body", "Lock out without shrugging"] },
    { name: "Incline DB Press", sets: 3, reps: "10", load: "60 lb",
      cues: ["Bench at 30° — higher shifts load to shoulders", "Lower until upper arm dips just below parallel", "Press up and slightly together"] },
    { name: "Cable Lateral Raise", sets: 3, reps: "12–15", load: "15 lb",
      cues: ["Lead with the elbow, not the hand", "Stop at shoulder height", "Two seconds down, every rep"] },
    { name: "Overhead Rope Extension", sets: 3, reps: "12", load: "42 lb",
      cues: ["Elbows stay close to your ears", "Full stretch at the bottom", "Squeeze hard at lockout"] },
    { name: "Push-Up Finisher", sets: 1, reps: "AMRAP", load: "Bodyweight",
      cues: ["One straight line, head to heels", "Chest to an inch off the floor", "Stop one rep before form breaks"] },
  ],
};
const strengthData = [
  { wk: "W1", lb: 205 }, { wk: "W2", lb: 210 }, { wk: "W3", lb: 210 }, { wk: "W4", lb: 220 },
  { wk: "W5", lb: 225 }, { wk: "W6", lb: 235 }, { wk: "W7", lb: 232 }, { wk: "W8", lb: 245 },
];
const volumeData = [
  { d: "M", min: 48 }, { d: "T", min: 0 }, { d: "W", min: 52 }, { d: "T", min: 35 },
  { d: "F", min: 47 }, { d: "S", min: 0 }, { d: "S", min: 20 },
];
const cheers = [
  "Big set coming. Brace hard and own every rep.",
  "That's it — two more reps in the tank next time. Beautiful.",
  "Strong set. Keep that bar path tight.",
  "Great work. Use your rest, then we go again.",
  "Last set. Leave nothing in the tank.",
];

const parseWeight = (load) => { const m = load.match(/\d+/); return m ? parseInt(m[0], 10) : null; };
const parseReps = (reps) => { const m = reps.match(/\d+(?!.*\d)/); return m ? parseInt(m[0], 10) : 10; };

const VIDEO_IDS = {
  "Back Squat": "my0tLDaWyDU",
  "Barbell Bench Press": "4Y2ZdHCOXok",
  "Barbell Curl": "QZEqB6wUPxQ",
  "Barbell Row": "FWJR5Ve8bnQ",
  "Cable Lateral Raise": "Sp8be0IFNvk",
  "Close-Grip Bench Press": "UYJsFzqdgK4",
  "Deadlift": "XxWcirHIwVo",
  "EZ-Bar Curl": "5NsFLGUf0Fo",
  "Incline DB Press": "IP4oeKh1Sd4",
  "Kettlebell Swing": "DqkYuWR4zRI",
  "Leg Press": "FNTd_mxtWmo",
  "Overhead Rope Extension": "Fwl0T1_giQ0",
  "Plank Hold": "6LqqeBtFn9M",
  "Pull-Up": "eGo4IYlbE5g",
  "Push Press": "gFmV302JErc",
  "Push-Up Finisher": "I9fsqKE5XHo",
  "Romanian Deadlift": "5zmlnbWb-g4",
  "Rowing Sprint": "mrexeRFo4UM",
  "Seated Cable Row": "vwHG9Jfu4sw",
  "Seated DB Shoulder Press": "vlFGTI5JzjI",
  "Sled Push": "9XRRXaUpnLk",
  "Standing Calf Raise": "k8ipHzKeAkQ",
  "Triceps Pushdown": "8WL0m0vLAPo",
  "Walking Lunge": "Pbmj6xPo-Hw",
  "Weighted Pull-Up": "Sj7k-tOFdsM",
};

// ---- Deterministic exercise history ----
function exHistory(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  const isReps = /Push-Up|Plank/.test(name);
  const baseMax = 95 + (hash % 40) * 5;
  const pr = isReps
    ? { label: "22 reps", date: "Aug 14" }
    : { label: `${baseMax + 20} lb × 3`, date: "Aug 9" };
  const dipWeek = (hash % 5) + 2;
  const series = Array.from({ length: 8 }, (_, k) => {
    const wk = k + 1;
    let lb = baseMax * (0.82 + k * 0.026);
    if (wk === dipWeek) lb *= 0.97;
    return { wk: `W${wk}`, lb: Math.round(lb / 5) * 5 };
  });
  return { pr, baseMax, series };
}

// ---- Calendar (TrainHeroic-style strip) ----
const DAY_MS = 86400000;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const pad2 = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fmtLong = (d) => d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
const fmtMonth = (d) => `${d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()} '${String(d.getFullYear()).slice(2)}`;
const WD = ["S", "M", "T", "W", "T", "F", "S"];

const TODAY = startOfDay(new Date());
const CAL_DAYS = Array.from({ length: 42 }, (_, i) => new Date(TODAY.getTime() + (i - 28) * DAY_MS));

// 5-session cycle, 2 rest days a week; phased so today is always Push Day A
const sessionCycle = [
  { name: "Push Day A", duration: "45 min", focus: "Chest · Shoulders · Triceps", exs: [
      { n: "Barbell Bench Press", base: 185 },
      { n: "Seated DB Shoulder Press", base: 55 },
      { n: "Incline DB Press", base: 60 },
      { n: "Cable Lateral Raise", base: 15 },
      { n: "Overhead Rope Extension", base: 42 },
      { n: "Push-Up Finisher", base: 0 },
    ] },
  { name: "Pull Day A", duration: "50 min", focus: "Back · Biceps · Rear Delts", exs: [
      { n: "Deadlift", base: 225 },
      { n: "Pull-Up", base: 0 },
      { n: "Barbell Row", base: 135 },
      { n: "Seated Cable Row", base: 120 },
      { n: "Barbell Curl", base: 65 },
    ] },
  { name: "Leg Day", duration: "55 min", focus: "Quads · Glutes · Hamstrings", exs: [
      { n: "Back Squat", base: 205 },
      { n: "Romanian Deadlift", base: 155 },
      { n: "Walking Lunge", base: 40 },
      { n: "Leg Press", base: 270 },
      { n: "Standing Calf Raise", base: 90 },
    ] },
  { name: "Upper B", duration: "40 min", focus: "Shoulders · Arms", exs: [
      { n: "Push Press", base: 115 },
      { n: "Weighted Pull-Up", base: 25 },
      { n: "Close-Grip Bench Press", base: 155 },
      { n: "EZ-Bar Curl", base: 60 },
      { n: "Triceps Pushdown", base: 55 },
    ] },
  { name: "Conditioning", duration: "30 min", focus: "Engine · Core", exs: [
      { n: "Kettlebell Swing", base: 53 },
      { n: "Rowing Sprint", base: 0 },
      { n: "Sled Push", base: 180 },
      { n: "Plank Hold", base: 0 },
    ] },
];
function buildDoneBlocks(exs, i) {
  const letters = "ABCDEF";
  let totalSets = 0, totalVolume = 0;
  const blocks = exs.map((ex, j) => {
    const numSets = 3 + ((i + j) % 2); // 3 or 4
    const sets = [];
    for (let k = 0; k < numSets; k++) {
      const reps = 5 + ((i * 3 + j * 5 + k * 2) % 8); // 5–12
      const delta = (((i + j * 2 + k) % 5) - 2) * 5;   // -10..10, mult of 5
      const w = ex.base === 0 ? 0 : ex.base + delta;
      sets.push({ reps, w });
    }
    totalSets += numSets;
    totalVolume += sets.reduce((s, st) => s + st.reps * st.w, 0);
    return { letter: letters[j], name: ex.n, sets };
  });
  return { blocks, totalSets, totalVolume };
}
function buildSchedule() {
  const offs = [];
  for (let o = -28; o <= 13; o++) {
    const r = ((o % 7) + 7) % 7;
    if (r === 3 || r === 6) continue; // rest days
    offs.push(o);
  }
  const zero = offs.indexOf(0);
  const map = {};
  offs.forEach((o, i) => {
    if (o === -12 || o === -19) return; // missed sessions — gaps in the dots
    const t = sessionCycle[(((i - zero) % 5) + 5) % 5];
    const d = new Date(TODAY.getTime() + o * DAY_MS);
    if (o < 0) {
      const { blocks, totalSets, totalVolume } = buildDoneBlocks(t.exs, i);
      map[iso(d)] = {
        ...t, status: "done", blocks, sets: totalSets, volume: totalVolume,
        minutes: 38 + ((i * 7) % 16),
        readiness: 62 + ((i * 11) % 30),
        intensity: 5 + ((i * 7) % 5),
      };
    } else {
      map[iso(d)] = { ...t, status: "planned" };
    }
  });
  return map;
}
const SCHEDULE = buildSchedule();

// ---- Readiness trend ----
const READINESS_TODAY = 82;
const readinessSeries = (() => {
  const todayIso = iso(TODAY);
  const series = [];
  for (let o = -9; o <= 0; o++) {
    const d = new Date(TODAY.getTime() + o * DAY_MS);
    const k = iso(d);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    if (k === todayIso) {
      series.push({ d: label, v: READINESS_TODAY, today: true });
    } else {
      const e = SCHEDULE[k];
      if (e && e.readiness != null) series.push({ d: label, v: e.readiness });
    }
  }
  return series;
})();
const longAvg = (() => {
  const vals = Object.values(SCHEDULE).filter((e) => e.readiness != null).map((e) => e.readiness);
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
})();
const recentAvg = (() => {
  const last3 = readinessSeries.slice(-3);
  return Math.round(last3.reduce((s, p) => s + p.v, 0) / last3.length);
})();

// ---- Bits ----
const Label = ({ children }) => (
  <div className="ff-b" style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: ".14em", margin: "24px 0 10px" }}>{children}</div>
);
const Card = ({ children, style, ...p }) => (
  <div {...p} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: 16, ...style }}>{children}</div>
);
const Pill = ({ children, tone, style }) => (
  <span style={{ borderRadius: 999, padding: "5px 11px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
    background: tone === "energy" ? "rgba(247,183,51,.13)" : "rgba(79,216,188,.12)",
    color: tone === "energy" ? C.energy : C.recovery, ...style }}>{children}</span>
);
const Badge = ({ letter }) => (
  <div style={{ width: 26, height: 26, borderRadius: "50%", border: `1px solid ${C.lineStrong}`, background: C.surface2,
    display: "flex", alignItems: "center", justifyContent: "center", color: C.energy, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{letter}</div>
);
const IconStat = ({ Icon, n, t }) => (
  <div style={{ flex: 1, textAlign: "center" }}>
    <Icon size={15} color={C.muted} style={{ margin: "0 auto" }} />
    <div className="ff-d" style={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1, marginTop: 4 }}>{n}</div>
    <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: ".1em", marginTop: 3, fontWeight: 600 }}>{t}</div>
  </div>
);

function Ring({ score }) {
  const r = 52, circ = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: 126, height: 126, flexShrink: 0 }}>
      <svg width="126" height="126" viewBox="0 0 128 128" role="img" aria-label={`Readiness ${score} of 100`}>
        <circle cx="64" cy="64" r={r} fill="none" stroke={C.line} strokeWidth="9" />
        <circle cx="64" cy="64" r={r} fill="none" stroke={C.recovery} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)} transform="rotate(-90 64 64)" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div className="ff-d" style={{ fontSize: 40, fontWeight: 800, color: C.text, lineHeight: 1 }}>{score}</div>
        <div className="ff-b" style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: ".12em", marginTop: 2 }}>Readiness</div>
      </div>
    </div>
  );
}

function Sheet({ title, onClose, children }) {
  return (
    <div role="dialog" aria-modal="true" onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 50,
        display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 430, background: C.surface, borderRadius: "22px 22px 0 0",
          border: `1px solid ${C.line}`, padding: "18px 20px 28px", maxHeight: "82vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="ff-d" style={{ fontSize: 22, fontWeight: 700, color: C.text, textTransform: "uppercase" }}>{title}</span>
          <button onClick={onClose} aria-label="Close"
            style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", color: C.muted, flexShrink: 0 }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CalendarStrip({ selected, onSelect, doneToday }) {
  const todayIso = iso(TODAY);
  const rowRef = useRef(null);
  const cellRefs = useRef({});
  const scrollTo = (k) => {
    const row = rowRef.current, el = cellRefs.current[k];
    if (row && el) row.scrollLeft = el.offsetLeft - row.clientWidth / 2 + el.clientWidth / 2;
  };
  useEffect(() => { scrollTo(todayIso); }, []); // eslint-disable-line
  const selDate = new Date(selected + "T00:00:00");
  return (
    <div style={{ margin: "12px -20px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 20px 8px" }}>
        <span className="ff-d" style={{ fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: ".05em" }}>{fmtMonth(selDate)}</span>
        <button onClick={() => { onSelect(todayIso); scrollTo(todayIso); }}
          style={{ background: "none", border: `1px solid ${selected === todayIso ? C.line : "rgba(247,183,51,.5)"}`, borderRadius: 8, padding: "5px 11px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: selected === todayIso ? C.muted : C.energy }}>
          Today
        </button>
      </div>
      <div ref={rowRef} className="cal-row" style={{ display: "flex", gap: 4, overflowX: "auto", padding: "0 14px 4px" }}>
        {CAL_DAYS.map((d) => {
          const k = iso(d);
          const e = SCHEDULE[k];
          const isSel = k === selected, isToday = k === todayIso;
          const dot = e ? ((e.status === "done" || (isToday && doneToday)) ? C.recovery : C.energy) : "transparent";
          return (
            <button key={k} ref={(el) => { cellRefs.current[k] = el; }} onClick={() => onSelect(k)} aria-pressed={isSel}
              aria-label={`${fmtLong(d)}${e ? ` — ${e.name}${e.status === "done" ? ", completed" : ", planned"}` : ", rest day"}`}
              style={{ flex: "0 0 46px", background: isSel ? C.surface2 : "none", border: `1px solid ${isSel ? C.lineStrong : "transparent"}`, borderRadius: 12, padding: "7px 0 6px", minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: ".08em", color: C.muted }}>{WD[d.getDay()]}</span>
              <span className="ff-d" style={{ fontSize: 17, fontWeight: 700, color: isToday ? C.energy : isSel ? C.text : C.body }}>{d.getDate()}</span>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: dot }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Stepper({ label, value, unit, onChange, step = 1, min = 0, disabledText }) {
  if (disabledText) {
    return (
      <div style={{ flex: 1, background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 15, padding: "12px 10px", textAlign: "center" }}>
        <div style={{ fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 600 }}>{label}</div>
        <div className="ff-d" style={{ fontSize: 24, fontWeight: 700, color: C.body, marginTop: 6, lineHeight: 1.2 }}>{disabledText}</div>
      </div>
    );
  }
  return (
    <div style={{ flex: 1, background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 15, padding: "10px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        <button aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - step))}
          style={stepBtn}><Minus size={16} /></button>
        <div className="ff-d" style={{ fontSize: 30, fontWeight: 800, color: C.text, lineHeight: 1 }}>
          {value}{unit && <span style={{ fontSize: 13, color: C.muted, fontWeight: 600, marginLeft: 3 }}>{unit}</span>}
        </div>
        <button aria-label={`Increase ${label}`} onClick={() => onChange(value + step)}
          style={stepBtn}><Plus size={16} /></button>
      </div>
    </div>
  );
}
const stepBtn = {
  width: 38, height: 38, borderRadius: 11, background: C.surface, border: `1px solid ${C.lineStrong}`,
  color: C.text, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
};

// ---- App ----
export default function Forge() {
  const [screen, setScreen] = useState("login");
  const [tab, setTab] = useState("today");
  const [selDay, setSelDay] = useState(iso(TODAY));
  const [voiceOn, setVoiceOn] = useState(true);
  const [active, setActive] = useState(null);        // { i, done }
  const [entry, setEntry] = useState({ w: 0, reps: 0 });
  const [log, setLog] = useState([]);                // [{i, w, reps}]
  const [rest, setRest] = useState(null);            // seconds or null
  const [summary, setSummary] = useState(null);      // {sets, volume, minutes}
  const [doneToday, setDoneToday] = useState(false);
  const [showReadiness, setShowReadiness] = useState(false);
  const [rpe, setRpe] = useState(null);
  const [line, setLine] = useState(null);
  const [talking, setTalking] = useState(false);
  const [exDetail, setExDetail] = useState(null);    // exercise name or null
  const [exTab, setExTab] = useState("history");
  const [maxes, setMaxes] = useState({});
  const [removed, setRemoved] = useState({});   // {`${iso}:${letter}`: true} — deleted log rows            // name -> working max lb
  const [comments, setComments] = useState([]); // { text, ref, time }, ref: { name, date } | null
  const [commentRef, setCommentRef] = useState(null);
  const [draft, setDraft] = useState("");
  const [devs, setDevs] = useState([
    { name: "Apple Watch", detail: "Heart rate · Workouts", on: true, icon: Watch },
    { name: "Whoop 5.0", detail: "Recovery · Strain · Sleep", on: true, icon: Activity },
    { name: "Garmin", detail: "via Health Connect", on: false, icon: Watch },
    { name: "Oura Ring", detail: "Sleep · HRV", on: false, icon: Moon },
    { name: "Fitbit", detail: "Steps · Heart rate", on: false, icon: Activity },
  ]);
  const idx = useRef(0);
  const startedAt = useRef(null);

  const speak = (text) => {
    setLine(text);
    if (!voiceOn) return;
    try {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.02;
        u.onstart = () => setTalking(true);
        u.onend = () => setTalking(false);
        u.onerror = () => setTalking(false);
        window.speechSynthesis.speak(u);
      }
    } catch (e) {}
  };
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch (e) {} }, []);

  // Prefill weight/reps when the exercise changes
  useEffect(() => {
    if (active) {
      const ex = workout.exercises[active.i];
      setEntry({ w: parseWeight(ex.load), reps: parseReps(ex.reps) });
    }
  }, [active?.i]); // eslint-disable-line

  // Rest countdown
  useEffect(() => {
    if (rest === null) return;
    if (rest <= 0) { setRest(null); return; }
    const t = setTimeout(() => setRest(rest - 1), 1000);
    return () => clearTimeout(t);
  }, [rest]);

  const openReadiness = () => {
    setShowReadiness(true);
    speak(`Readiness ${READINESS_TODAY}. ${recentAvg >= longAvg ? "Trending above your baseline — green light to push." : "A touch under baseline — keep the top sets honest."}`);
  };

  const openExercise = (name) => { setExDetail(name); setExTab("history"); };

  const submitComment = () => {
    if (!draft.trim()) return;
    setComments([...comments, { text: draft.trim(), ref: commentRef, time: "Just now" }]);
    setDraft("");
    setCommentRef(null);
  };

  const start = () => {
    setTab("train");
    setLog([]); setSummary(null); setRest(null); setRpe(null);
    startedAt.current = Date.now();
    setActive({ i: 0, done: 0 });
    speak("Welcome back, Alex. Today is Push Day A. Warm up well — then we get after it.");
  };

  const finish = (finalLog) => {
    const mins = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    const volume = finalLog.reduce((s, l) => s + (l.w || 0) * l.reps, 0);
    setSummary({ sets: finalLog.length, volume, minutes: mins });
    setActive(null); setRest(null); setDoneToday(true);
    speak("Workout complete. Outstanding session — Coach Mike will see today's numbers tonight.");
  };

  const logSet = () => {
    const ex = workout.exercises[active.i];
    const newLog = [...log, { i: active.i, w: entry.w, reps: entry.reps }];
    setLog(newLog);
    const n = active.done + 1;
    if (n >= ex.sets) {
      if (active.i + 1 >= workout.exercises.length) { finish(newLog); return; }
      const nx = workout.exercises[active.i + 1];
      setActive({ i: active.i + 1, done: 0 });
      setRest(90);
      speak(`Nice work. Next up: ${nx.name}. ${nx.cues[0]}.`);
    } else {
      setActive({ ...active, done: n });
      setRest(90);
      speak(cheers[idx.current++ % cheers.length]);
    }
  };

  // ---- Login ----
  if (screen === "login") {
    return (
      <div className="ff-b" style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <style>{css}</style>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ width: 56, height: 56, margin: "0 auto 18px", borderRadius: 16, background: `linear-gradient(135deg, ${C.energy}, ${C.energyDeep})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Dumbbell size={28} color={C.inkOnEnergy} strokeWidth={2.5} />
            </div>
            <div className="ff-d" style={{ fontSize: 58, fontWeight: 800, color: C.text, textTransform: "uppercase", lineHeight: .95, letterSpacing: ".01em" }}>Forge</div>
            <div style={{ color: C.muted, fontSize: 14, marginTop: 10 }}>Your coach. Your data. One plan.</div>
          </div>
          <input aria-label="Email" placeholder="Email" defaultValue="alex@email.com" style={inp} />
          <input aria-label="Password" placeholder="Password" type="password" defaultValue="••••••••" style={inp} />
          <button onClick={() => setScreen("app")} style={{ ...btnP, width: "100%", marginTop: 6 }}>Sign in</button>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 22, textAlign: "center" }}>Members are invited by their coach · Ironworks Gym</div>
        </div>
      </div>
    );
  }

  // ---- Shell ----
  return (
    <div className="ff-b" style={{ minHeight: "100vh", background: C.bg, display: "flex", justifyContent: "center" }}>
      <style>{css}</style>
      <div style={{ width: "100%", maxWidth: 430, display: "flex", flexDirection: "column", minHeight: "100vh" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: `linear-gradient(135deg, ${C.energy}, ${C.energyDeep})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Dumbbell size={16} color={C.inkOnEnergy} strokeWidth={2.5} />
            </div>
            <span className="ff-d" style={{ fontSize: 23, fontWeight: 800, color: C.text, textTransform: "uppercase" }}>Forge</span>
          </div>
          <button onClick={() => setVoiceOn(!voiceOn)} aria-pressed={voiceOn} aria-label={voiceOn ? "Turn coach voice off" : "Turn coach voice on"}
            style={{ display: "flex", alignItems: "center", gap: 7, background: "none", border: `1px solid ${voiceOn ? "rgba(247,183,51,.5)" : C.line}`, borderRadius: 999, padding: "8px 13px", minHeight: 38, fontSize: 12, fontWeight: 600, color: voiceOn ? C.energy : C.muted }}>
            {voiceOn ? <Volume2 size={15} /> : <VolumeX size={15} />} Voice
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 104px" }}>

          {/* TODAY */}
          {tab === "today" && (() => {
            const todayIso = iso(TODAY);
            const isToday = selDay === todayIso;
            const selDate = new Date(selDay + "T00:00:00");
            const entry = SCHEDULE[selDay];
            return (
              <div>
                <CalendarStrip selected={selDay} onSelect={setSelDay} doneToday={doneToday} />
                <div style={{ color: C.muted, fontSize: 13, marginTop: 14 }}>{fmtLong(selDate)}</div>

                {isToday && (
                  <>
                    <h1 className="ff-d" style={{ fontSize: 36, fontWeight: 700, color: C.text, lineHeight: 1.02, margin: "2px 0 0", textTransform: "uppercase" }}>Morning, Alex</h1>

                    <Card role="button" tabIndex={0} aria-expanded={showReadiness} onClick={openReadiness}
                      onKeyDown={(e) => { if (e.key === "Enter") openReadiness(); }}
                      style={{ marginTop: 18, display: "flex", gap: 16, alignItems: "center", width: "100%", textAlign: "left" }}>
                      <Ring score={82} />
                      <div>
                        <div style={{ color: C.text, fontSize: 15, fontWeight: 600 }}>Ready to push</div>
                        <div style={{ color: C.body, fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
                          7h 40m sleep · resting HR 54 · HRV up 6%. Synced from Whoop &amp; Apple Watch.
                        </div>
                        <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>View trend ›</div>
                      </div>
                    </Card>

                    <Label>Today's session</Label>
                    <Card>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                        <div>
                          <div className="ff-d" style={{ fontSize: 27, fontWeight: 700, color: C.text, textTransform: "uppercase", lineHeight: 1 }}>{workout.name}</div>
                          <div style={{ color: C.muted, fontSize: 12.5, marginTop: 5 }}>{workout.duration} · {workout.exercises.length} exercises · {workout.focus}</div>
                        </div>
                        {doneToday ? <Pill tone="recovery">Completed</Pill> : <Pill tone="energy">Planned</Pill>}
                      </div>
                      {doneToday && summary && (
                        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                          <MiniStat n={summary.sets} t="Sets" />
                          <MiniStat n={summary.volume.toLocaleString()} t="lb volume" />
                          <MiniStat n={summary.minutes} t="Minutes" />
                          <MiniStat n={rpe ?? "–"} t="RPE" />
                        </div>
                      )}
                      <button onClick={start} style={{ ...(doneToday ? btnG : btnP), width: "100%", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <Play size={17} fill={doneToday ? "none" : C.inkOnEnergy} /> {doneToday ? "Train again" : "Start workout"}
                      </button>
                    </Card>

                    {!doneToday && (
                      <>
                        <Label>Coach instructions</Label>
                        <Card>
                          <div style={{ color: C.body, fontSize: 13.5, lineHeight: 1.55 }}>
                            Total-body tightness today — leave one rep in reserve on every top set, and film your last bench set.
                          </div>
                        </Card>

                        <Label>Warm-up</Label>
                        <Card style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                          <Badge letter="A" />
                          <div style={{ color: C.body, fontSize: 13.5, lineHeight: 1.55 }}>
                            3 min easy row or jacks, then 2 rounds: 10 leg swings each side, 10 band pull-aparts, 5 slow push-ups.
                          </div>
                        </Card>
                      </>
                    )}

                    <Label>This week</Label>
                    <div style={{ display: "flex", gap: 10 }}>
                      <Stat n={doneToday ? "5" : "4"} t="Workouts" />
                      <Stat n={doneToday && summary ? String(182 + summary.minutes) : "182"} t="Minutes" />
                      <Stat n="12" t="Week streak" hot />
                    </div>

                    <Label>From Coach Mike</Label>
                    <Card>
                      <div style={{ display: "flex", gap: 12 }}>
                        <div style={ava}>M</div>
                        <div style={{ color: C.body, fontSize: 13.5, lineHeight: 1.6 }}>
                          Bench is trending up nicely — I bumped Thursday's top set to 190. Watch that bar path on your last set.
                          <div style={{ color: C.muted, fontSize: 11.5, marginTop: 7 }}>Yesterday · reply in Coach tab</div>
                        </div>
                      </div>
                    </Card>
                  </>
                )}

                {!isToday && entry?.status === "done" && (() => {
                  const blocks = entry.blocks.filter((b) => !removed[`${selDay}:${b.letter}`]);
                  const vSets = blocks.reduce((n, b) => n + b.sets.length, 0);
                  const vVolume = blocks.reduce((n, b) => n + b.sets.reduce((m, x) => m + x.reps * x.w, 0), 0);
                  return (
                  <>
                    <h1 className="ff-d" style={{ fontSize: 36, fontWeight: 700, color: C.text, lineHeight: 1.02, margin: "2px 0 0", textTransform: "uppercase" }}>{entry.name}</h1>

                    <Label>Session log</Label>
                    <Card>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ color: C.muted, fontSize: 12.5, marginTop: 5 }}>{entry.duration} · {entry.focus}</div>
                        <Pill tone="recovery">Completed</Pill>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
                        <IconStat Icon={Check} n={`${blocks.length}/${entry.blocks.length}`} t="Blocks" />
                        <IconStat Icon={Activity} n={entry.readiness} t="Readiness" />
                        <IconStat Icon={Timer} n={entry.minutes} t="Minutes" />
                        <IconStat Icon={Gauge} n={`${entry.intensity}/10`} t="Intensity" />
                        <IconStat Icon={Dumbbell} n={vVolume.toLocaleString()} t="LB" />
                      </div>
                      {blocks.map((b) => {
                        const reps = b.sets.map((s) => s.reps).join(", ");
                        const bw = b.sets[0].w === 0;
                        const weights = b.sets.map((s) => s.w).join(", ");
                        return (
                          <div key={b.letter} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginTop: 14 }}>
                            <button onClick={() => openExercise(b.name)}
                              style={{ flex: 1, background: "none", border: "none", padding: 0, textAlign: "left", display: "flex", gap: 12, alignItems: "flex-start" }}>
                              <Badge letter={b.letter} />
                              <div style={{ flex: 1 }}>
                                <div style={{ color: C.text, fontSize: 13.5, fontWeight: 600 }}>{b.name}</div>
                                <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>
                                  {bw ? `${reps} reps · bodyweight` : `${reps} @ ${weights} lb`}
                                </div>
                              </div>
                              <ChevronDown size={16} color={C.muted} style={{ transform: "rotate(-90deg)", flexShrink: 0, marginTop: 4 }} />
                            </button>
                            <button aria-label={`Delete ${b.name} from log`} onClick={() => setRemoved({ ...removed, [`${selDay}:${b.letter}`]: true })}
                              style={{ background: "none", border: "none", padding: "2px 2px 6px 6px", color: C.muted, flexShrink: 0, display: "flex" }}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        );
                      })}
                      <div style={{ color: C.muted, fontSize: 11.5, marginTop: 14 }}>Logged · synced to Coach Mike</div>
                    </Card>
                    <button onClick={() => { setCommentRef({ name: entry.name, date: fmtLong(selDate) }); setTab("coach"); }}
                      style={{ background: "none", border: "none", color: C.recovery, fontSize: 13, fontWeight: 600, marginTop: 12, padding: "8px 0" }}>
                      Comment on Session
                    </button>
                  </>
                  );
                })()}

                {!isToday && entry?.status === "planned" && (
                  <>
                    <h1 className="ff-d" style={{ fontSize: 36, fontWeight: 700, color: C.text, lineHeight: 1.02, margin: "2px 0 0", textTransform: "uppercase" }}>{entry.name}</h1>

                    <Label>Scheduled session</Label>
                    <Card>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ color: C.muted, fontSize: 12.5, marginTop: 5 }}>{entry.duration} · {entry.focus}</div>
                        <Pill tone="energy">Scheduled</Pill>
                      </div>
                      <div style={{ color: C.muted, fontSize: 11.5, marginTop: 7 }}>Unlocks on the day — Coach Mike may still adjust the plan.</div>
                    </Card>
                  </>
                )}

                {!isToday && !entry && (
                  <>
                    <h1 className="ff-d" style={{ fontSize: 36, fontWeight: 700, color: C.text, lineHeight: 1.02, margin: "2px 0 0", textTransform: "uppercase" }}>Rest Day</h1>

                    <Label>Recovery</Label>
                    <Card style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <Moon size={22} color={C.recovery} />
                      <div style={{ color: C.body, fontSize: 13.5, lineHeight: 1.55 }}>Nothing on the plan. Sleep, eat, walk — the readiness score tomorrow will thank you.</div>
                    </Card>
                  </>
                )}
              </div>
            );
          })()}

          {/* TRAIN — summary (post-workout) */}
          {tab === "train" && !active && summary && (
            <div style={{ textAlign: "center", paddingTop: 30 }}>
              <div className="pop" style={{ width: 88, height: 88, margin: "0 auto 20px", borderRadius: "50%", background: `linear-gradient(135deg, ${C.energy}, ${C.energyDeep})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <PartyPopper size={40} color={C.inkOnEnergy} />
              </div>
              <h1 className="ff-d" style={{ fontSize: 40, fontWeight: 800, color: C.text, textTransform: "uppercase", lineHeight: 1, margin: 0 }}>Session complete</h1>
              <div style={{ color: C.body, fontSize: 14, marginTop: 10 }}>{workout.name} · logged &amp; shared with Coach Mike</div>
              <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                <Stat n={String(summary.sets)} t="Sets logged" />
                <Stat n={summary.volume.toLocaleString()} t="lb volume" hot />
                <Stat n={String(summary.minutes)} t="Minutes" />
              </div>

              <Label>How hard was it?</Label>
              <div style={{ maxWidth: 200, margin: "0 auto" }}>
                <Stepper label="Intensity" value={rpe ?? 7} unit="/10" step={1} min={1} onChange={(v) => setRpe(Math.min(10, v))} />
              </div>

              <Card style={{ marginTop: 18, textAlign: "left", padding: 0 }}>
                {workout.exercises.map((ex, i) => {
                  const sets = log.filter(l => l.i === i);
                  if (!sets.length) return null;
                  const best = sets.reduce((a, b) => ((b.w || 0) * b.reps > (a.w || 0) * a.reps ? b : a));
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: i < workout.exercises.length - 1 ? `1px solid ${C.line}` : "none" }}>
                      <div style={{ color: C.body, fontSize: 13.5 }}>{ex.name}</div>
                      <div style={{ color: C.muted, fontSize: 12.5, whiteSpace: "nowrap" }}>
                        {sets.length} × best {best.w ? `${best.w} lb × ` : ""}{best.reps}
                      </div>
                    </div>
                  );
                })}
              </Card>
              <button onClick={() => setTab("today")} style={{ ...btnP, width: "100%", marginTop: 18 }}>Done</button>
            </div>
          )}

          {/* TRAIN — list */}
          {tab === "train" && !active && !summary && (
            <div>
              <h1 className="ff-d" style={{ fontSize: 36, fontWeight: 700, color: C.text, textTransform: "uppercase", margin: "18px 0 0", lineHeight: 1 }}>{workout.name}</h1>
              <div style={{ color: C.muted, fontSize: 13, margin: "6px 0 12px" }}>{workout.duration} · {workout.focus}</div>
              <button onClick={start} style={{ ...btnP, width: "100%", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Play size={17} fill={C.inkOnEnergy} /> Start workout
              </button>
              {workout.exercises.map((ex, i) => (
                <Card key={i} style={{ marginTop: 10, padding: 0, overflow: "hidden" }}>
                  <button onClick={() => openExercise(ex.name)}
                    style={{ width: "100%", background: "none", border: "none", padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", minHeight: 48 }}>
                    <div>
                      <div style={{ color: C.text, fontSize: 15, fontWeight: 600 }}>{ex.name}</div>
                      <div style={{ color: C.muted, fontSize: 12.5, marginTop: 3 }}>{ex.sets} × {ex.reps} · {ex.load}</div>
                    </div>
                    <ChevronDown size={18} color={C.muted} style={{ transform: "rotate(-90deg)" }} />
                  </button>
                </Card>
              ))}
            </div>
          )}

          {/* TRAIN — active */}
          {tab === "train" && active && (() => {
            const ex = workout.exercises[active.i];
            const mySets = log.filter(l => l.i === active.i);
            const bw = parseWeight(ex.load) === null;
            return (
              <div style={{ textAlign: "center", paddingTop: 14 }}>
                <div style={{ color: C.muted, fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".14em", fontWeight: 600 }}>
                  Exercise {active.i + 1} of {workout.exercises.length}
                </div>
                <h1 className="ff-d" style={{ fontSize: 33, fontWeight: 800, color: C.text, textTransform: "uppercase", lineHeight: 1.04, margin: "7px 0 0" }}>{ex.name}</h1>
                <div style={{ color: C.muted, fontSize: 13.5, marginTop: 4 }}>Target {ex.reps} reps · {ex.load}</div>

                <div style={{ position: "relative", width: 128, height: 128, margin: "20px auto 6px" }}>
                  <div className={talking ? "orb-live" : ""} style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${C.energy}`, opacity: talking ? 1 : .4 }} />
                  <div style={{ position: "absolute", inset: 14, borderRadius: "50%", background: `radial-gradient(circle at 35% 28%, ${C.energy}, ${C.energyDeep})`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
                    <div className="ff-d" style={{ fontSize: 37, fontWeight: 800, color: C.inkOnEnergy, lineHeight: 1 }}>
                      {active.done}<span style={{ fontSize: 19 }}>/{ex.sets}</span>
                    </div>
                    {talking && <div className="eq" aria-hidden="true"><span/><span/><span/><span/></div>}
                  </div>
                </div>
                <div style={{ color: C.muted, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".14em", fontWeight: 600 }}>Sets complete</div>

                {/* Logged sets */}
                {mySets.length > 0 && (
                  <div style={{ display: "flex", gap: 7, justifyContent: "center", flexWrap: "wrap", marginTop: 12 }}>
                    {mySets.map((s, k) => (
                      <span key={k} className="chip-in" style={{ display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 999, padding: "6px 11px", fontSize: 12, fontWeight: 600, background: C.surface, border: `1px solid ${C.line}`, color: C.body }}>
                        <Check size={12} color={C.recovery} /> {s.w ? `${s.w}×${s.reps}` : `${s.reps} reps`}
                      </span>
                    ))}
                  </div>
                )}

                {/* Coach line */}
                {line && (
                  <div style={{ margin: "14px auto 0", maxWidth: 330, padding: "10px 14px", borderRadius: 14, background: C.surface, border: `1px solid ${C.line}`, color: C.body, fontSize: 13, lineHeight: 1.5, textAlign: "left" }}>
                    <span style={{ color: C.energy, fontWeight: 600 }}>Coach </span>{line}
                  </div>
                )}

                {/* Rest timer */}
                {rest !== null && (
                  <div style={{ margin: "14px auto 0", maxWidth: 330, borderRadius: 14, background: "rgba(79,216,188,.09)", border: "1px solid rgba(79,216,188,.3)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                    <Timer size={17} color={C.recovery} />
                    <div style={{ flex: 1, textAlign: "left" }}>
                      <div style={{ color: C.recovery, fontSize: 13, fontWeight: 600 }}>Rest {Math.floor(rest / 60)}:{String(rest % 60).padStart(2, "0")}</div>
                      <div style={{ height: 4, background: "rgba(79,216,188,.18)", borderRadius: 2, marginTop: 5, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: "100%", transform: `scaleX(${rest / 90})`, transformOrigin: "left", background: C.recovery, borderRadius: 2, transition: "transform 1s linear" }} />
                      </div>
                    </div>
                    <button aria-label="Skip rest" onClick={() => setRest(null)} style={{ background: "none", border: "none", color: C.recovery, display: "flex", padding: 6 }}><X size={16} /></button>
                  </div>
                )}

                {/* Entry: weight + reps */}
                <div style={{ display: "flex", gap: 10, margin: "16px 0 0" }}>
                  <Stepper label="Weight" value={entry.w ?? 0} unit="lb" step={5}
                    onChange={(v) => setEntry({ ...entry, w: v })}
                    disabledText={bw ? "Body" : null} />
                  <Stepper label="Reps" value={entry.reps} step={1} min={1}
                    onChange={(v) => setEntry({ ...entry, reps: v })} />
                </div>

                <button onClick={logSet} style={{ ...btnP, width: "100%", marginTop: 12, fontSize: 16.5 }}>
                  Log set {active.done + 1}
                </button>
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button onClick={() => speak(ex.cues[Math.floor(Math.random() * ex.cues.length)])}
                    style={{ ...btnG, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                    <Mic size={15} /> Form cue
                  </button>
                  <button onClick={() => { log.length ? finish(log) : setActive(null); try { window.speechSynthesis?.cancel(); } catch (e) {} }}
                    style={{ ...btnG, flex: 1 }}>
                    End workout
                  </button>
                </div>
              </div>
            );
          })()}

          {/* PROGRESS */}
          {tab === "progress" && (
            <div>
              <h1 className="ff-d" style={{ fontSize: 36, fontWeight: 700, color: C.text, textTransform: "uppercase", margin: "18px 0 0", lineHeight: 1 }}>Progress</h1>

              <Label>Bench press · est. 1RM</Label>
              <Card>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span className="ff-d" style={{ fontSize: 42, fontWeight: 800, color: C.text, lineHeight: 1 }}>245<span style={{ fontSize: 19, color: C.muted, fontWeight: 600, marginLeft: 4 }}>lb</span></span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.recovery, fontSize: 13.5, fontWeight: 600 }}>
                    <TrendingUp size={15} /> 19.5% over 8 weeks
                  </span>
                </div>
                <div style={{ height: 158, marginTop: 10 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={strengthData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                      <CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="wk" stroke={C.muted} fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke={C.muted} fontSize={11} tickLine={false} axisLine={false} domain={[195, 255]} />
                      <Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 10, color: C.text, fontSize: 12 }} />
                      <Line type="monotone" dataKey="lb" stroke={C.energy} strokeWidth={2.5} dot={{ r: 3, fill: C.energy, strokeWidth: 0 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Label>Training minutes · this week</Label>
              <Card>
                <div style={{ height: 138 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={volumeData} margin={{ top: 8, right: 8, left: -26, bottom: 0 }}>
                      <XAxis dataKey="d" stroke={C.muted} fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke={C.muted} fontSize={11} tickLine={false} axisLine={false} />
                      <Bar dataKey="min" fill={C.recovery} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Label>Milestones</Label>
              <Card style={{ padding: 0 }}>
                {[
                  ["First 225 lb bench", "Aug 9", true],
                  ["10 workouts this month", "Aug 18", true],
                  ["12-week streak", "2 weeks to go", false],
                ].map(([t, d, done], i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "14px 16px", borderBottom: i < 2 ? `1px solid ${C.line}` : "none" }}>
                    {done ? <Award size={17} color={C.energy} /> : <Flame size={17} color={C.muted} />}
                    <div style={{ flex: 1, color: C.body, fontSize: 14 }}>{t}</div>
                    <div style={{ color: C.muted, fontSize: 12 }}>{d}</div>
                  </div>
                ))}
              </Card>
            </div>
          )}

          {/* COACH */}
          {tab === "coach" && (
            <div>
              <h1 className="ff-d" style={{ fontSize: 36, fontWeight: 700, color: C.text, textTransform: "uppercase", margin: "18px 0 0", lineHeight: 1 }}>Coach</h1>

              <Card style={{ marginTop: 14, display: "flex", gap: 13, alignItems: "center" }}>
                <div style={{ ...ava, width: 50, height: 50, fontSize: 19 }}>M</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: C.text, fontSize: 15.5, fontWeight: 600 }}>Mike Torres</div>
                  <div style={{ color: C.muted, fontSize: 12.5 }}>Head Coach · Ironworks Gym</div>
                </div>
                <Pill tone="recovery">Online</Pill>
              </Card>

              <Label>Recent updates</Label>
              <Card style={{ padding: 0 }}>
                {[
                  ["Adjusted Thursday's bench top set to 190 lb", "Yesterday"],
                  ["Reviewed your squat form video — feedback sent", "Fri"],
                  ["Deload week scheduled for Sep 7", "Thu"],
                ].map(([t, d], i) => (
                  <div key={i} style={{ padding: "14px 16px", borderBottom: i < 2 ? `1px solid ${C.line}` : "none" }}>
                    <div style={{ color: C.body, fontSize: 13.5, lineHeight: 1.5 }}>{t}</div>
                    <div style={{ color: C.muted, fontSize: 11.5, marginTop: 4 }}>{d}</div>
                  </div>
                ))}
              </Card>

              <button style={{ ...btnG, width: "100%", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <MessageSquare size={16} /> Message Coach Mike
              </button>

              <Label>Session comments</Label>
              <Card style={{ padding: 0 }}>
                {comments.length ? comments.map((c, i) => (
                  <div key={i} style={{ padding: "14px 16px", borderBottom: i < comments.length - 1 ? `1px solid ${C.line}` : "none" }}>
                    {c.ref && (
                      <div style={{ marginBottom: 6 }}>
                        <Pill tone="energy" style={{ fontSize: 10 }}>{c.ref.name} · {c.ref.date}</Pill>
                      </div>
                    )}
                    <div style={{ color: C.body, fontSize: 13.5, lineHeight: 1.55 }}>{c.text}</div>
                    <div style={{ color: C.muted, fontSize: 11.5, marginTop: 4 }}>{c.time} · seen by Coach Mike</div>
                  </div>
                )) : (
                  <div style={{ padding: 16, color: C.muted, fontSize: 12.5 }}>
                    No comments yet — open a logged workout and tap Comment on Session.
                  </div>
                )}
                <div style={{ borderTop: `1px solid ${C.line}`, padding: "12px 16px 16px" }}>
                  {/* Reference chip tied to commentRef */}
                  {commentRef && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <Pill tone="energy" style={{ fontSize: 10 }}>Re: {commentRef.name} · {commentRef.date}</Pill>
                      <button aria-label="Clear session reference" onClick={() => setCommentRef(null)}
                        style={{ width: 32, height: 32, minWidth: 32, background: "none", border: "none", color: C.muted, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <input aria-label="Comment" placeholder="Write a comment…" value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) submitComment(); }}
                      style={{ ...inp, marginBottom: 0, flex: 1, minHeight: 44 }} />
                    <button onClick={submitComment} disabled={!draft.trim()}
                      style={{ ...btnP, padding: "0 18px", minHeight: 44, opacity: draft.trim() ? 1 : .45, flexShrink: 0 }}>
                      Send
                    </button>
                  </div>
                </div>
              </Card>

              <Label>Data your coach sees</Label>
              <Card style={{ padding: 0 }}>
                {devs.map((dv, i) => {
                  const Ic = dv.icon;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: i < devs.length - 1 ? `1px solid ${C.line}` : "none" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: C.surface2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Ic size={17} color={dv.on ? C.recovery : C.muted} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: C.text, fontSize: 14, fontWeight: 500 }}>{dv.name}</div>
                        <div style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>{dv.detail}</div>
                      </div>
                      {dv.on
                        ? <button onClick={() => setDevs(devs.map((d, k) => k === i ? { ...d, on: false } : d))}
                            style={{ borderRadius: 999, padding: "7px 13px", minHeight: 32, fontSize: 11.5, fontWeight: 600, background: "rgba(79,216,188,.12)", color: C.recovery, border: "1px solid transparent" }}>Connected</button>
                        : <button onClick={() => setDevs(devs.map((d, k) => k === i ? { ...d, on: true } : d))}
                            style={{ borderRadius: 999, padding: "7px 13px", minHeight: 32, fontSize: 11.5, fontWeight: 600, background: "none", color: C.body, border: `1px solid ${C.lineStrong}` }}>Connect</button>}
                    </div>
                  );
                })}
              </Card>
              <div style={{ color: C.muted, fontSize: 11.5, marginTop: 10, lineHeight: 1.55 }}>
                Sleep, recovery, and heart-rate data shape your plan automatically and are visible to your coach.
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav aria-label="Main" style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "rgba(13,15,20,.92)", backdropFilter: "blur(14px)", borderTop: `1px solid ${C.line}`, display: "flex", padding: "8px 8px calc(8px + env(safe-area-inset-bottom))" }}>
          {[
            ["today", "Today", Home],
            ["train", "Train", Dumbbell],
            ["progress", "Progress", TrendingUp],
            ["coach", "Coach", MessageSquare],
          ].map(([key, label, Ic]) => (
            <button key={key} onClick={() => setTab(key)} aria-current={tab === key ? "page" : undefined}
              style={{ flex: 1, background: "none", border: "none", padding: "8px 4px", minHeight: 52, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <Ic size={20} color={tab === key ? C.energy : C.muted} strokeWidth={tab === key ? 2.4 : 2} />
              <span style={{ fontSize: 10, fontWeight: 600, color: tab === key ? C.text : C.muted, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</span>
            </button>
          ))}
        </nav>

        {showReadiness && (
          <Sheet title="Readiness" onClose={() => setShowReadiness(false)}>
            <div style={{ display: "flex", marginTop: 18 }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600 }}>Long-term average</div>
                <div className="ff-d" style={{ fontSize: 34, fontWeight: 800, color: C.text, marginTop: 4 }}>{longAvg}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600 }}>Recent average</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <span className="ff-d" style={{ fontSize: 34, fontWeight: 800, color: C.recovery }}>{recentAvg}</span>
                  {recentAvg >= longAvg
                    ? <TrendingUp size={18} color={C.recovery} />
                    : <TrendingDown size={18} color={C.recovery} />}
                </div>
              </div>
            </div>

            <div style={{ color: C.muted, fontSize: 11, marginTop: 18 }}>Here's how your scores are trending:</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {[
                ["Sleep", "↑"], ["Mood", "↔"], ["Energy", "↔"], ["Stress", "↑"], ["Soreness", "↑"],
              ].map(([label, arrow]) => (
                <div key={label} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 16, marginTop: 3, color: arrow === "↑" ? C.recovery : C.muted }}>{arrow}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
              <div style={ava}>M</div>
              <div style={{ flex: 1, background: C.surface2, borderRadius: 14, padding: "10px 14px", color: C.body, fontSize: 13, lineHeight: 1.55 }}>
                {recentAvg >= longAvg
                  ? "Your readiness is trending higher than usual. Recovering is part of training — and you're doing it well."
                  : "Your readiness is trending lower than usual — ease off the accessories today."}
              </div>
            </div>

            <div style={{ height: 170, marginTop: 18 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={readinessSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={C.line} vertical={false} />
                  <XAxis dataKey="d" stroke={C.muted} fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis domain={[40, 100]} hide />
                  <Line type="monotone" dataKey="v" stroke={C.recovery} strokeWidth={2} strokeDasharray="4 4" isAnimationActive={false}
                    dot={(props) => {
                      const { cx, cy, payload, key } = props;
                      return payload.today
                        ? <circle key={key} cx={cx} cy={cy} r={6} fill={C.recovery} stroke={C.bg} strokeWidth={2} />
                        : <circle key={key} cx={cx} cy={cy} r={3.5} fill={C.recovery} />;
                    }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ color: C.muted, fontSize: 11.5, marginTop: 12 }}>Synced from Whoop &amp; Apple Watch · visible to Coach Mike</div>
          </Sheet>
        )}

        {exDetail && (
          <Sheet title={exDetail} onClose={() => setExDetail(null)}>
            <div style={{ display: "flex", marginTop: 16, borderBottom: `1px solid ${C.line}` }}>
              <button onClick={() => setExTab("history")}
                style={{ flex: 1, background: "none", border: "none", borderBottom: `2px solid ${exTab === "history" ? C.energy : "transparent"}`,
                  padding: "10px 0", fontSize: 13, fontWeight: 600, color: exTab === "history" ? C.text : C.muted }}>
                History
              </button>
              <button onClick={() => setExTab("instruction")}
                style={{ flex: 1, background: "none", border: "none", borderBottom: `2px solid ${exTab === "instruction" ? C.energy : "transparent"}`,
                  padding: "10px 0", fontSize: 13, fontWeight: 600, color: exTab === "instruction" ? C.text : C.muted }}>
                Instruction
              </button>
            </div>

            {exTab === "history" && (
              <div style={{ marginTop: 16 }}>
                <div style={{ background: C.surface2, borderRadius: 15, padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <Award size={18} color={C.energy} />
                    <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600 }}>Personal record</span>
                  </div>
                  <div className="ff-d" style={{ fontSize: 24, fontWeight: 700, color: C.text, marginTop: 6 }}>{exHistory(exDetail).pr.label}</div>
                  <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{exHistory(exDetail).pr.date}</div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <Stepper label="Working max" unit="lb" step={5}
                    value={maxes[exDetail] ?? exHistory(exDetail).baseMax}
                    onChange={(v) => setMaxes({ ...maxes, [exDetail]: v })} />
                </div>

                <Label>Estimated 1-rep max</Label>
                <div style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={exHistory(exDetail).series}>
                      <Line type="monotone" dataKey="lb" stroke={C.energy} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                      <XAxis dataKey="wk" stroke={C.muted} fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis hide domain={["dataMin - 10", "dataMax + 10"]} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {exTab === "instruction" && (() => {
              const found = workout.exercises.find((e) => e.name === exDetail);
              const cues = found ? found.cues : [
                "Brace before every rep.",
                "Control the negative — two seconds down.",
                "Stop one rep before form breaks.",
              ];
              return (
                <div style={{ marginTop: 16 }}>
                  {VIDEO_IDS[exDetail] && (
                    <>
                      <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 14, overflow: "hidden",
                        background: C.surface2, border: `1px solid ${C.line}`, marginBottom: 14 }}>
                        <iframe style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                          src={`https://www.youtube-nocookie.com/embed/${VIDEO_IDS[exDetail]}`}
                          title={`${exDetail} — form video`}
                          loading="lazy"
                          allowFullScreen
                          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" />
                      </div>
                      <div style={{ color: C.muted, fontSize: 11, marginBottom: 14 }}>Form demo · YouTube</div>
                    </>
                  )}
                  {cues.map((c, j) => (
                    <div key={j} style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 10 }}>
                      <span style={{ width: 5, height: 5, borderRadius: 99, background: C.energy, flexShrink: 0, marginTop: 7 }} />
                      <span style={{ color: C.body, fontSize: 13.5, lineHeight: 1.6 }}>{c}</span>
                    </div>
                  ))}
                  {found?.note && (
                    <div style={{ marginTop: 10, padding: 11, borderRadius: 11, background: C.surface2, border: `1px solid ${C.line}`, color: C.energy, fontSize: 12.5, lineHeight: 1.55 }}>
                      {found.note}
                    </div>
                  )}
                </div>
              );
            })()}
          </Sheet>
        )}
      </div>
    </div>
  );
}

// ---- Shared ----
const inp = {
  width: "100%", boxSizing: "border-box", background: C.surface, border: `1px solid ${C.line}`,
  borderRadius: 13, padding: "15px 16px", minHeight: 48, color: C.text, fontSize: 14, marginBottom: 12,
  fontFamily: "'Space Grotesk', system-ui, sans-serif", outline: "none",
};
const btnP = {
  background: `linear-gradient(135deg, ${C.energy}, ${C.energyDeep})`, color: C.inkOnEnergy, border: "none",
  borderRadius: 15, padding: "15px 20px", minHeight: 50, fontSize: 15, fontWeight: 700,
};
const btnG = {
  background: "none", color: C.body, border: `1px solid ${C.lineStrong}`, borderRadius: 15,
  padding: "13px 20px", minHeight: 48, fontSize: 14, fontWeight: 600,
};
const ava = {
  width: 40, height: 40, borderRadius: "50%", background: C.surface2, border: `1px solid ${C.lineStrong}`,
  display: "flex", alignItems: "center", justifyContent: "center", color: C.energy, fontWeight: 700, fontSize: 16,
  flexShrink: 0, fontFamily: "'Space Grotesk', sans-serif",
};
function Stat({ n, t, hot }) {
  return (
    <div style={{ flex: 1, background: C.surface, border: `1px solid ${hot ? "rgba(247,183,51,.45)" : C.line}`, borderRadius: 17, padding: "15px 10px", textAlign: "center" }}>
      <div className="ff-d" style={{ fontSize: 31, fontWeight: 800, color: hot ? C.energy : C.text, lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: ".1em", marginTop: 5, fontWeight: 600 }}>{t}</div>
    </div>
  );
}
function MiniStat({ n, t }) {
  return (
    <div style={{ flex: 1, background: C.surface2, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
      <div className="ff-d" style={{ fontSize: 22, fontWeight: 800, color: C.text, lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: ".1em", marginTop: 3, fontWeight: 600 }}>{t}</div>
    </div>
  );
}
