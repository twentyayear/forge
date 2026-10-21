import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Home, Dumbbell, TrendingUp, TrendingDown, MessageSquare, Volume2, VolumeX, Mic,
  ChevronDown, ChevronRight, Award, Watch, Activity, Flame, Play, Check, Moon, Trash2,
  Plus, Minus, Timer, X, PartyPopper, Download, Settings,
} from "lucide-react";
import { realHistory, averageScore, buildServerHistoryCsv } from "./history.js";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, BarChart, Bar, Tooltip, CartesianGrid } from "recharts";
import { T } from "./theme.js";
import { api, foodSearch } from "./lib/api.js";
import { createSpeaker } from "./lib/speech.js";
import { EX_LIB, VIDEO_IDS, EX_INFO, FALLBACK_CUE, BLOCK_TYPES } from "./data/exercises.js";
import { CHECKIN_QS } from "./data/checkin.js";
import { FUEL_QUICK, DEFAULT_FUEL_TARGETS, DEVICE_OPTIONS } from "./data/fuel.js";
import { DAY_MS, WD, startOfDay, iso, fmtLong, fmtMonth } from "./data/dates.js";
import { Sheet, Ring, Mark } from "./ui/index.js";

// LEGACY SCREENS UNTIL W.7-W.10 REBUILD THEM: THE OLD KEYS, EACH MAPPED TO A LOOK-A TOKEN.
const C = {
  bg: T.color.bg, surface: T.color.surface, surface2: T.color.surface2,
  line: T.color.line, lineStrong: T.color.lineStrong,
  text: T.color.text, body: T.color.body, muted: T.color.muted,
  energy: T.color.energy, energyDeep: T.color.energyDeep,
  recovery: T.color.recovery, inkOnEnergy: T.color.inkOnEnergy,
};

const css = `
*, *::before, *::after { box-sizing: border-box; }
html, body { overflow-x: hidden; }
.ff-d { font-family: ${T.font.display}; }
.ff-b { font-family: ${T.font.body}; }
button { cursor: pointer; font-family: ${T.font.body}; }
button:focus-visible, input:focus-visible { outline: 2px solid ${C.recovery}; outline-offset: 2px; border-radius: 12px; }
button:active { transform: scale(.985); }
@keyframes popIn { 0%{transform:scale(.6);opacity:0} 70%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
.pop { animation: popIn .5s cubic-bezier(.2,.9,.3,1) both; }
@keyframes chipIn { from{transform:translateY(4px);opacity:0} to{transform:translateY(0);opacity:1} }
.chip-in { animation: chipIn .25s ease-out both; }
.cal-row { scrollbar-width: none; }
.cal-row::-webkit-scrollbar { display: none; }
@keyframes orbPulse { 0%,100%{transform:scale(1);opacity:.55} 50%{transform:scale(1.28);opacity:.12} }
.orb-live { animation: orbPulse 1.4s ease-in-out infinite; }
@keyframes eq { 0%,100%{transform:scaleY(.35)} 50%{transform:scaleY(1)} }
.eq span { display:inline-block; width:3px; height:14px; margin:0 2px; border-radius:2px;
  background:${C.inkOnEnergy}; transform-origin:bottom; animation: eq .7s ease-in-out infinite; }
.eq span:nth-child(2){animation-delay:.15s}.eq span:nth-child(3){animation-delay:.3s}.eq span:nth-child(4){animation-delay:.1s}
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



// ---- Calendar (TrainHeroic-style strip) ----
const TODAY = startOfDay(new Date());
const CAL_DAYS = Array.from({ length: 42 }, (_, i) => new Date(TODAY.getTime() + (i - 28) * DAY_MS));

// NULL WITH NO CHECK-INS: THERE IS NO INVENTED SCORE TO AVERAGE ANY MORE.
const recentAvgFor = (series) => {
  const last3 = series.slice(-3);
  if (!last3.length) return null;
  return Math.round(last3.reduce((s, p) => s + p.v, 0) / last3.length);
};

// ---- Bits ----
const Label = ({ children }) => (
  <div className="ff-b" style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: ".14em", margin: "24px 0 10px" }}>{children}</div>
);
const Card = ({ children, style, ...p }) => (
  <div {...p} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: 16, ...style }}>{children}</div>
);
const Pill = ({ children, tone, style }) => (
  <span style={{ borderRadius: 999, padding: "5px 11px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
    background: tone === "energy" ? "rgba(41,171,226,.13)" : "rgba(122,203,239,.12)",
    color: tone === "energy" ? C.energy : C.recovery, ...style }}>{children}</span>
);


function CalendarStrip({ selected, onSelect, dotFor, labelFor }) {
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
          style={{ background: "none", border: `1px solid ${selected === todayIso ? C.line : "rgba(41,171,226,.5)"}`, borderRadius: 8, padding: "5px 11px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: selected === todayIso ? C.muted : C.energy }}>
          Today
        </button>
      </div>
      <div ref={rowRef} className="cal-row" style={{ display: "flex", gap: 4, overflowX: "auto", padding: "0 14px 4px" }}>
        {CAL_DAYS.map((d) => {
          const k = iso(d);
          const isSel = k === selected, isToday = k === todayIso;
          const dot = dotFor(k) || "transparent";
          const label = labelFor(k, d);
          return (
            <button key={k} ref={(el) => { cellRefs.current[k] = el; }} onClick={() => onSelect(k)} aria-pressed={isSel}
              aria-label={label}
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

// Postgres date/timestamp columns arrive JSON-serialized as full ISO strings
// (e.g. "2026-09-02T00:00:00.000Z") — reduce to the "YYYY-MM-DD" key the rest
// of the app already keys on.
function dayKey(v) {
  return typeof v === "string" ? v.slice(0, 10) : iso(new Date(v));
}
// U6 (ask 32): Inbox's "relative day" -- Today / Yesterday / weekday / MM-DD.
function relativeDay(v) {
  const k = dayKey(v);
  const days = Math.round((TODAY.getTime() - new Date(k + "T00:00:00").getTime()) / DAY_MS);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return new Date(k + "T00:00:00").toLocaleDateString([], { weekday: "short" });
  return k.slice(5);
}
// bootstrap `fuel` rows -> the { "<iso>": [{id,name,kcal,protein,carbs,fat}] } shape.
function fuelRowsToLog(rows) {
  const out = {};
  for (const r of rows) {
    const day = dayKey(r.eaten_on);
    const item = { id: r.id, name: r.name, kcal: r.calories ?? 0, protein: r.protein_g ?? 0, carbs: r.carbs_g ?? 0, fat: r.fat_g ?? 0 };
    (out[day] ??= []).push(item);
  }
  return out;
}
// bootstrap `checkins` rows -> { "<iso>": {score, answers} }, for the real trend series.
function checkinsToMap(rows) {
  const out = {};
  for (const r of rows) out[dayKey(r.day)] = { score: r.score, answers: r.answers };
  return out;
}
// Readiness trend: today + prior days from real checkin rows only.
function readinessSeriesForServer(checkinsMap, todayScore) {
  const todayIso = iso(TODAY);
  const series = [];
  for (let o = -9; o <= 0; o++) {
    const d = new Date(TODAY.getTime() + o * DAY_MS);
    const k = iso(d);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    if (k === todayIso) { if (todayScore != null) series.push({ d: label, v: todayScore, today: true }); }
    else if (checkinsMap[k]) series.push({ d: label, v: checkinsMap[k].score });
  }
  return series;
}

// Assignment -> engine shape. exercise_key IS the EX_LIB name
// string (no separate key field) -- fall back gracefully when a key has no
// EX_LIB match (custom/typo'd keys still render, just without cues/video).
function activeWorkoutFromAssignment(w) {
  const blocks = w.blocks || [];
  const exercises = blocks.map((b) => {
    const info = EX_INFO[b.exercise_key];
    const maxReps = Math.max(...b.sets.map((s) => s.reps));
    const firstWeight = b.sets[0]?.weight_lbs;
    return {
      name: b.exercise_key,
      sets: b.sets.length,
      reps: String(maxReps),
      load: firstWeight != null ? `${firstWeight} lb` : "Bodyweight",
      cues: info?.cues ?? [],
      note: b.note,
      setRows: b.sets.map((s) => ({ reps: s.reps, w: s.weight_lbs ?? 0, done: false })),
      rest_sec: b.rest_sec ?? 90,
    };
  });
  return {
    name: w.title,
    duration: `${exercises.length} exercise${exercises.length === 1 ? "" : "s"}`,
    focus: w.notes || "",
    exercises,
  };
}


// ---- App ----
// SIGN-IN LIVES IN src/app/App.jsx; THIS COMPONENT STARTS FROM A SESSION AND HANDS 401s BACK THROUGH onSignedOut.
// forcedTab ("coach" | "fuel" | "you") RENDERS ONLY THAT TAB FOR THE NEW CLIENT SHELL: NO SURVEY, NO LEGACY HEADER ROW, NO LEGACY TAB BAR.
// voiceOn / onVoiceChange LET THE SHELL OWN THE VOICE SWITCH, BECAUSE THE SERVER PROFILE WHITELIST CANNOT STORE IT.
export default function Workhart({ session, onSignedOut, forcedTab, voiceOn: voiceOnProp, onVoiceChange }) {
  const [screen, setScreen] = useState("boot");
  const [writeError, setWriteError] = useState("");
  const [serverCheckins, setServerCheckins] = useState({}); // { "<iso>": {score, answers} }
  const [serverUser, setServerUser] = useState(null); // bootstrap `user` row
  const [serverAssignments, setServerAssignments] = useState([]); // bootstrap `assignments`
  const [serverLogs, setServerLogs] = useState([]); // bootstrap `workoutLogs`
  // ---- Messaging (U6, ask 32) ----
  const [unreadMessages, setUnreadMessages] = useState(0); // bootstrap count, zeroed after the athlete's own read POST
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadBusy, setThreadBusy] = useState(false);
  const [msgDraft, setMsgDraft] = useState("");
  const [msgBusy, setMsgBusy] = useState(false);
  const [msgError, setMsgError] = useState("");
  const firstName = (serverUser?.name || session?.name || "").split(" ")[0];
  // Athlete-side assignment lookup + engine data. With no assignment today the
  // Train tab still falls back to the built-in `workout` until W.7 rebuilds it.
  const assignmentForDay = (dayIso) =>
    serverAssignments.find((a) => dayKey(a.scheduled_for) === dayIso && a.status !== "skipped") || null;
  const todayAssignment = assignmentForDay(iso(TODAY));
  const activeWorkout = useMemo(
    () => (todayAssignment ? activeWorkoutFromAssignment(todayAssignment.workout) : workout),
    [todayAssignment]
  );
  // ---- Console (admin) ----
  const [consoleScreen, setConsoleScreen] = useState("roster"); // "roster" | "dashboard" | "builder" | "inbox" | "thread" | "drafts" | "draftDetail"
  const [roster, setRoster] = useState([]);
  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterError, setRosterError] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [overview, setOverview] = useState(null);
  const [overviewBusy, setOverviewBusy] = useState(false);
  const [autoSendBusy, setAutoSendBusy] = useState(false);
  // ---- Console: Inbox + thread (U6, ask 32) ----
  const [inbox, setInbox] = useState([]);
  const [inboxBusy, setInboxBusy] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const [adminThreadUser, setAdminThreadUser] = useState(null); // {id, name, email}
  const [adminThreadOrigin, setAdminThreadOrigin] = useState("inbox"); // "inbox" | "dashboard" -- where Back goes
  const [adminThread, setAdminThread] = useState([]);
  const [adminThreadBusy, setAdminThreadBusy] = useState(false);
  const [adminMsgDraft, setAdminMsgDraft] = useState("");
  const [adminMsgBusy, setAdminMsgBusy] = useState(false);
  const [adminMsgError, setAdminMsgError] = useState("");
  // ---- Console: AI Kyle drafts (U7, ask 33) ----
  const [drafts, setDrafts] = useState([]);
  const [draftsBusy, setDraftsBusy] = useState(false);
  const [draftsError, setDraftsError] = useState("");
  const [selectedDraftId, setSelectedDraftId] = useState(null);
  const [draftBody, setDraftBody] = useState("");
  const [draftActionBusy, setDraftActionBusy] = useState(false);
  const [draftActionError, setDraftActionError] = useState("");
  const [existingWorkouts, setExistingWorkouts] = useState([]);
  const [builderMode, setBuilderMode] = useState("new"); // "new" | "existing"
  const [builderTitle, setBuilderTitle] = useState("");
  const [builderExercises, setBuilderExercises] = useState([]);
  const [builderExistingId, setBuilderExistingId] = useState(null);
  const [builderDate, setBuilderDate] = useState(() => iso(new Date(TODAY.getTime() + DAY_MS)));
  const [builderLibQ, setBuilderLibQ] = useState("");
  const [builderLibEq, setBuilderLibEq] = useState("All");
  const [builderBusy, setBuilderBusy] = useState(false);
  const [builderError, setBuilderError] = useState("");
  const [foodUnavailable, setFoodUnavailable] = useState(false);
  const [device, setDevice] = useState(() => localStorage.getItem("workhart.device") || "");
  const [survey, setSurvey] = useState({});
  const [checkStep, setCheckStep] = useState(0);
  // NULL UNTIL TODAY'S CHECK-IN EXISTS: A SKIPPED CHECK-IN SHOWS NO SCORE RATHER THAN A MADE-UP ONE.
  const [readyToday, setReadyToday] = useState(null);
  const readinessSeries = useMemo(
    () => readinessSeriesForServer(serverCheckins, readyToday),
    [readyToday, serverCheckins]
  );
  const recentAvg = recentAvgFor(readinessSeries);
  const baselineAvg = averageScore(serverCheckins) ?? readyToday;
  const histFor = (name) => realHistory(name, serverLogs);
  const [tab, setTab] = useState(forcedTab ?? "today");
  const [selDay, setSelDay] = useState(iso(TODAY));
  const [active, setActive] = useState(null);        // { i, done }
  const [grid, setGrid] = useState({});              // { [exIndex]: [{reps, w, done}] }
  const [videoOpen, setVideoOpen] = useState(false);
  const [log, setLog] = useState([]);                // [{i, w, reps}]
  const [rest, setRest] = useState(null);            // seconds or null
  const [summary, setSummary] = useState(null);      // {sets, volume, minutes}
  const [doneToday, setDoneToday] = useState(false);
  const [showReadiness, setShowReadiness] = useState(false);
  const [rpe, setRpe] = useState(null);
  const [line, setLine] = useState(null);
  const [exDetail, setExDetail] = useState(null);    // exercise name or null
  const [exTab, setExTab] = useState("history");
  const [libQ, setLibQ] = useState("");
  const [libEq, setLibEq] = useState("All");
  const [maxes, setMaxes] = useState({});       // name -> working max lb
  const [voiceOn, setVoiceOnState] = useState(voiceOnProp ?? true);
  const setVoiceOn = (v) => { setVoiceOnState(v); if (onVoiceChange) onVoiceChange(v); };
  const [talking, setTalking] = useState(false);
  const [coach, setCoach] = useState(() => {
    const s = localStorage.getItem("workhart.coach");
    return s && s !== "Mike Torres" ? s : "Kyle";
  });
  const [showSettings, setShowSettings] = useState(false);
  const coachName = coach.trim() || "Kyle";
  const coachFirst = coachName.split(/\s+/)[0];
  const coachInitial = coachFirst[0].toUpperCase();
  const [voiceStatus, setVoiceStatus] = useState(null);
  const speakerRef = useRef(null);
  if (speakerRef.current === null) {
    speakerRef.current = createSpeaker({ onLine: setLine, onTalking: setTalking, onStatus: setVoiceStatus });
  }
  const [devs, setDevs] = useState([
    { name: "Apple Watch", detail: "Heart rate · Workouts", on: true, icon: Watch },
    { name: "Whoop 5.0", detail: "Recovery · Strain · Sleep", on: true, icon: Activity },
    { name: "Garmin", detail: "via Health Connect", on: false, icon: Watch },
    { name: "Oura Ring", detail: "Sleep · HRV", on: false, icon: Moon },
    { name: "Fitbit", detail: "Steps · Heart rate", on: false, icon: Activity },
  ]);
  const [fuelLog, setFuelLog] = useState({});
  const [fuelTargets, setFuelTargets] = useState({ ...DEFAULT_FUEL_TARGETS });
  const [fuelDay, setFuelDay] = useState(iso(TODAY));
  const [foodQ, setFoodQ] = useState("");
  const [foodResults, setFoodResults] = useState(null);
  const [foodBusy, setFoodBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ name: "", kcal: "", protein: "", carbs: "", fat: "" });
  const [bodyweight, setBodyweight] = useState(() => {
    const v = parseInt(localStorage.getItem("workhart.bodyweight"), 10);
    return Number.isFinite(v) ? v : 180;
  });
  const [fuelGoal, setFuelGoal] = useState("maintain"); // cut | maintain | build
  const idx = useRef(0);
  const startedAt = useRef(null);

  const stopAudio = () => speakerRef.current.stop();
  const speak = (text) => speakerRef.current.speak(text);
  useEffect(() => { speakerRef.current.setVoiceOn(voiceOn); }, [voiceOn]);
  useEffect(() => () => stopAudio(), []);

  // ---- Bootstrap hydration ----
  const goSignedOut = () => {
    stopAudio();
    onSignedOut();
  };
  const hydrateFromBootstrap = (data) => {
    const profile = data.profile || {};
    if (data.user) setServerUser(data.user);
    if (data.user?.role === "admin") {
      // Kyle doesn't train here -- land in the console instead of the
      // athlete tabs; skip the survey entirely.
      setConsoleScreen("roster");
      setSelectedUserId(null);
      setOverview(null);
      setScreen("console");
      return;
    }
    setServerAssignments(data.assignments || []);
    setServerLogs(data.workoutLogs || []);
    setUnreadMessages(Number.isFinite(data.unreadMessages) ? data.unreadMessages : 0);
    setFuelLog(fuelRowsToLog(data.fuel || []));
    if (profile.fuelTargets && typeof profile.fuelTargets === "object") {
      setFuelTargets({ ...DEFAULT_FUEL_TARGETS, ...profile.fuelTargets });
    }
    if (Number.isFinite(profile.bodyweight)) setBodyweight(profile.bodyweight);
    if (typeof profile.coach === "string" && profile.coach) setCoach(profile.coach);
    if (typeof profile.device === "string") setDevice(profile.device);

    const cmap = checkinsToMap(data.checkins || []);
    setServerCheckins(cmap);
    const todayEntry = cmap[iso(TODAY)];
    setReadyToday(todayEntry ? todayEntry.score : null);

    if (todayEntry || forcedTab) {
      setScreen("app");
    } else {
      setScreen("survey");
    }
  };
  const refetchBootstrap = async () => {
    const res = await api("/api/bootstrap");
    if (res.status === 401) return goSignedOut();
    if (!res.ok) { setWriteError("Couldn't refresh your data — try again."); return; }
    hydrateFromBootstrap(res.data);
  };
  // App.jsx already confirmed the session with /api/auth/me; only bootstrap is fetched here.
  useEffect(() => {
    (async () => {
      try {
        const bRes = await api("/api/bootstrap");
        if (bRes.status === 401 || !bRes.ok) { goSignedOut(); return; }
        hydrateFromBootstrap(bRes.data);
      } catch {
        goSignedOut();
      }
    })();
  }, []); // eslint-disable-line

  // Initialize the set grid when the exercise changes; collapse the video
  useEffect(() => {
    if (active && grid[active.i] === undefined) {
      const ex = activeWorkout.exercises[active.i];
      const rows = ex.setRows
        ? ex.setRows.map((r) => ({ ...r }))
        : Array.from({ length: ex.sets }, () => ({
            reps: parseReps(ex.reps), w: parseWeight(ex.load) ?? 0, done: false,
          }));
      setGrid((g) => ({ ...g, [active.i]: rows }));
    }
    setVideoOpen(false);
  }, [active?.i]); // eslint-disable-line

  // Rest countdown
  useEffect(() => {
    if (rest === null) return;
    if (rest <= 0) { setRest(null); return; }
    const t = setTimeout(() => setRest(rest - 1), 1000);
    return () => clearTimeout(t);
  }, [rest]);

  // Coach tab thread (U6, ask 32): fetch on open, then mark Kyle's messages
  // read and zero the nav badge.
  useEffect(() => {
    if (tab !== "coach") return;
    let cancelled = false;
    (async () => {
      setThreadBusy(true);
      try {
        const res = await api("/api/messages");
        if (cancelled) return;
        if (res.status === 401) { setThreadBusy(false); return goSignedOut(); }
        if (!res.ok) { setThreadBusy(false); return; }
        const rows = res.data;
        if (cancelled) return;
        setThreadMessages(rows);
        setThreadBusy(false);
        const readRes = await api("/api/messages/read", { method: "POST" });
        if (!cancelled && readRes.ok) setUnreadMessages(0);
      } catch {
        if (!cancelled) setThreadBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab]); // eslint-disable-line

  const sendThreadMessage = async () => {
    const body = msgDraft.trim();
    if (!body) return;
    setMsgBusy(true); setMsgError("");
    try {
      const res = await api("/api/messages", { method: "POST", body: JSON.stringify({ body }) });
      if (res.status === 401) { setMsgBusy(false); return goSignedOut(); }
      if (!res.ok) { setMsgError("Couldn't send — try again."); setMsgBusy(false); return; }
      const row = res.data;
      setThreadMessages((cur) => [...cur, row]);
      setMsgDraft("");
      setMsgBusy(false);
    } catch {
      setMsgError("Couldn't send — try again.");
      setMsgBusy(false);
    }
  };

  // ---- Console (admin, server mode): data fetching ----
  useEffect(() => {
    if (screen !== "console" || consoleScreen !== "roster") return;
    let cancelled = false;
    (async () => {
      setRosterBusy(true); setRosterError("");
      try {
        const res = await api("/api/admin/users");
        if (cancelled) return;
        if (res.status === 401) { setRosterBusy(false); return goSignedOut(); }
        if (!res.ok) { setRosterError("Couldn't load the roster — try again."); setRosterBusy(false); return; }
        const rows = res.data;
        if (cancelled) return;
        setRoster(rows.filter((u) => u.role !== "admin"));
        setRosterBusy(false);
      } catch {
        if (!cancelled) { setRosterError("Couldn't load the roster — try again."); setRosterBusy(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [screen, consoleScreen]); // eslint-disable-line

  useEffect(() => {
    if (screen !== "console" || consoleScreen !== "dashboard" || !selectedUserId) return;
    let cancelled = false;
    (async () => {
      setOverviewBusy(true);
      try {
        const res = await api(`/api/admin/users/${selectedUserId}/overview`);
        if (cancelled) return;
        if (res.status === 401) { setOverviewBusy(false); return goSignedOut(); }
        if (!res.ok) { setOverviewBusy(false); return; }
        setOverview(res.data);
        setOverviewBusy(false);
      } catch {
        if (!cancelled) setOverviewBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [screen, consoleScreen, selectedUserId]); // eslint-disable-line

  useEffect(() => {
    if (screen !== "console" || consoleScreen !== "builder") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api("/api/admin/workouts");
        if (cancelled) return;
        if (res.status === 401) return goSignedOut();
        if (res.ok) setExistingWorkouts(res.data);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [screen, consoleScreen]); // eslint-disable-line

  // Inbox list (U6, ask 32).
  useEffect(() => {
    if (screen !== "console" || consoleScreen !== "inbox") return;
    let cancelled = false;
    (async () => {
      setInboxBusy(true); setInboxError("");
      try {
        const res = await api("/api/admin/inbox");
        if (cancelled) return;
        if (res.status === 401) { setInboxBusy(false); return goSignedOut(); }
        if (!res.ok) { setInboxError("Couldn't load the inbox — try again."); setInboxBusy(false); return; }
        setInbox(res.data);
        setInboxBusy(false);
      } catch {
        if (!cancelled) { setInboxError("Couldn't load the inbox — try again."); setInboxBusy(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [screen, consoleScreen]); // eslint-disable-line

  // Admin thread view -- fetching also marks the user's unread rows read
  // server-side; reflect that locally in the inbox list (U6, ask 32).
  useEffect(() => {
    if (screen !== "console" || consoleScreen !== "thread" || !adminThreadUser) return;
    let cancelled = false;
    (async () => {
      setAdminThreadBusy(true);
      try {
        const res = await api(`/api/admin/users/${adminThreadUser.id}/messages`);
        if (cancelled) return;
        if (res.status === 401) { setAdminThreadBusy(false); return goSignedOut(); }
        if (!res.ok) { setAdminThreadBusy(false); return; }
        const body = res.data;
        if (cancelled) return;
        setAdminThread(body.messages);
        setAdminThreadBusy(false);
        if (body.marked > 0) {
          setInbox((cur) => cur.map((r) => (r.user.id === adminThreadUser.id ? { ...r, unread: 0 } : r)));
        }
      } catch {
        if (!cancelled) setAdminThreadBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [screen, consoleScreen, adminThreadUser]); // eslint-disable-line

  // AI Kyle drafts list (U7, ask 33) -- same fetch-on-open pattern as
  // roster/inbox above; the pending count only reflects reality once this
  // tab has been opened at least once this session (matches the Inbox badge).
  useEffect(() => {
    if (screen !== "console" || consoleScreen !== "drafts") return;
    let cancelled = false;
    (async () => {
      setDraftsBusy(true); setDraftsError("");
      try {
        const res = await api("/api/admin/drafts");
        if (cancelled) return;
        if (res.status === 401) { setDraftsBusy(false); return goSignedOut(); }
        if (!res.ok) { setDraftsError("Couldn't load drafts — try again."); setDraftsBusy(false); return; }
        setDrafts(res.data);
        setDraftsBusy(false);
      } catch {
        if (!cancelled) { setDraftsError("Couldn't load drafts — try again."); setDraftsBusy(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [screen, consoleScreen]); // eslint-disable-line

  const openUserDashboard = (id) => { setSelectedUserId(id); setOverview(null); setConsoleScreen("dashboard"); };
  const backToRoster = () => { setConsoleScreen("roster"); setSelectedUserId(null); setOverview(null); };
  const openBuilder = () => {
    setBuilderMode("new"); setBuilderTitle(""); setBuilderExercises([]); setBuilderExistingId(null);
    setBuilderDate(iso(new Date(TODAY.getTime() + DAY_MS)));
    setBuilderError(""); setBuilderLibQ(""); setBuilderLibEq("All");
    setConsoleScreen("builder");
  };
  const backToDashboard = () => setConsoleScreen("dashboard");

  // Inbox / thread (U6, ask 32).
  const openAdminThread = (user, origin = "inbox") => {
    setAdminThreadUser(user); setAdminThreadOrigin(origin);
    setAdminThread([]); setAdminMsgDraft(""); setAdminMsgError("");
    setConsoleScreen("thread");
  };
  const backFromThread = () => setConsoleScreen(adminThreadOrigin === "dashboard" ? "dashboard" : "inbox");
  const sendAdminMessage = async () => {
    const body = adminMsgDraft.trim();
    if (!body || !adminThreadUser) return;
    setAdminMsgBusy(true); setAdminMsgError("");
    try {
      const res = await api(`/api/admin/users/${adminThreadUser.id}/messages`, {
        method: "POST", body: JSON.stringify({ body }),
      });
      if (res.status === 401) { setAdminMsgBusy(false); return goSignedOut(); }
      if (!res.ok) { setAdminMsgError("Couldn't send — try again."); setAdminMsgBusy(false); return; }
      const row = res.data;
      setAdminThread((cur) => [...cur, row]);
      setInbox((cur) => cur.map((r) => (r.user.id === adminThreadUser.id
        ? { ...r, last_message: { sender: "kyle", body: row.body, created_at: row.created_at } }
        : r)));
      setAdminMsgDraft("");
      setAdminMsgBusy(false);
    } catch {
      setAdminMsgError("Couldn't send — try again.");
      setAdminMsgBusy(false);
    }
  };

  // AI Kyle drafts (U7, ask 33).
  const selectedDraft = drafts.find((d) => d.id === selectedDraftId) || null;
  const openDraft = (d) => {
    setSelectedDraftId(d.id); setDraftBody(d.body); setDraftActionError("");
    setConsoleScreen("draftDetail");
  };
  const backFromDraft = () => { setConsoleScreen("drafts"); setSelectedDraftId(null); };
  const approveDraft = async () => {
    if (!selectedDraft) return;
    setDraftActionBusy(true); setDraftActionError("");
    try {
      // Persist any unsaved textarea edit first so approve sends the current body.
      if (draftBody !== selectedDraft.body) {
        const saveRes = await api(`/api/admin/drafts/${selectedDraft.id}`, {
          method: "PATCH", body: JSON.stringify({ body: draftBody }),
        });
        if (saveRes.status === 401) { setDraftActionBusy(false); return goSignedOut(); }
        if (!saveRes.ok) { setDraftActionError("Couldn't save your edit — try again."); setDraftActionBusy(false); return; }
      }
      const res = await api(`/api/admin/drafts/${selectedDraft.id}/approve`, { method: "POST" });
      if (res.status === 401) { setDraftActionBusy(false); return goSignedOut(); }
      if (!res.ok) { setDraftActionError("Couldn't approve — try again."); setDraftActionBusy(false); return; }
      setDrafts((cur) => cur.filter((d) => d.id !== selectedDraft.id));
      setDraftActionBusy(false);
      backFromDraft();
    } catch {
      setDraftActionError("Couldn't approve — try again.");
      setDraftActionBusy(false);
    }
  };
  const rejectDraft = async () => {
    if (!selectedDraft) return;
    setDraftActionBusy(true); setDraftActionError("");
    try {
      const res = await api(`/api/admin/drafts/${selectedDraft.id}/reject`, { method: "POST" });
      if (res.status === 401) { setDraftActionBusy(false); return goSignedOut(); }
      if (!res.ok) { setDraftActionError("Couldn't reject — try again."); setDraftActionBusy(false); return; }
      setDrafts((cur) => cur.filter((d) => d.id !== selectedDraft.id));
      setDraftActionBusy(false);
      backFromDraft();
    } catch {
      setDraftActionError("Couldn't reject — try again.");
      setDraftActionBusy(false);
    }
  };
  const toggleAutoSend = async (userId, next) => {
    setAutoSendBusy(true);
    try {
      const res = await api(`/api/admin/users/${userId}/settings`, {
        method: "PATCH", body: JSON.stringify({ kyleAutoSend: next }),
      });
      if (res.status === 401) { setAutoSendBusy(false); return goSignedOut(); }
      if (!res.ok) { setAutoSendBusy(false); return; }
      const profile = res.data;
      setOverview((cur) => (cur ? { ...cur, profile } : cur));
      setAutoSendBusy(false);
    } catch {
      setAutoSendBusy(false);
    }
  };

  const addBuilderExercise = (name) => {
    setBuilderExercises((cur) => [...cur, { exercise_key: name, sets: [{ reps: 8, weight_lbs: "" }], rest_sec: "", note: "" }]);
  };
  const removeBuilderExercise = (i) => setBuilderExercises((cur) => cur.filter((_, k) => k !== i));
  const updateBuilderExercise = (i, patch) => setBuilderExercises((cur) => cur.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const addBuilderSet = (i) => setBuilderExercises((cur) => cur.map((e, k) => {
    if (k !== i) return e;
    const last = e.sets[e.sets.length - 1];
    return { ...e, sets: [...e.sets, { ...last }] };
  }));
  const removeBuilderSet = (i) => setBuilderExercises((cur) => cur.map((e, k) => {
    if (k !== i || e.sets.length <= 1) return e;
    return { ...e, sets: e.sets.slice(0, -1) };
  }));
  const updateBuilderSet = (i, si, patch) => setBuilderExercises((cur) => cur.map((e, k) => {
    if (k !== i) return e;
    return { ...e, sets: e.sets.map((s, sk) => (sk === si ? { ...s, ...patch } : s)) };
  }));

  const submitAssignment = async () => {
    setBuilderError(""); setBuilderBusy(true);
    try {
      let workoutId = builderExistingId;
      if (builderMode === "new") {
        if (!builderTitle.trim()) { setBuilderError("Give the workout a title."); setBuilderBusy(false); return; }
        if (!builderExercises.length) { setBuilderError("Add at least one exercise."); setBuilderBusy(false); return; }
        const blocks = builderExercises.map((e) => ({
          exercise_key: e.exercise_key,
          sets: e.sets.map((s) => ({
            reps: Math.max(1, parseInt(s.reps, 10) || 1),
            ...(s.weight_lbs !== "" && s.weight_lbs != null ? { weight_lbs: Number(s.weight_lbs) } : {}),
          })),
          ...(e.rest_sec !== "" && e.rest_sec != null ? { rest_sec: Number(e.rest_sec) } : {}),
          ...(e.note && e.note.trim() ? { note: e.note.trim() } : {}),
        }));
        const wRes = await api("/api/admin/workouts", {
          method: "POST",
          body: JSON.stringify({ title: builderTitle.trim(), blocks }),
        });
        if (wRes.status === 401) return goSignedOut();
        if (!wRes.ok) { setBuilderError("Couldn't save the workout — check the exercises and try again."); setBuilderBusy(false); return; }
        const w = wRes.data;
        workoutId = w.id;
      }
      if (!workoutId) { setBuilderError("Pick a workout first."); setBuilderBusy(false); return; }

      const aRes = await api("/api/admin/assignments", {
        method: "POST",
        body: JSON.stringify({ user_id: selectedUserId, workout_id: workoutId, scheduled_for: builderDate }),
      });
      if (aRes.status === 401) return goSignedOut();
      if (aRes.status === 409) { setBuilderError("Already assigned that day."); setBuilderBusy(false); return; }
      if (!aRes.ok) { setBuilderError("Couldn't create the assignment — try again."); setBuilderBusy(false); return; }

      setBuilderBusy(false);
      const oRes = await api(`/api/admin/users/${selectedUserId}/overview`);
      if (oRes.ok) setOverview(oRes.data);
      setConsoleScreen("dashboard");
    } catch {
      setBuilderError("Something went wrong — try again.");
      setBuilderBusy(false);
    }
  };

  const openReadiness = () => {
    setShowReadiness(true);
    if (readyToday == null) return;
    speak(`Readiness ${readyToday}. ${recentAvg >= baselineAvg ? "Trending above your baseline — green light to push." : "A touch under baseline — keep the top sets honest."}`);
  };

  const openExercise = (name) => { setExDetail(name); setExTab("history"); };

  const applyFuelAdd = (day, item) => {
    setFuelLog((cur) => {
      const prevRows = cur[day] ?? [];
      const dayLog = [...prevRows, item];
      const next = { ...cur, [day]: dayLog };

      const prevProtein = prevRows.reduce((s, e) => s + (e.protein || 0), 0);
      const newProtein = dayLog.reduce((s, e) => s + (e.protein || 0), 0);
      if (day === iso(TODAY) && prevProtein < fuelTargets.protein && newProtein >= fuelTargets.protein) {
        if (localStorage.getItem("workhart.proteinSpokeDay") !== day) {
          localStorage.setItem("workhart.proteinSpokeDay", day);
          speak(`Protein target hit — ${fuelTargets.protein} grams down. That's how you build.`);
        }
      }
      return next;
    });
  };
  const addFuel = async (entry) => {
    const day = fuelDay;
    const res = await api("/api/fuel-logs", {
      method: "POST",
      body: JSON.stringify({
        eaten_on: day, name: entry.name,
        calories: Math.round(entry.kcal || 0),
        protein_g: Math.round(entry.protein || 0),
        carbs_g: Math.round(entry.carbs || 0),
        fat_g: Math.round(entry.fat || 0),
        source: "custom",
      }),
    });
    if (res.status === 401) return goSignedOut();
    if (!res.ok) { setWriteError("Couldn't save that food — try again."); return; }
    const row = res.data;
    applyFuelAdd(day, { id: row.id, name: row.name, kcal: row.calories ?? 0, protein: row.protein_g ?? 0, carbs: row.carbs_g ?? 0, fat: row.fat_g ?? 0 });
    setWriteError("");
  };
  const deleteFuel = async (id) => {
    const day = fuelDay;
    const res = await api(`/api/fuel-logs/${id}`, { method: "DELETE" });
    if (res.status === 401) return goSignedOut();
    if (!res.ok) { setWriteError("Couldn't delete that entry — try again."); return; }
    setFuelLog((cur) => ({ ...cur, [day]: (cur[day] ?? []).filter((e) => e.id !== id) }));
    setWriteError("");
  };
  const searchFood = async () => {
    const q = foodQ.trim();
    if (q.length < 2) return;
    setFoodBusy(true);
    setFoodUnavailable(false);
    try {
      const res = await foodSearch(q);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = res.data || {};
      setFoodResults(Array.isArray(json.results) ? json.results : []);
    } catch (e) {
      setFoodResults([]);
      setFoodUnavailable(true);
    } finally {
      setFoodBusy(false);
    }
  };
  const addManual = () => {
    if (!manual.name.trim()) return;
    addFuel({
      name: manual.name.trim(),
      kcal: Number(manual.kcal) || 0,
      protein: Number(manual.protein) || 0,
      carbs: Number(manual.carbs) || 0,
      fat: Number(manual.fat) || 0,
    });
    setManual({ name: "", kcal: "", protein: "", carbs: "", fat: "" });
    setManualOpen(false);
  };
  const changeBodyweight = async (v) => {
    const res = await api("/api/profile", { method: "PATCH", body: JSON.stringify({ bodyweight: v }) });
    if (res.status === 401) return goSignedOut();
    if (!res.ok) { setWriteError("Couldn't save bodyweight — try again."); return; }
    const profile = res.data;
    setBodyweight(profile.bodyweight);
    setWriteError("");
  };
  const changeDevice = async (v) => {
    const res = await api("/api/profile", { method: "PATCH", body: JSON.stringify({ device: v }) });
    if (res.status === 401) return goSignedOut();
    if (!res.ok) { setWriteError("Couldn't save device — try again."); return; }
    const profile = res.data;
    setDevice(profile.device);
    setWriteError("");
  };
  const calcTargets = async () => {
    const kcalMult = { cut: 12, maintain: 14, build: 16 }[fuelGoal];
    const proteinMult = { cut: 1.0, maintain: 0.9, build: 0.85 }[fuelGoal];
    const next = {
      kcal: Math.round((bodyweight * kcalMult) / 10) * 10,
      protein: Math.round(Math.round(bodyweight * proteinMult) / 5) * 5,
    };
    const res = await api("/api/profile", { method: "PATCH", body: JSON.stringify({ fuelTargets: next }) });
    if (res.status === 401) return goSignedOut();
    if (!res.ok) { setWriteError("Couldn't save targets — try again."); return; }
    const profile = res.data;
    setFuelTargets({ ...DEFAULT_FUEL_TARGETS, ...profile.fuelTargets });
    setWriteError("");
  };
  // Coach name is a live-typed field — reflect keystrokes immediately and
  // persist async; on failure show the inline note without fighting the typing.
  const changeCoach = async (v) => {
    setCoach(v);
    const res = await api("/api/profile", { method: "PATCH", body: JSON.stringify({ coach: v }) });
    if (res.status === 401) return goSignedOut();
    if (!res.ok) { setWriteError("Couldn't save coach name — try again."); return; }
    setWriteError("");
  };
  const handleSignOut = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    setShowSettings(false);
    goSignedOut();
  };

  const start = () => {
    setTab("train");
    setLog([]); setSummary(null); setRest(null); setRpe(null); setGrid({});
    startedAt.current = Date.now();
    setActive({ i: 0, done: 0 });
    speak(`Welcome back${firstName ? `, ${firstName}` : ""}. Today is ${activeWorkout.name}. Warm up well — then we get after it.`);
  };

  const finish = async (finalLog) => {
    const mins = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    const volume = finalLog.reduce((s, l) => s + (l.w || 0) * l.reps, 0);
    setSummary({ sets: finalLog.length, volume, minutes: mins });
    setActive(null); setRest(null); setDoneToday(true);
    speak(`Workout complete. Outstanding session — Coach ${coachFirst} will see today's numbers tonight.`);

    const perExerciseCount = {};
    const sets = finalLog.map((l) => {
      const setNo = (perExerciseCount[l.i] = (perExerciseCount[l.i] || 0) + 1);
      const ex = activeWorkout.exercises[l.i];
      return { exercise_key: ex.name, set_no: setNo, reps: l.reps, weight_lbs: l.w };
    });
    try {
      const res = await api("/api/workout-logs", {
        method: "POST",
        body: JSON.stringify({
          performed_at: new Date().toISOString(),
          assignment_id: todayAssignment?.id,
          notes: rpe ? `Session RPE: ${rpe}` : undefined,
          sets,
        }),
      });
      if (res.status === 401) return goSignedOut();
      if (!res.ok) { setWriteError("Couldn't save that workout — your summary is still here."); return; }
      setWriteError("");
      await refetchBootstrap();
    } catch {
      setWriteError("Couldn't save that workout — your summary is still here.");
    }
  };

  const updateRow = (k, patch) => {
    setGrid({ ...grid, [active.i]: grid[active.i].map((r, ri) => (ri === k ? { ...r, ...patch } : r)) });
  };
  const addRow = () => {
    const rows = grid[active.i];
    if (!rows || !rows.length) return;
    const last = rows[rows.length - 1];
    setGrid({ ...grid, [active.i]: [...rows, { reps: last.reps, w: last.w, done: false }] });
  };
  const removeRow = () => {
    const rows = grid[active.i];
    if (!rows || rows.length <= 1) return;
    const last = rows[rows.length - 1];
    if (last.done) return;
    setGrid({ ...grid, [active.i]: rows.slice(0, -1) });
  };
  const checkRow = (k) => {
    const ex = activeWorkout.exercises[active.i];
    const bw = parseWeight(ex.load) === null;
    const rows = grid[active.i];
    const row = rows[k];
    if (!row.done) {
      const newRows = rows.map((r, ri) => (ri === k ? { ...r, done: true } : r));
      setGrid({ ...grid, [active.i]: newRows });
      const newLog = [...log, { i: active.i, w: bw ? 0 : row.w, reps: row.reps }];
      setLog(newLog);
      if (newRows.every((r) => r.done)) {
        if (active.i + 1 >= activeWorkout.exercises.length) { finish(newLog); return; }
        const nx = activeWorkout.exercises[active.i + 1];
        setActive({ i: active.i + 1, done: 0 });
        setRest(ex.rest_sec ?? 90);
        speak(`Nice work. Next up: ${nx.name}. ${nx.cues[0] ?? FALLBACK_CUE}.`);
      } else {
        setActive({ ...active, done: newRows.filter((r) => r.done).length });
        setRest(ex.rest_sec ?? 90);
        speak(cheers[idx.current++ % cheers.length]);
      }
    } else {
      const newRows = rows.map((r, ri) => (ri === k ? { ...r, done: false } : r));
      setGrid({ ...grid, [active.i]: newRows });
      const w = bw ? 0 : row.w;
      const li = log.findLastIndex((l) => l.i === active.i && l.w === w && l.reps === row.reps);
      if (li !== -1) setLog([...log.slice(0, li), ...log.slice(li + 1)]);
      setActive({ ...active, done: active.done - 1 });
    }
  };

  // ---- Boot (bootstrap in flight) ----
  if (screen === "boot") {
    return (
      <div className="ff-b" style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{css}</style>
        <Mark height={54} />
      </div>
    );
  }

  // ---- Morning check-in ----
  if (screen === "survey") {
    const finishSurvey = async (finalAnswers) => {
      const sum = Object.values(finalAnswers).reduce((s, v) => s + v, 0);
      const score = Math.round((sum / 21) * 100);
      const res = await api("/api/checkins", {
        method: "POST",
        body: JSON.stringify({ day: iso(TODAY), score, answers: finalAnswers }),
      });
      if (res.status === 401) return goSignedOut();
      if (!res.ok) { setWriteError("Couldn't save your check-in — try again."); return; }
      const row = res.data;
      setServerCheckins((cur) => ({ ...cur, [iso(TODAY)]: { score: row.score, answers: row.answers } }));
      setReadyToday(row.score);
      setScreen("app");
      speak(`Readiness logged at ${row.score}. ${row.score >= 75 ? "Green light — we push today." : row.score >= 55 ? "Solid enough. We work smart today." : "Running low — we keep it tight and honest today."}`);
    };
    const q = CHECKIN_QS[checkStep];
    const pick = (i) => {
      const next = { ...survey, [q.key]: i };
      setSurvey((cur) => ({ ...cur, [q.key]: i }));
      setTimeout(() => {
        if (checkStep < CHECKIN_QS.length - 1) setCheckStep(checkStep + 1);
        else finishSurvey(next);
      }, 180);
    };
    return (
      <div className="ff-b" style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: 20, overflowY: "auto" }}>
        <style>{css}</style>
        <div style={{ width: "100%", maxWidth: 430, display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="ff-b" style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: ".14em", textTransform: "uppercase" }}>Morning check-in</div>
            <button onClick={() => setScreen("app")} style={{ background: "none", border: "none", color: C.muted, fontSize: 13 }}>Skip</button>
          </div>
          <div style={{ marginTop: 12, height: 3, width: "100%", background: C.line, borderRadius: 2 }}>
            <div style={{ height: 3, width: "100%", transform: `scaleX(${checkStep / CHECKIN_QS.length})`, transformOrigin: "left", background: C.energy, borderRadius: 2, transition: "transform .25s ease" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, minHeight: "70vh" }}>
            <div className="ff-b" style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: ".14em" }}>QUESTION {checkStep + 1} OF {CHECKIN_QS.length}</div>
            <div className="ff-d" style={{ fontSize: 30, fontWeight: 700, color: C.text, lineHeight: 1.15, margin: "10px 0 26px" }}>{q.q}</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {q.opts.map((word, i) => {
                const selected = survey[q.key] === i;
                return (
                  <button
                    key={word}
                    onClick={() => pick(i)}
                    style={{
                      textAlign: "left", padding: "16px 18px", borderRadius: 14,
                      fontSize: 15, fontWeight: 600,
                      background: selected ? "rgba(41,171,226,.10)" : C.surface,
                      border: `1px solid ${selected ? C.energy : C.line}`,
                      color: selected ? C.text : C.body,
                    }}
                  >
                    {word}
                  </button>
                );
              })}
            </div>

            {checkStep > 0 && (
              <button onClick={() => setCheckStep(checkStep - 1)} style={{ background: "none", border: "none", color: C.muted, fontSize: 13, marginTop: 20, alignSelf: "flex-start" }}>‹ Back</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- Console (admin, server mode): Kyle doesn't train here ----
  if (screen === "console") {
    return (
      <div className="ff-b" style={{ minHeight: "100vh", background: C.bg, display: "flex", justifyContent: "center" }}>
        <style>{css}</style>
        <div style={{ width: "100%", maxWidth: 430, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <Mark height={30} />
              <img src="/brand/workhart_text_logo.png" alt="Workhart" style={{ height: 19, width: "auto", display: "block" }} />
            </div>
            <button onClick={handleSignOut}
              style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 999, padding: "8px 13px", minHeight: 38, fontSize: 12, fontWeight: 600, color: C.muted }}>
              Sign out
            </button>
          </div>

          {writeError && (
            <div style={{ color: C.energy, fontSize: 11.5, padding: "0 20px", marginTop: 4 }}>{writeError}</div>
          )}

          {(consoleScreen === "roster" || consoleScreen === "inbox" || consoleScreen === "drafts") && (() => {
            const inboxUnread = inbox.reduce((s, r) => s + r.unread, 0);
            const draftsPending = drafts.length;
            return (
              <div style={{ display: "flex", gap: 8, padding: "14px 20px 0" }}>
                {[["roster", "Roster"], ["inbox", "Inbox"], ["drafts", "Drafts"]].map(([key, label]) => {
                  const sel = consoleScreen === key;
                  const badgeN = key === "inbox" ? inboxUnread : key === "drafts" ? draftsPending : 0;
                  return (
                    <button key={key} onClick={() => setConsoleScreen(key)} aria-pressed={sel}
                      style={{ flex: 1, background: sel ? "rgba(41,171,226,.08)" : C.surface2,
                        border: `1px solid ${sel ? "rgba(41,171,226,.55)" : C.line}`, borderRadius: 12,
                        padding: "10px 0", fontSize: 12.5, fontWeight: 600, color: sel ? C.energy : C.body,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      {label}
                      {badgeN > 0 && (
                        <span aria-label={`${badgeN} ${key === "inbox" ? "unread" : "pending"}`}
                          style={{ minWidth: 16, height: 16, borderRadius: 999, background: C.energy, color: C.inkOnEnergy,
                            fontSize: 9.5, fontWeight: 700, lineHeight: "16px", textAlign: "center", padding: "0 4px" }}>
                          {badgeN > 9 ? "9+" : badgeN}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 40px" }}>

            {/* ROSTER */}
            {consoleScreen === "roster" && (
              <div>
                <h1 className="ff-d" style={{ fontSize: 36, fontWeight: 700, color: C.text, textTransform: "uppercase", margin: "18px 0 0", lineHeight: 1 }}>Roster</h1>
                <div style={{ color: C.muted, fontSize: 13, margin: "6px 0 16px" }}>{roster.length} athlete{roster.length === 1 ? "" : "s"}</div>
                {rosterError && <div style={{ color: C.energy, fontSize: 12.5, marginBottom: 12 }}>{rosterError}</div>}
                {rosterBusy ? (
                  <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>
                ) : (
                  <Card style={{ padding: 0 }}>
                    {roster.length === 0 ? (
                      <div style={{ padding: 16, color: C.muted, fontSize: 12.5 }}>No athletes yet.</div>
                    ) : roster.map((u, i) => (
                      <button key={u.id} onClick={() => openUserDashboard(u.id)}
                        style={{ width: "100%", background: "none", border: "none", textAlign: "left", padding: 16,
                          display: "flex", alignItems: "center", gap: 12,
                          borderBottom: i < roster.length - 1 ? `1px solid ${C.line}` : "none" }}>
                        <div style={ava}>{(u.name || u.email)[0].toUpperCase()}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: C.text, fontSize: 14.5, fontWeight: 600 }}>{u.name}</div>
                          <div style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>{u.email}</div>
                          <div style={{ color: C.muted, fontSize: 11.5, marginTop: 4 }}>
                            {u.last_checkin ? `Last check-in ${dayKey(u.last_checkin)}` : "No check-ins yet"} · {u.assignment_count} assignment{u.assignment_count === 1 ? "" : "s"}
                          </div>
                        </div>
                        <ChevronRight size={16} color={C.muted} />
                      </button>
                    ))}
                  </Card>
                )}
              </div>
            )}

            {/* USER DASHBOARD */}
            {consoleScreen === "dashboard" && (
              <div>
                <button onClick={backToRoster}
                  style={{ background: "none", border: "none", color: C.muted, fontSize: 13, padding: "8px 0", display: "flex", alignItems: "center", gap: 6 }}>
                  <ChevronDown size={14} style={{ transform: "rotate(90deg)" }} /> Back to roster
                </button>
                {overviewBusy || !overview ? (
                  <div style={{ color: C.muted, fontSize: 13, marginTop: 12 }}>Loading…</div>
                ) : (() => {
                  const u = overview.user;
                  const checkinSeries = overview.checkins.map((c) => ({ d: dayKey(c.day).slice(5), v: c.score }));
                  const fuelTotalsByDay = {};
                  for (const r of overview.fuel) {
                    const day = dayKey(r.eaten_on);
                    const t = fuelTotalsByDay[day] ?? { kcal: 0, protein: 0 };
                    t.kcal += r.calories || 0; t.protein += r.protein_g || 0;
                    fuelTotalsByDay[day] = t;
                  }
                  const fuelDays = Object.keys(fuelTotalsByDay).sort().reverse().slice(0, 7);
                  const todayIsoC = iso(TODAY);
                  const upcoming = overview.assignments
                    .filter((a) => dayKey(a.scheduled_for) >= todayIsoC)
                    .sort((a, b) => dayKey(a.scheduled_for).localeCompare(dayKey(b.scheduled_for)));

                  return (
                    <>
                      <h1 className="ff-d" style={{ fontSize: 30, fontWeight: 700, color: C.text, textTransform: "uppercase", margin: "10px 0 0", lineHeight: 1.05 }}>{u.name}</h1>
                      <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{u.email}</div>

                      {/* U7 (ask 33): per-athlete auto-send toggle. */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, padding: "14px 16px", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14 }}>
                        <div>
                          <div style={{ color: C.text, fontSize: 13.5, fontWeight: 600 }}>Auto-send Kyle replies</div>
                          <div style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>Skip approval for routine AI drafts</div>
                        </div>
                        <button onClick={() => toggleAutoSend(u.id, !overview.profile?.kyleAutoSend)} disabled={autoSendBusy}
                          aria-pressed={!!overview.profile?.kyleAutoSend} aria-label="Toggle auto-send Kyle replies"
                          style={{ width: 46, height: 26, borderRadius: 999, position: "relative", flexShrink: 0,
                            border: `1px solid ${overview.profile?.kyleAutoSend ? "rgba(41,171,226,.55)" : C.line}`,
                            background: overview.profile?.kyleAutoSend ? "rgba(41,171,226,.25)" : C.surface2,
                            opacity: autoSendBusy ? .6 : 1 }}>
                          <span style={{ position: "absolute", top: 2, left: overview.profile?.kyleAutoSend ? 22 : 2, width: 20, height: 20, borderRadius: "50%",
                            background: overview.profile?.kyleAutoSend ? C.energy : C.muted, transition: "left .15s" }} />
                        </button>
                      </div>

                      <Label>Readiness trend</Label>
                      <Card>
                        {checkinSeries.length === 0 ? (
                          <div style={{ color: C.muted, fontSize: 12.5 }}>No check-ins yet.</div>
                        ) : (
                          <div style={{ height: 158 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={checkinSeries} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                                <CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="d" stroke={C.muted} fontSize={11} tickLine={false} axisLine={false} />
                                <YAxis stroke={C.muted} fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} />
                                <Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 10, color: C.text, fontSize: 12 }} />
                                <Line type="monotone" dataKey="v" stroke={C.energy} strokeWidth={2.5} dot={{ r: 3, fill: C.energy, strokeWidth: 0 }} isAnimationActive={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </Card>

                      <Label>Upcoming assignments</Label>
                      <Card style={{ padding: 0 }}>
                        {upcoming.length === 0 ? (
                          <div style={{ padding: 16, color: C.muted, fontSize: 12.5 }}>Nothing scheduled.</div>
                        ) : upcoming.map((a, i) => (
                          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: i < upcoming.length - 1 ? `1px solid ${C.line}` : "none" }}>
                            <div>
                              <div style={{ color: C.text, fontSize: 13.5, fontWeight: 600 }}>{a.workout.title}</div>
                              <div style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>{dayKey(a.scheduled_for)}</div>
                            </div>
                            <Pill tone={a.status === "completed" ? "recovery" : "energy"}>{a.status}</Pill>
                          </div>
                        ))}
                      </Card>

                      <Label>Recent workout logs</Label>
                      <Card style={{ padding: 0 }}>
                        {overview.workoutLogs.length === 0 ? (
                          <div style={{ padding: 16, color: C.muted, fontSize: 12.5 }}>No logged workouts yet.</div>
                        ) : overview.workoutLogs.map((l, i) => {
                          const a = l.assignment_id ? overview.assignments.find((x) => x.id === l.assignment_id) : null;
                          return (
                            <div key={l.id} style={{ padding: "12px 16px", borderBottom: i < overview.workoutLogs.length - 1 ? `1px solid ${C.line}` : "none" }}>
                              <div style={{ color: C.text, fontSize: 13.5, fontWeight: 600 }}>{a?.workout?.title ?? "Freeform workout"}</div>
                              <div style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>{dayKey(l.performed_at)} · {l.sets.length} set{l.sets.length === 1 ? "" : "s"}</div>
                            </div>
                          );
                        })}
                      </Card>

                      <Label>Recent fuel</Label>
                      <Card style={{ padding: 0 }}>
                        {fuelDays.length === 0 ? (
                          <div style={{ padding: 16, color: C.muted, fontSize: 12.5 }}>No fuel logged yet.</div>
                        ) : fuelDays.map((day, i) => (
                          <div key={day} style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderBottom: i < fuelDays.length - 1 ? `1px solid ${C.line}` : "none" }}>
                            <div style={{ color: C.body, fontSize: 13 }}>{day}</div>
                            <div style={{ color: C.muted, fontSize: 12.5 }}>{Math.round(fuelTotalsByDay[day].kcal)} kcal · {Math.round(fuelTotalsByDay[day].protein)}g protein</div>
                          </div>
                        ))}
                      </Card>

                      <button onClick={() => openAdminThread(overview.user, "dashboard")}
                        style={{ ...btnG, width: "100%", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <MessageSquare size={16} /> Message
                      </button>
                      <button onClick={openBuilder} style={{ ...btnP, width: "100%", marginTop: 10 }}>Assign a workout</button>
                    </>
                  );
                })()}
              </div>
            )}

            {/* WORKOUT BUILDER */}
            {consoleScreen === "builder" && (
              <div>
                <button onClick={backToDashboard}
                  style={{ background: "none", border: "none", color: C.muted, fontSize: 13, padding: "8px 0", display: "flex", alignItems: "center", gap: 6 }}>
                  <ChevronDown size={14} style={{ transform: "rotate(90deg)" }} /> Back to dashboard
                </button>
                <h1 className="ff-d" style={{ fontSize: 28, fontWeight: 700, color: C.text, textTransform: "uppercase", margin: "8px 0 0" }}>Assign a workout</h1>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{overview?.user?.name}</div>

                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  {["new", "existing"].map((m) => {
                    const sel = builderMode === m;
                    return (
                      <button key={m} onClick={() => setBuilderMode(m)} aria-pressed={sel}
                        style={{ flex: 1, background: sel ? "rgba(41,171,226,.08)" : C.surface2,
                          border: `1px solid ${sel ? "rgba(41,171,226,.55)" : C.line}`, borderRadius: 12,
                          padding: "10px 0", fontSize: 12.5, fontWeight: 600, color: sel ? C.energy : C.body }}>
                        {m === "new" ? "Build new" : "Use existing"}
                      </button>
                    );
                  })}
                </div>

                {builderMode === "existing" ? (
                  <Card style={{ marginTop: 14, padding: 0 }}>
                    {existingWorkouts.length === 0 ? (
                      <div style={{ padding: 16, color: C.muted, fontSize: 12.5 }}>No saved workouts yet — build one instead.</div>
                    ) : existingWorkouts.map((w, i) => {
                      const sel = builderExistingId === w.id;
                      return (
                        <button key={w.id} onClick={() => setBuilderExistingId(w.id)} aria-pressed={sel}
                          style={{ width: "100%", textAlign: "left", background: sel ? "rgba(41,171,226,.08)" : "none", border: "none",
                            padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center",
                            borderBottom: i < existingWorkouts.length - 1 ? `1px solid ${C.line}` : "none" }}>
                          <div>
                            <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{w.title}</div>
                            <div style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>{(w.blocks || []).length} exercises</div>
                          </div>
                          {sel && <Check size={16} color={C.energy} />}
                        </button>
                      );
                    })}
                  </Card>
                ) : (
                  <>
                    <Label>Title</Label>
                    <input aria-label="Workout title" placeholder="e.g. Push Day — Week 3" value={builderTitle}
                      onChange={(e) => setBuilderTitle(e.target.value)} style={inp} />

                    <Label>Exercises</Label>
                    {builderExercises.map((e, i) => (
                      <Card key={i} style={{ marginTop: i === 0 ? 0 : 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{e.exercise_key}</div>
                          <button aria-label={`Remove ${e.exercise_key}`} onClick={() => removeBuilderExercise(i)}
                            style={{ background: "none", border: "none", color: C.muted, display: "flex" }}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <div style={{ width: 28, fontSize: 9.5, fontWeight: 600, color: C.muted, textTransform: "uppercase" }}>Set</div>
                            <div style={{ flex: 1, textAlign: "center", fontSize: 9.5, fontWeight: 600, color: C.muted, textTransform: "uppercase" }}>Reps</div>
                            <div style={{ flex: 1, textAlign: "center", fontSize: 9.5, fontWeight: 600, color: C.muted, textTransform: "uppercase" }}>Lb</div>
                          </div>
                          {e.sets.map((s, si) => (
                            <div key={si} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                              <div className="ff-d" style={{ width: 28, fontSize: 13, fontWeight: 700, color: C.muted }}>{si + 1}</div>
                              <input type="number" inputMode="numeric" aria-label={`Exercise ${i + 1} set ${si + 1} reps`} value={s.reps}
                                onChange={(ev) => updateBuilderSet(i, si, { reps: ev.target.value })}
                                style={{ flex: 1, textAlign: "center", background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 11, minHeight: 40, fontSize: 15, fontWeight: 700, color: C.text }} />
                              <input type="number" inputMode="numeric" aria-label={`Exercise ${i + 1} set ${si + 1} weight`} placeholder="BW" value={s.weight_lbs}
                                onChange={(ev) => updateBuilderSet(i, si, { weight_lbs: ev.target.value })}
                                style={{ flex: 1, textAlign: "center", background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 11, minHeight: 40, fontSize: 15, fontWeight: 700, color: C.text }} />
                            </div>
                          ))}
                          <div style={{ display: "flex", gap: 14, justifyContent: "center", alignItems: "center", marginTop: 10 }}>
                            <button aria-label={`Remove a set from ${e.exercise_key}`} onClick={() => removeBuilderSet(i)}
                              style={{ width: 32, height: 32, borderRadius: "50%", border: `1px solid ${C.lineStrong}`, background: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <Minus size={14} color={C.body} />
                            </button>
                            <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase" }}>Set</span>
                            <button aria-label={`Add a set to ${e.exercise_key}`} onClick={() => addBuilderSet(i)}
                              style={{ width: 32, height: 32, borderRadius: "50%", border: `1px solid ${C.lineStrong}`, background: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <Plus size={14} color={C.body} />
                            </button>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                          <input aria-label={`${e.exercise_key} rest seconds`} type="number" inputMode="numeric" placeholder="Rest (sec)" value={e.rest_sec}
                            onChange={(ev) => updateBuilderExercise(i, { rest_sec: ev.target.value })}
                            style={{ ...inp, marginBottom: 0 }} />
                          <input aria-label={`${e.exercise_key} note`} placeholder="Note (optional)" value={e.note}
                            onChange={(ev) => updateBuilderExercise(i, { note: ev.target.value })}
                            style={{ ...inp, marginBottom: 0 }} />
                        </div>
                      </Card>
                    ))}

                    <Label>Add from library</Label>
                    <input aria-label="Search exercises" placeholder="Search exercises…" value={builderLibQ}
                      onChange={(e) => setBuilderLibQ(e.target.value)} style={inp} />
                    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 12, scrollbarWidth: "none" }}>
                      {["All", "Barbell", "Dumbbell", "Kettlebell", "Cable", "Machine", "Bodyweight"].map((eq) => {
                        const sel = builderLibEq === eq;
                        return (
                          <button key={eq} onClick={() => setBuilderLibEq(eq)} aria-pressed={sel}
                            style={{ flexShrink: 0, background: sel ? "rgba(41,171,226,.08)" : C.surface2,
                              border: `1px solid ${sel ? "rgba(41,171,226,.55)" : C.line}`, borderRadius: 999,
                              padding: "7px 13px", fontSize: 12, fontWeight: 600, color: sel ? C.energy : C.body, whiteSpace: "nowrap" }}>
                            {eq}
                          </button>
                        );
                      })}
                    </div>
                    {(() => {
                      const q = builderLibQ.trim().toLowerCase();
                      const filtered = EX_LIB
                        .filter((e) => e.name.toLowerCase().includes(q) && (builderLibEq === "All" || e.equipment === builderLibEq))
                        .sort((a, b) => a.name.localeCompare(b.name));
                      return (
                        <Card style={{ padding: 0 }}>
                          {filtered.length === 0 ? (
                            <div style={{ padding: 16, color: C.muted, fontSize: 12.5 }}>No exercises match.</div>
                          ) : filtered.map((e, i) => (
                            <button key={e.name} onClick={() => addBuilderExercise(e.name)}
                              style={{ width: "100%", textAlign: "left", background: "none", border: "none", display: "flex", alignItems: "center", gap: 12, padding: 12,
                                borderBottom: i < filtered.length - 1 ? `1px solid ${C.line}` : "none" }}>
                              <img src={`https://i.ytimg.com/vi/${e.video}/mqdefault.jpg`} alt="" width={56} height={32}
                                style={{ borderRadius: 8, objectFit: "cover", flexShrink: 0, background: C.surface2 }} />
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{e.name}</div>
                                <div style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>{e.muscles} · {e.equipment}</div>
                              </div>
                              <Plus size={16} color={C.energy} />
                            </button>
                          ))}
                        </Card>
                      );
                    })()}
                  </>
                )}

                <Label>Date</Label>
                <input aria-label="Assignment date" type="date" value={builderDate}
                  onChange={(e) => setBuilderDate(e.target.value)}
                  style={inp} />

                {builderError && <div style={{ color: C.energy, fontSize: 12.5, marginTop: 4 }}>{builderError}</div>}
                <button onClick={submitAssignment} disabled={builderBusy} style={{ ...btnP, width: "100%", marginTop: 14, opacity: builderBusy ? .6 : 1 }}>
                  {builderBusy ? "Assigning…" : "Assign workout"}
                </button>
              </div>
            )}

            {/* INBOX */}
            {consoleScreen === "inbox" && (
              <div>
                <h1 className="ff-d" style={{ fontSize: 36, fontWeight: 700, color: C.text, textTransform: "uppercase", margin: "18px 0 0", lineHeight: 1 }}>Inbox</h1>
                {inboxError && <div style={{ color: C.energy, fontSize: 12.5, margin: "12px 0 0" }}>{inboxError}</div>}
                {inboxBusy ? (
                  <div style={{ color: C.muted, fontSize: 13, marginTop: 16 }}>Loading…</div>
                ) : (
                  <Card style={{ marginTop: 16, padding: 0 }}>
                    {inbox.length === 0 ? (
                      <div style={{ padding: 16, color: C.muted, fontSize: 12.5 }}>No conversations yet.</div>
                    ) : inbox.map((row, i) => (
                      <button key={row.user.id} onClick={() => openAdminThread(row.user, "inbox")}
                        style={{ width: "100%", background: "none", border: "none", textAlign: "left", padding: 16,
                          display: "flex", alignItems: "center", gap: 12,
                          borderBottom: i < inbox.length - 1 ? `1px solid ${C.line}` : "none" }}>
                        <div style={ava}>{(row.user.name || row.user.email)[0].toUpperCase()}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                            <div style={{ color: C.text, fontSize: 14.5, fontWeight: 600 }}>{row.user.name}</div>
                            {row.last_message && (
                              <div style={{ color: C.muted, fontSize: 10.5, flexShrink: 0 }}>{relativeDay(row.last_message.created_at)}</div>
                            )}
                          </div>
                          <div style={{ color: C.muted, fontSize: 12, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {row.last_message
                              ? `${row.last_message.sender === "kyle" ? "You: " : ""}${row.last_message.body}`
                              : "No messages yet"}
                          </div>
                        </div>
                        {row.unread > 0 && <Pill tone="energy">{row.unread}</Pill>}
                        <ChevronRight size={16} color={C.muted} />
                      </button>
                    ))}
                  </Card>
                )}
              </div>
            )}

            {/* THREAD (console side, Kyle on the right) */}
            {consoleScreen === "thread" && (
              <div>
                <button onClick={backFromThread}
                  style={{ background: "none", border: "none", color: C.muted, fontSize: 13, padding: "8px 0", display: "flex", alignItems: "center", gap: 6 }}>
                  <ChevronDown size={14} style={{ transform: "rotate(90deg)" }} /> Back to {adminThreadOrigin === "dashboard" ? "dashboard" : "inbox"}
                </button>
                <h1 className="ff-d" style={{ fontSize: 28, fontWeight: 700, color: C.text, textTransform: "uppercase", margin: "8px 0 0" }}>{adminThreadUser?.name}</h1>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{adminThreadUser?.email}</div>

                <Card style={{ marginTop: 14, padding: 0 }}>
                  {adminThreadBusy ? (
                    <div style={{ padding: 16, color: C.muted, fontSize: 12.5 }}>Loading…</div>
                  ) : adminThread.length === 0 ? (
                    <div style={{ padding: 16, color: C.muted, fontSize: 12.5 }}>No messages yet.</div>
                  ) : (
                    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                      {adminThread.map((m) => {
                        const mine = m.sender === "kyle";
                        return (
                          <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                            <div style={{ maxWidth: "82%", background: mine ? "rgba(41,171,226,.13)" : C.surface2,
                              border: `1px solid ${mine ? "rgba(41,171,226,.35)" : C.line}`, borderRadius: 14, padding: "10px 13px" }}>
                              {m.ai_generated && (
                                <span style={{ display: "inline-block", marginBottom: 5, fontSize: 9, fontWeight: 700, letterSpacing: ".04em",
                                  color: C.energy, background: "rgba(41,171,226,.15)", borderRadius: 999, padding: "2px 6px" }}>AI</span>
                              )}
                              <div style={{ color: C.body, fontSize: 13.5, lineHeight: 1.5 }}>{m.body}</div>
                              <div style={{ color: C.muted, fontSize: 10.5, marginTop: 4 }}>
                                {new Date(m.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ borderTop: adminThread.length ? `1px solid ${C.line}` : "none", padding: "12px 16px 16px" }}>
                    {adminMsgError && <div style={{ color: C.energy, fontSize: 11.5, marginBottom: 8 }}>{adminMsgError}</div>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <input aria-label="Reply" placeholder="Write a reply…" value={adminMsgDraft}
                        onChange={(e) => setAdminMsgDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && adminMsgDraft.trim()) sendAdminMessage(); }}
                        style={{ ...inp, marginBottom: 0, flex: 1, minHeight: 44 }} />
                      <button onClick={sendAdminMessage} disabled={!adminMsgDraft.trim() || adminMsgBusy}
                        style={{ ...btnP, padding: "0 18px", minHeight: 44, opacity: adminMsgDraft.trim() && !adminMsgBusy ? 1 : .45, flexShrink: 0 }}>
                        Send
                      </button>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* DRAFTS (U7, ask 33) */}
            {consoleScreen === "drafts" && (
              <div>
                <h1 className="ff-d" style={{ fontSize: 36, fontWeight: 700, color: C.text, textTransform: "uppercase", margin: "18px 0 0", lineHeight: 1 }}>Drafts</h1>
                <div style={{ color: C.muted, fontSize: 13, margin: "6px 0 16px" }}>{drafts.length} pending</div>
                {draftsError && <div style={{ color: C.energy, fontSize: 12.5, marginBottom: 12 }}>{draftsError}</div>}
                {draftsBusy ? (
                  <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>
                ) : (
                  <Card style={{ padding: 0 }}>
                    {drafts.length === 0 ? (
                      <div style={{ padding: 16, color: C.muted, fontSize: 12.5 }}>No pending drafts.</div>
                    ) : drafts.map((d, i) => (
                      <button key={d.id} onClick={() => openDraft(d)}
                        style={{ width: "100%", background: "none", border: "none", textAlign: "left", padding: 16,
                          display: "flex", alignItems: "center", gap: 12,
                          borderBottom: i < drafts.length - 1 ? `1px solid ${C.line}` : "none" }}>
                        <div style={ava}>{(d.user.name || d.user.email)[0].toUpperCase()}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                            <div style={{ color: C.text, fontSize: 14.5, fontWeight: 600 }}>{d.user.name}</div>
                            <div style={{ color: C.muted, fontSize: 10.5, flexShrink: 0 }}>{relativeDay(d.created_at)}</div>
                          </div>
                          <div style={{ color: C.energy, fontSize: 11, fontWeight: 600, marginTop: 2 }}>{d.trigger_summary}</div>
                          <div style={{ color: C.muted, fontSize: 12, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.body}</div>
                        </div>
                        <ChevronRight size={16} color={C.muted} />
                      </button>
                    ))}
                  </Card>
                )}
              </div>
            )}

            {/* DRAFT DETAIL (U7, ask 33) */}
            {consoleScreen === "draftDetail" && selectedDraft && (
              <div>
                <button onClick={backFromDraft}
                  style={{ background: "none", border: "none", color: C.muted, fontSize: 13, padding: "8px 0", display: "flex", alignItems: "center", gap: 6 }}>
                  <ChevronDown size={14} style={{ transform: "rotate(90deg)" }} /> Back to drafts
                </button>
                <h1 className="ff-d" style={{ fontSize: 28, fontWeight: 700, color: C.text, textTransform: "uppercase", margin: "8px 0 0" }}>{selectedDraft.user.name}</h1>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{selectedDraft.trigger_summary}</div>

                <Label>Draft reply</Label>
                <textarea aria-label="Draft body" value={draftBody} onChange={(e) => setDraftBody(e.target.value)} rows={6}
                  style={{ width: "100%", background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 14,
                    padding: 14, fontSize: 14, color: C.text, fontFamily: "inherit", lineHeight: 1.5, resize: "vertical" }} />

                {draftActionError && <div style={{ color: C.energy, fontSize: 12.5, marginTop: 8 }}>{draftActionError}</div>}
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button onClick={rejectDraft} disabled={draftActionBusy}
                    style={{ ...btnG, flex: 1, opacity: draftActionBusy ? .6 : 1 }}>Reject</button>
                  <button onClick={approveDraft} disabled={draftActionBusy || !draftBody.trim()}
                    style={{ ...btnP, flex: 1, opacity: draftActionBusy || !draftBody.trim() ? .6 : 1 }}>
                    {draftActionBusy ? "Sending…" : "Approve & send"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // THE SETTINGS CONTENT, SHARED BY THE LEGACY SHEET AND THE "you" TAB.
  const settingsBody = (
            <div style={{ marginTop: 18 }}>
              <Label>Coach name</Label>
              <input aria-label="Coach name" maxLength={40} style={inp} value={coach}
                onChange={(e) => changeCoach(e.target.value)} />
              <div style={{ color: C.muted, fontSize: 11.5, marginTop: -6, marginBottom: 16 }}>Shown wherever your coach appears — and spoken by the voice.</div>

              <Card style={{ display: "flex", gap: 13, alignItems: "center" }}>
                <div style={ava}>{coachInitial}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: C.text, fontSize: 15.5, fontWeight: 600 }}>{coachName}</div>
                  <div style={{ color: C.muted, fontSize: 12.5 }}>Head Coach · WORKHART</div>
                </div>
              </Card>

              <div style={{ marginTop: 16 }}>
                  <Label>Fitness device</Label>
                  <select aria-label="Fitness device" value={device} onChange={(e) => changeDevice(e.target.value)} style={{ ...inp, color: device ? C.text : C.muted }}>
                    <option value="" disabled>Connect your fitness device…</option>
                    {DEVICE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <button onClick={handleSignOut} style={{ ...btnG, width: "100%", marginTop: 4 }}>Sign out</button>
                </div>
            </div>
  );

  // ---- Shell ----
  return (
    <div className="ff-b" style={{ minHeight: "100vh", background: C.bg, display: "flex", justifyContent: "center" }}>
      <style>{css}</style>
      <div style={{ width: "100%", maxWidth: 430, display: "flex", flexDirection: "column", minHeight: "100vh" }}>

        {!forcedTab && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Mark height={30} />
            <img src="/brand/workhart_text_logo.png" alt="Workhart" style={{ height: 19, width: "auto", display: "block" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => { setVoiceOn(!voiceOn); if (voiceOn) stopAudio(); }} aria-pressed={voiceOn} aria-label={voiceOn ? "Turn coach voice off" : "Turn coach voice on"}
              style={{ display: "flex", alignItems: "center", gap: 7, background: "none", border: `1px solid ${voiceOn ? "rgba(41,171,226,.5)" : C.line}`, borderRadius: 999, padding: "8px 13px", minHeight: 38, fontSize: 12, fontWeight: 600, color: voiceOn ? C.energy : C.muted }}>
              {voiceOn ? <Volume2 size={15} /> : <VolumeX size={15} />} Voice
            </button>
            <button onClick={() => setShowSettings(true)} aria-expanded={showSettings} aria-label="Settings"
              style={{ display: "flex", alignItems: "center", gap: 7, background: "none", border: `1px solid ${C.line}`, borderRadius: 999, padding: "8px 11px", minHeight: 38, color: C.muted }}>
              <Settings size={15} />
            </button>
          </div>
        </div>
        )}

        {writeError && (
          <div style={{ color: C.energy, fontSize: 11.5, padding: "0 20px", marginTop: 4 }}>{writeError}</div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 104px" }}>

          {/* TODAY */}
          {tab === "today" && (() => {
            const todayIso = iso(TODAY);
            const isToday = selDay === todayIso;
            const selDate = new Date(selDay + "T00:00:00");

            const dayAssignment = assignmentForDay(selDay);
            const isDayDone = dayAssignment?.status === "completed" || (isToday && doneToday);
            const exCount = dayAssignment ? dayAssignment.workout.blocks.length : 0;
            const dotFor = (k) => {
              const a = assignmentForDay(k);
              if (!a) return null;
              return a.status === "completed" ? C.recovery : C.energy;
            };
            const labelFor = (k, d) => {
              const a = assignmentForDay(k);
              return `${fmtLong(d)}${a ? ` — ${a.workout.title}${a.status === "completed" ? ", completed" : ", planned"}` : ", no session"}`;
            };
            return (
              <div>
                <CalendarStrip selected={selDay} onSelect={setSelDay} doneToday={doneToday} dotFor={dotFor} labelFor={labelFor} />
                <div style={{ color: C.muted, fontSize: 13, marginTop: 14 }}>{fmtLong(selDate)}</div>

                {isToday ? (
                  <>
                    <h1 className="ff-d" style={{ fontSize: 36, fontWeight: 700, color: C.text, lineHeight: 1.02, margin: "2px 0 0", textTransform: "uppercase" }}>Morning{firstName ? `, ${firstName}` : ""}</h1>

                    <Card role="button" tabIndex={0} aria-expanded={showReadiness} onClick={openReadiness}
                      onKeyDown={(e) => { if (e.key === "Enter") openReadiness(); }}
                      style={{ marginTop: 18, display: "flex", gap: 16, alignItems: "center", width: "100%", textAlign: "left" }}>
                      <Ring score={readyToday} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: C.text, fontSize: 15, fontWeight: 600 }}>{readyToday == null ? "No check-in yet" : "Ready to push"}</div>
                        <div style={{ color: C.body, fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
                          {readyToday == null ? "You skipped this morning's check-in." : "Check-in logged this morning."}
                        </div>
                        <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>View trend ›</div>
                      </div>
                    </Card>
                  </>
                ) : (
                  <h1 className="ff-d" style={{ fontSize: 36, fontWeight: 700, color: C.text, lineHeight: 1.02, margin: "2px 0 0", textTransform: "uppercase" }}>
                    {dayAssignment ? dayAssignment.workout.title : "No Session"}
                  </h1>
                )}

                <Label>{isToday ? "Today's session" : "Scheduled session"}</Label>
                {dayAssignment ? (
                  <Card>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <div>
                        <div className="ff-d" style={{ fontSize: 27, fontWeight: 700, color: C.text, textTransform: "uppercase", lineHeight: 1 }}>{dayAssignment.workout.title}</div>
                        <div style={{ color: C.muted, fontSize: 12.5, marginTop: 5 }}>{exCount} exercise{exCount === 1 ? "" : "s"}</div>
                      </div>
                      {isDayDone ? <Pill tone="recovery">Completed</Pill> : <Pill tone="energy">Planned</Pill>}
                    </div>
                    {isDayDone && isToday && summary && (
                      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                        <MiniStat n={summary.sets} t="Sets" />
                        <MiniStat n={summary.volume.toLocaleString()} t="lb volume" />
                        <MiniStat n={summary.minutes} t="Minutes" />
                        <MiniStat n={rpe ?? "–"} t="RPE" />
                      </div>
                    )}
                    {isToday && (
                      <button onClick={start} style={{ ...(isDayDone ? btnG : btnP), width: "100%", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <Play size={17} fill={isDayDone ? "none" : C.inkOnEnergy} /> {isDayDone ? "Train again" : "Start workout"}
                      </button>
                    )}
                  </Card>
                ) : (
                  <Card>
                    <div style={{ color: C.body, fontSize: 13.5, lineHeight: 1.55 }}>
                      {isToday ? `No session assigned. Check back once Coach ${coachFirst} schedules one.` : "No session assigned."}
                    </div>
                  </Card>
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
              <div style={{ color: C.body, fontSize: 14, marginTop: 10 }}>{activeWorkout.name} · logged &amp; shared with Coach {coachFirst}</div>
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
                {activeWorkout.exercises.map((ex, i) => {
                  const sets = log.filter(l => l.i === i);
                  if (!sets.length) return null;
                  const best = sets.reduce((a, b) => ((b.w || 0) * b.reps > (a.w || 0) * a.reps ? b : a));
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: i < activeWorkout.exercises.length - 1 ? `1px solid ${C.line}` : "none" }}>
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
              <h1 className="ff-d" style={{ fontSize: 36, fontWeight: 700, color: C.text, textTransform: "uppercase", margin: "18px 0 0", lineHeight: 1 }}>{activeWorkout.name}</h1>
              <div style={{ color: C.muted, fontSize: 13, margin: "6px 0 12px" }}>{activeWorkout.duration} · {activeWorkout.focus}</div>
              <button onClick={start} style={{ ...btnP, width: "100%", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Play size={17} fill={C.inkOnEnergy} /> Start workout
              </button>
              {activeWorkout.exercises.map((ex, i) => (
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

              <Label>Exercise library</Label>
              <div style={{ color: C.muted, fontSize: 11.5, marginTop: -6, marginBottom: 12 }}>50 exercises · tap for form video &amp; history</div>
              <input aria-label="Search exercises" placeholder="Search exercises…" value={libQ}
                onChange={(e) => setLibQ(e.target.value)} style={inp} />
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 12, scrollbarWidth: "none" }}>
                {["All", "Barbell", "Dumbbell", "Kettlebell", "Cable", "Machine", "Bodyweight"].map((eq) => {
                  const sel = libEq === eq;
                  return (
                    <button key={eq} onClick={() => setLibEq(eq)} aria-pressed={sel}
                      style={{ flexShrink: 0, background: sel ? "rgba(41,171,226,.08)" : C.surface2,
                        border: `1px solid ${sel ? "rgba(41,171,226,.55)" : C.line}`, borderRadius: 999,
                        padding: "7px 13px", fontSize: 12, fontWeight: 600, color: sel ? C.energy : C.body, whiteSpace: "nowrap" }}>
                      {eq}
                    </button>
                  );
                })}
              </div>
              {(() => {
                const q = libQ.trim().toLowerCase();
                const filtered = EX_LIB
                  .filter((e) => e.name.toLowerCase().includes(q) && (libEq === "All" || e.equipment === libEq))
                  .sort((a, b) => a.name.localeCompare(b.name));
                return (
                  <Card style={{ padding: 0 }}>
                    {filtered.length === 0 ? (
                      <div style={{ padding: 16, color: C.muted, fontSize: 12.5 }}>No exercises match.</div>
                    ) : filtered.map((e, i) => (
                      <div key={e.name} role="button" tabIndex={0}
                        onClick={() => openExercise(e.name)}
                        onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") openExercise(e.name); }}
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: 12,
                          borderBottom: i < filtered.length - 1 ? `1px solid ${C.line}` : "none", cursor: "pointer" }}>
                        <img src={`https://i.ytimg.com/vi/${e.video}/mqdefault.jpg`} alt="" width={56} height={32}
                          style={{ borderRadius: 8, objectFit: "cover", flexShrink: 0, background: C.surface2 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{e.name}</div>
                          <div style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>{e.muscles} · {e.equipment}</div>
                        </div>
                      </div>
                    ))}
                  </Card>
                );
              })()}
            </div>
          )}

          {/* TRAIN — active */}
          {tab === "train" && active && (() => {
            const ex = activeWorkout.exercises[active.i];
            const bw = parseWeight(ex.load) === null;
            const rows = grid[active.i] || [];
            const totalReps = log.reduce((s, l) => s + l.reps, 0);
            const totalLb = log.reduce((s, l) => s + (l.w || 0) * l.reps, 0);
            const chipStyle = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 11px", fontSize: 11.5, fontWeight: 600, color: C.body };
            return (
              <div style={{ textAlign: "center", paddingTop: 14 }}>
                <div style={{ display: "flex", gap: 6, justifyContent: "center" }}
                  aria-label={`Exercise ${active.i + 1} of ${activeWorkout.exercises.length}`}>
                  {activeWorkout.exercises.map((_, k) => (
                    <span key={k} style={{
                      display: "inline-block", height: 8,
                      width: k === active.i ? 22 : 8,
                      borderRadius: 999,
                      background: k < active.i ? C.recovery : k === active.i ? C.energy : C.line,
                    }} />
                  ))}
                </div>
                <div className="ff-d" style={{ marginTop: 12, fontSize: 34, fontWeight: 800, color: C.text }}>
                  {totalReps}
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em" }}> REPS</span>
                  <span style={{ color: C.muted }}> · </span>
                  {totalLb.toLocaleString()}
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em" }}> LB</span>
                </div>

                <div style={{ marginTop: 14, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: C.energy, opacity: .85 }}>
                  {"ABCDEF"[active.i]} · {BLOCK_TYPES[active.i]}
                </div>
                <h1 className="ff-d" style={{ fontSize: 33, fontWeight: 800, color: C.text, textTransform: "uppercase", lineHeight: 1.04, margin: "7px 0 0" }}>{ex.name}</h1>
                <div style={{ color: C.muted, fontSize: 13.5, marginTop: 4 }}>Target {ex.reps} reps · {ex.load}</div>

                <div style={{ display: "flex", gap: 7, justifyContent: "center", flexWrap: "wrap", marginTop: 10 }}>
                  {histFor(ex.name) && (
                    <button onClick={() => openExercise(ex.name)} style={chipStyle}>
                      <span style={{ color: C.muted }}>PR </span>{histFor(ex.name).pr.label}
                    </button>
                  )}
                  {!bw && (maxes[ex.name] ?? histFor(ex.name)?.baseMax) != null && (
                    <button onClick={() => openExercise(ex.name)} style={chipStyle}>
                      <span style={{ color: C.muted }}>Max </span>{maxes[ex.name] ?? histFor(ex.name)?.baseMax} lb
                    </button>
                  )}
                </div>

                <div style={{ position: "relative", width: 128, height: 128, margin: "20px auto 6px" }}>
                  <div className={talking ? "orb-live" : ""} style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${C.energy}`, opacity: talking ? 1 : .4 }} />
                  <div style={{ position: "absolute", inset: 14, borderRadius: "50%", background: `radial-gradient(circle at 35% 28%, ${C.energy}, ${C.energyDeep})`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
                    <div className="ff-d" style={{ fontSize: 37, fontWeight: 800, color: C.inkOnEnergy, lineHeight: 1 }}>
                      {active.done}<span style={{ fontSize: 19 }}>/{rows.length || ex.sets}</span>
                    </div>
                    {talking && <div className="eq" aria-hidden="true"><span/><span/><span/><span/></div>}
                  </div>
                </div>
                <div style={{ color: C.muted, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".14em", fontWeight: 600 }}>Sets complete</div>

                {/* Coach line */}
                {line && (
                  <div style={{ margin: "14px auto 0", maxWidth: 330, padding: "10px 14px", borderRadius: 14, background: C.surface, border: `1px solid ${C.line}`, color: C.body, fontSize: 13, lineHeight: 1.5, textAlign: "left" }}>
                    <span style={{ color: C.energy, fontWeight: 600 }}>Coach </span>{line}
                  </div>
                )}

                {/* Rest timer */}
                {rest !== null && (
                  <div style={{ margin: "14px auto 0", maxWidth: 330, borderRadius: 14, background: "rgba(122,203,239,.09)", border: "1px solid rgba(122,203,239,.3)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                    <Timer size={17} color={C.recovery} />
                    <div style={{ flex: 1, textAlign: "left" }}>
                      <div style={{ color: C.recovery, fontSize: 13, fontWeight: 600 }}>Rest {Math.floor(rest / 60)}:{String(rest % 60).padStart(2, "0")}</div>
                      <div style={{ height: 4, background: "rgba(122,203,239,.18)", borderRadius: 2, marginTop: 5, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: "100%", transform: `scaleX(${rest / 90})`, transformOrigin: "left", background: C.recovery, borderRadius: 2, transition: "transform 1s linear" }} />
                      </div>
                    </div>
                    <button aria-label="Skip rest" onClick={() => setRest(null)} style={{ background: "none", border: "none", color: C.recovery, display: "flex", padding: 6 }}><X size={16} /></button>
                  </div>
                )}

                {/* Set grid */}
                <Card style={{ textAlign: "left", marginTop: 16, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, fontSize: 9.5, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: ".1em" }}>Set</div>
                    <div style={{ flex: 1, textAlign: "center", fontSize: 9.5, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: ".1em" }}>Reps</div>
                    <div style={{ flex: 1, textAlign: "center", fontSize: 9.5, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: ".1em" }}>Lb</div>
                    <div style={{ width: 44 }} />
                  </div>
                  {rows.map((row, k) => (
                    <div key={k} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                      <div className="ff-d" style={{ width: 28, fontSize: 13, fontWeight: 700, color: C.muted }}>{k + 1}</div>
                      <div style={{ flex: 1 }}>
                        <input type="number" inputMode="numeric" aria-label={`Set ${k + 1} reps`} value={row.reps} disabled={row.done}
                          onChange={(e) => updateRow(k, { reps: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                          className="ff-d"
                          style={{ width: "100%", textAlign: "center", background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 11, minHeight: 44, fontSize: 18, fontWeight: 700, color: C.text, opacity: row.done ? .55 : 1 }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        {bw ? (
                          <div className="ff-d" style={{ width: "100%", boxSizing: "border-box", textAlign: "center", background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 11, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: C.body }}>BW</div>
                        ) : (
                          <input type="number" inputMode="numeric" aria-label={`Set ${k + 1} weight`} value={row.w} disabled={row.done}
                            onChange={(e) => updateRow(k, { w: parseInt(e.target.value, 10) || 0 })}
                            className="ff-d"
                            style={{ width: "100%", textAlign: "center", background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 11, minHeight: 44, fontSize: 18, fontWeight: 700, color: C.text, opacity: row.done ? .55 : 1 }} />
                        )}
                      </div>
                      <button aria-label={`Log set ${k + 1}`} onClick={() => checkRow(k)}
                        style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                          background: row.done ? C.recovery : "none", border: row.done ? "none" : `1px solid ${C.lineStrong}` }}>
                        <Check size={18} color={row.done ? C.bg : C.muted} />
                      </button>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 14, justifyContent: "center", alignItems: "center", marginTop: 12 }}>
                    <button aria-label="Remove set" onClick={removeRow}
                      style={{ width: 36, height: 36, borderRadius: "50%", border: `1px solid ${C.lineStrong}`, background: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Minus size={15} color={C.body} />
                    </button>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase" }}>Set</span>
                    <button aria-label="Add set" onClick={addRow}
                      style={{ width: 36, height: 36, borderRadius: "50%", border: `1px solid ${C.lineStrong}`, background: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Plus size={15} color={C.body} />
                    </button>
                  </div>
                </Card>

                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button onClick={() => speak(ex.cues.length ? ex.cues[Math.floor(Math.random() * ex.cues.length)] : FALLBACK_CUE)}
                    style={{ ...btnG, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                    <Mic size={15} /> Form cue
                  </button>
                  <button onClick={() => { stopAudio(); log.length ? finish(log) : setActive(null); }}
                    style={{ ...btnG, flex: 1 }}>
                    End workout
                  </button>
                </div>

                {VIDEO_IDS[ex.name] && (
                  <>
                    <button onClick={() => setVideoOpen(!videoOpen)} aria-expanded={videoOpen}
                      style={{ width: "100%", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 10, display: "flex", gap: 12, alignItems: "center", textAlign: "left", marginTop: 14 }}>
                      <img src={`https://i.ytimg.com/vi/${VIDEO_IDS[ex.name]}/mqdefault.jpg`} alt="" width={96} style={{ borderRadius: 9, display: "block" }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Form video</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Watch on YouTube · tap to {videoOpen ? "collapse" : "expand"}</div>
                      </div>
                      <Play size={16} color={C.energy} />
                    </button>
                    {videoOpen && (
                      <>
                        <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 14, overflow: "hidden",
                          background: C.surface2, border: `1px solid ${C.line}`, margin: "14px 0 0", textAlign: "left" }}>
                          <iframe key={ex.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                            src={`https://www.youtube-nocookie.com/embed/${VIDEO_IDS[ex.name]}`}
                            title={`${ex.name} — form video`}
                            loading="lazy"
                            allowFullScreen
                            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" />
                        </div>
                        <div style={{ color: C.muted, fontSize: 11, textAlign: "left", marginTop: 6 }}>Form demo · YouTube</div>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* FUEL */}
          {tab === "fuel" && (() => {
            const fuelToday = fuelLog[fuelDay] ?? [];
            const totals = fuelToday.reduce((t, e) => ({
              kcal: t.kcal + (e.kcal || 0), protein: t.protein + (e.protein || 0),
              carbs: t.carbs + (e.carbs || 0), fat: t.fat + (e.fat || 0),
            }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
            const proteinPct = Math.min(100, Math.round((totals.protein / fuelTargets.protein) * 100));
            const kcalLeft = Math.round(fuelTargets.kcal - totals.kcal);
            const dotFor = (k) => {
              const rows = fuelLog[k] ?? [];
              if (!rows.length) return null;
              const protein = rows.reduce((s, e) => s + (e.protein || 0), 0);
              return protein >= fuelTargets.protein ? C.recovery : C.energy;
            };
            const labelFor = (k, d) => {
              const rows = fuelLog[k] ?? [];
              if (!rows.length) return `${fmtLong(d)} — nothing logged`;
              const kcal = Math.round(rows.reduce((s, e) => s + (e.kcal || 0), 0));
              return `${fmtLong(d)} — ${rows.length} foods, ${kcal} kcal`;
            };
            const isFuelToday = fuelDay === iso(TODAY);
            return (
              <div>
                <CalendarStrip selected={fuelDay} onSelect={setFuelDay} dotFor={dotFor} labelFor={labelFor} />
                <h1 className="ff-d" style={{ fontSize: 36, fontWeight: 700, color: C.text, textTransform: "uppercase", margin: "18px 0 0", lineHeight: 1 }}>Fuel</h1>
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 0" }}>
                  <div style={{ color: C.muted, fontSize: 13 }}>{fmtLong(new Date(fuelDay + "T00:00:00"))}</div>
                  {!isFuelToday && <Pill tone="energy">{fuelDay < iso(TODAY) ? "Editing a past day" : "Editing a future day"}</Pill>}
                </div>

                <Card style={{ marginTop: 18, display: "flex", gap: 16, alignItems: "center" }}>
                  <Ring score={proteinPct} label="Protein" />
                  <div>
                    <div style={{ color: kcalLeft < 0 ? C.energy : C.text, fontSize: 15, fontWeight: 600 }}>
                      {kcalLeft < 0 ? `Over by ${Math.abs(kcalLeft)}` : `${kcalLeft} kcal left`}
                    </div>
                    <div style={{ color: C.muted, fontSize: 12.5, marginTop: 5 }}>
                      {Math.round(totals.kcal)} of {fuelTargets.kcal} kcal · {Math.round(totals.protein)} of {fuelTargets.protein} g protein
                    </div>
                  </div>
                </Card>
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <MiniStat n={Math.round(totals.kcal)} t="Kcal" />
                  <MiniStat n={Math.round(totals.protein)} t="Protein g" />
                  <MiniStat n={Math.round(totals.carbs)} t="Carbs g" />
                  <MiniStat n={Math.round(totals.fat)} t="Fat g" />
                </div>

                <Label>Quick add</Label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {FUEL_QUICK.map((f) => (
                    <button key={f.name} onClick={() => addFuel(f)}
                      style={{ ...btnG, padding: "9px 14px", minHeight: 38, fontSize: 12.5 }}>
                      + {f.name}
                    </button>
                  ))}
                </div>

                <Label>Add food</Label>
                <Card>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input aria-label="Search foods" placeholder="Search foods…" value={foodQ}
                      onChange={(e) => setFoodQ(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") searchFood(); }}
                      style={{ ...inp, flex: 1, marginBottom: 0 }} />
                    <button onClick={searchFood} disabled={foodBusy || foodQ.trim().length < 2}
                      style={{ ...btnP, padding: "0 18px", minHeight: 44, flexShrink: 0, opacity: (foodBusy || foodQ.trim().length < 2) ? .45 : 1 }}>
                      Search
                    </button>
                  </div>
                  {foodResults !== null && (
                    foodResults.length ? (
                      <div style={{ marginTop: 12 }}>
                        {foodResults.map((r, i) => (
                          <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderTop: i > 0 ? `1px solid ${C.line}` : "none" }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ color: C.text, fontSize: 13.5, fontWeight: 600 }}>
                                {r.name}{r.brand && <span style={{ color: C.muted, fontWeight: 400, fontSize: 11, marginLeft: 6 }}>{r.brand}</span>}
                              </div>
                              <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>
                                {r.kcal} kcal · {r.protein}g P · {r.carbs}g C · {r.fat}g F · per {r.unit}
                              </div>
                            </div>
                            <button aria-label={`Add ${r.name}`} onClick={() => addFuel(r)}
                              style={{ width: 36, height: 36, borderRadius: 11, border: `1px solid ${C.lineStrong}`, background: "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <Plus size={16} color={C.body} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: C.muted, fontSize: 12.5, marginTop: 12 }}>
                        {foodUnavailable ? "Search unavailable right now — add it manually below." : "Nothing found — try a simpler term, or add it manually below."}
                      </div>
                    )
                  )}
                </Card>

                <button onClick={() => setManualOpen(!manualOpen)} aria-expanded={manualOpen}
                  style={{ background: "none", border: "none", color: C.recovery, fontSize: 13, fontWeight: 600, marginTop: 12, padding: "8px 0" }}>
                  Add manually
                </button>
                {manualOpen && (
                  <Card style={{ marginTop: 4 }}>
                    <input aria-label="Name" placeholder="Name" value={manual.name}
                      onChange={(e) => setManual({ ...manual, name: e.target.value })} style={inp} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <input aria-label="Kcal" placeholder="Kcal" type="number" inputMode="numeric" value={manual.kcal}
                        onChange={(e) => setManual({ ...manual, kcal: e.target.value })} style={{ ...inp, marginBottom: 0 }} />
                      <input aria-label="Protein grams" placeholder="Protein" type="number" inputMode="numeric" value={manual.protein}
                        onChange={(e) => setManual({ ...manual, protein: e.target.value })} style={{ ...inp, marginBottom: 0 }} />
                      <input aria-label="Carbs" placeholder="Carbs" type="number" inputMode="numeric" value={manual.carbs}
                        onChange={(e) => setManual({ ...manual, carbs: e.target.value })} style={{ ...inp, marginBottom: 0 }} />
                      <input aria-label="Fat" placeholder="Fat" type="number" inputMode="numeric" value={manual.fat}
                        onChange={(e) => setManual({ ...manual, fat: e.target.value })} style={{ ...inp, marginBottom: 0 }} />
                    </div>
                    <button onClick={addManual} disabled={!manual.name.trim()}
                      style={{ ...btnP, width: "100%", marginTop: 12, opacity: manual.name.trim() ? 1 : .45 }}>
                      Add to log
                    </button>
                  </Card>
                )}

                <Label>Logged today</Label>
                <Card style={{ padding: 0 }}>
                  {fuelToday.length ? fuelToday.map((e, i) => (
                    <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "14px 16px", borderBottom: i < fuelToday.length - 1 ? `1px solid ${C.line}` : "none" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: C.text, fontSize: 13.5, fontWeight: 600 }}>
                          {e.name}{e.brand && <span style={{ color: C.muted, fontWeight: 400, fontSize: 11, marginLeft: 6 }}>{e.brand}</span>}
                        </div>
                        <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>
                          {e.kcal} kcal · {e.protein}g P · {e.carbs}g C · {e.fat}g F
                        </div>
                      </div>
                      <button aria-label={`Delete ${e.name}`} onClick={() => deleteFuel(e.id)}
                        style={{ background: "none", border: "none", color: C.muted, flexShrink: 0, display: "flex", padding: 4 }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )) : (
                    <div style={{ padding: 16, color: C.muted, fontSize: 12.5 }}>Nothing logged yet.</div>
                  )}
                </Card>

                <Label>Targets</Label>
                <Card>
                  <Stepper label="Bodyweight" value={bodyweight} unit="lb" step={5} min={80} onChange={changeBodyweight} />
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    {["cut", "maintain", "build"].map((g) => {
                      const sel = fuelGoal === g;
                      return (
                        <button key={g} onClick={() => setFuelGoal(g)} aria-pressed={sel}
                          style={{ flex: 1, background: sel ? "rgba(41,171,226,.08)" : C.surface2,
                            border: `1px solid ${sel ? "rgba(41,171,226,.55)" : C.line}`, borderRadius: 12,
                            padding: "10px 0", fontSize: 12.5, fontWeight: 600, color: sel ? C.energy : C.body, textTransform: "capitalize" }}>
                          {g}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={calcTargets} style={{ ...btnG, width: "100%", marginTop: 12 }}>Calculate targets</button>
                  <div style={{ color: C.muted, fontSize: 11, marginTop: 8 }}>Or set them by eye — protein drives the ring.</div>
                </Card>
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

              <button onClick={() => {
                  const csv = buildServerHistoryCsv(serverLogs, serverAssignments);
                  const blob = new Blob([csv], { type: "text/csv" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `workhart-history-${iso(TODAY)}.csv`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
                style={{ ...btnG, width: "100%", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Download size={16} /> Export history (CSV)
              </button>
              <div style={{ color: C.muted, fontSize: 11, textAlign: "center", marginTop: 8 }}>Every logged set · CSV opens in any spreadsheet</div>
            </div>
          )}

          {/* YOU: THE SETTINGS CONTENT INLINE, PLUS THE VOICE SWITCH THE FORCED SHELL HAS NO HEADER FOR */}
          {tab === "you" && (
            <div>
              <h1 className="ff-d" style={{ fontSize: 36, fontWeight: 700, color: C.text, textTransform: "uppercase", margin: "18px 0 0", lineHeight: 1 }}>You</h1>
              <button onClick={() => { setVoiceOn(!voiceOn); if (voiceOn) stopAudio(); }} aria-pressed={voiceOn}
                style={{ ...btnG, width: "100%", marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: voiceOn ? C.energy : C.muted }}>
                {voiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />} Coach voice {voiceOn ? "on" : "off"}
              </button>
              {settingsBody}
            </div>
          )}

          {/* COACH */}
          {tab === "coach" && (
            <div>
              <h1 className="ff-d" style={{ fontSize: 36, fontWeight: 700, color: C.text, textTransform: "uppercase", margin: "18px 0 0", lineHeight: 1 }}>Coach</h1>

              <Card style={{ marginTop: 14, display: "flex", gap: 13, alignItems: "center" }}>
                <div style={{ ...ava, width: 50, height: 50, fontSize: 19 }}>{coachInitial}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: C.text, fontSize: 15.5, fontWeight: 600 }}>{coachName}</div>
                  <div style={{ color: C.muted, fontSize: 12.5 }}>Head Coach · WORKHART</div>
                </div>
                <Pill tone="recovery">Online</Pill>
              </Card>
              {voiceStatus === "fail" && (
                <div style={{ color: C.muted, fontSize: 11, marginTop: 8 }}>
                  Voice unavailable right now — coach will text instead.
                </div>
              )}

              <Card
                role="button"
                aria-label="Play coach video (coming soon)"
                onClick={() => {}}
                style={{ marginTop: 14, padding: 0, cursor: "pointer" }}>
                <div style={{ aspectRatio: "16 / 9", background: C.surface2, position: "relative", display: "flex",
                  alignItems: "center", justifyContent: "center", borderRadius: "18px 18px 0 0", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", opacity: .12 }}>
                    <Mark height={90} />
                  </div>
                  <div style={{ position: "absolute", top: 10, left: 10, fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase",
                    color: C.muted, background: "rgba(0,0,0,.35)", padding: "4px 8px", borderRadius: 6 }}>WEEKLY MESSAGE</div>
                  <div style={{ width: 54, height: 54, borderRadius: "50%", background: C.energy, display: "flex", alignItems: "center",
                    justifyContent: "center", boxShadow: "0 6px 18px rgba(41,171,226,.4)", position: "relative" }}>
                    <Play size={22} color={T.color.onDeep} fill="currentColor" />
                  </div>
                </div>
                <div style={{ padding: "12px 16px" }}>
                  <div style={{ color: C.text, fontSize: 14.5, fontWeight: 600 }}>A word from Coach Kyle</div>
                  <div style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>This week's focus · 2:14</div>
                </div>
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
                <MessageSquare size={16} /> Message Coach {coachFirst}
              </button>

              <>
                  <Label>Messages</Label>
                  <Card style={{ padding: 0 }}>
                    {threadBusy ? (
                      <div style={{ padding: 16, color: C.muted, fontSize: 12.5 }}>Loading…</div>
                    ) : threadMessages.length === 0 ? (
                      <div style={{ padding: 16, color: C.muted, fontSize: 12.5 }}>
                        No messages yet — say hello to Coach {coachFirst}.
                      </div>
                    ) : (
                      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                        {threadMessages.map((m) => {
                          const mine = m.sender === "user";
                          return (
                            <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                              <div style={{ maxWidth: "82%", display: "flex", alignItems: "flex-start", gap: 8,
                                background: mine ? "rgba(41,171,226,.13)" : C.surface2,
                                border: `1px solid ${mine ? "rgba(41,171,226,.35)" : C.line}`, borderRadius: 14, padding: "10px 13px" }}>
                                {!mine && (
                                  <button aria-label="Play message" onClick={() => speak(m.body)}
                                    style={{ background: "none", border: "none", color: C.energy, padding: 0, marginTop: 2, display: "flex", flexShrink: 0 }}>
                                    <Volume2 size={14} />
                                  </button>
                                )}
                                <div>
                                  <div style={{ color: C.body, fontSize: 13.5, lineHeight: 1.5 }}>{m.body}</div>
                                  <div style={{ color: C.muted, fontSize: 10.5, marginTop: 4 }}>
                                    {new Date(m.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ borderTop: threadMessages.length ? `1px solid ${C.line}` : "none", padding: "12px 16px 16px" }}>
                      {msgError && <div style={{ color: C.energy, fontSize: 11.5, marginBottom: 8 }}>{msgError}</div>}
                      <div style={{ display: "flex", gap: 8 }}>
                        <input aria-label="Message Coach" placeholder="Write a message…" value={msgDraft}
                          onChange={(e) => setMsgDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && msgDraft.trim()) sendThreadMessage(); }}
                          style={{ ...inp, marginBottom: 0, flex: 1, minHeight: 44 }} />
                        <button onClick={sendThreadMessage} disabled={!msgDraft.trim() || msgBusy}
                          style={{ ...btnP, padding: "0 18px", minHeight: 44, opacity: msgDraft.trim() && !msgBusy ? 1 : .45, flexShrink: 0 }}>
                          Send
                        </button>
                      </div>
                    </div>
                  </Card>
                </>

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
                            style={{ borderRadius: 999, padding: "7px 13px", minHeight: 32, fontSize: 11.5, fontWeight: 600, background: "rgba(122,203,239,.12)", color: C.recovery, border: "1px solid transparent" }}>Connected</button>
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

        {!forcedTab && (
        <nav aria-label="Main" style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "rgba(10,10,11,.92)", backdropFilter: "blur(14px)", borderTop: `1px solid ${C.line}`, display: "flex", padding: "8px 8px calc(8px + env(safe-area-inset-bottom))" }}>
          {[
            ["today", "Today", Home],
            ["train", "Train", Dumbbell],
            ["fuel", "Fuel", Flame],
            ["progress", "Progress", TrendingUp],
            ["coach", "Coach", MessageSquare],
          ].map(([key, label, Ic]) => (
            <button key={key} onClick={() => setTab(key)} aria-current={tab === key ? "page" : undefined}
              style={{ flex: 1, background: "none", border: "none", padding: "8px 4px", minHeight: 52, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ position: "relative" }}>
                <Ic size={20} color={tab === key ? C.energy : C.muted} strokeWidth={tab === key ? 2.4 : 2} />
                {key === "coach" && unreadMessages > 0 && (
                  <span aria-label={`${unreadMessages} unread message${unreadMessages === 1 ? "" : "s"}`}
                    style={{ position: "absolute", top: -3, right: -8, minWidth: 15, height: 15, borderRadius: 999,
                      background: C.energy, color: C.inkOnEnergy, fontSize: 9.5, fontWeight: 700, lineHeight: "15px",
                      textAlign: "center", padding: "0 3px" }}>
                    {unreadMessages > 9 ? "9+" : unreadMessages}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: tab === key ? C.text : C.muted, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</span>
            </button>
          ))}
        </nav>
        )}

        {showReadiness && (
          <Sheet title="Readiness" onClose={() => setShowReadiness(false)}>
            <div style={{ display: "flex", marginTop: 18 }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600 }}>Long-term average</div>
                <div className="ff-d" style={{ fontSize: 34, fontWeight: 800, color: C.text, marginTop: 4 }}>{baselineAvg ?? "–"}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600 }}>Recent average</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <span className="ff-d" style={{ fontSize: 34, fontWeight: 800, color: C.recovery }}>{recentAvg ?? "–"}</span>
                  {recentAvg >= baselineAvg
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
              <div style={ava}>{coachInitial}</div>
              <div style={{ flex: 1, background: C.surface2, borderRadius: 14, padding: "10px 14px", color: C.body, fontSize: 13, lineHeight: 1.55 }}>
                {recentAvg >= baselineAvg
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

            <div style={{ color: C.muted, fontSize: 11.5, marginTop: 12 }}>Synced from Whoop &amp; Apple Watch · visible to Coach {coachFirst}</div>
          </Sheet>
        )}


        {exDetail && (
          <Sheet title={exDetail} onClose={() => setExDetail(null)}>
            {EX_INFO[exDetail] && (
              <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{EX_INFO[exDetail].muscles} · {EX_INFO[exDetail].equipment}</div>
            )}
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
                  {histFor(exDetail) ? (
                    <>
                      <div className="ff-d" style={{ fontSize: 24, fontWeight: 700, color: C.text, marginTop: 6 }}>{histFor(exDetail).pr.label}</div>
                      <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{histFor(exDetail).pr.date}</div>
                    </>
                  ) : (
                    <div className="ff-d" style={{ fontSize: 18, fontWeight: 700, color: C.muted, marginTop: 6 }}>No logged sets yet</div>
                  )}
                </div>

                <div style={{ marginTop: 12 }}>
                  <Stepper label="Working max" unit="lb" step={5}
                    value={maxes[exDetail] ?? histFor(exDetail)?.baseMax ?? 0}
                    onChange={(v) => setMaxes({ ...maxes, [exDetail]: v })} />
                </div>

                {histFor(exDetail)?.series.length >= 2 && (
                  <>
                    <Label>Estimated 1-rep max</Label>
                    <div style={{ height: 160 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={histFor(exDetail).series}>
                          <Line type="monotone" dataKey="lb" stroke={C.energy} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                          <XAxis dataKey="wk" stroke={C.muted} fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis hide domain={["dataMin - 10", "dataMax + 10"]} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )}
              </div>
            )}

            {exTab === "instruction" && (() => {
              const found = activeWorkout.exercises.find((e) => e.name === exDetail);
              const info = EX_INFO[exDetail];
              const cues = found ? found.cues : info?.cues ? info.cues : [
                "Brace before every rep.",
                "Control the negative — two seconds down.",
                "Stop one rep before form breaks.",
              ];
              return (
                <div style={{ marginTop: 16 }}>
                  {info?.blurb && (
                    <div style={{ color: C.body, fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}>{info.blurb}</div>
                  )}
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

        {showSettings && (
          <Sheet title="Settings" onClose={() => setShowSettings(false)}>
            {settingsBody}
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
  fontFamily: T.font.body, outline: "none",
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
  flexShrink: 0, fontFamily: T.font.body,
};
function Stat({ n, t, hot }) {
  return (
    <div style={{ flex: 1, background: C.surface, border: `1px solid ${hot ? "rgba(41,171,226,.45)" : C.line}`, borderRadius: 17, padding: "15px 10px", textAlign: "center" }}>
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
