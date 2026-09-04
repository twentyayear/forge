import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Home, Dumbbell, TrendingUp, TrendingDown, MessageSquare, Volume2, VolumeX, Mic,
  ChevronDown, ChevronRight, Award, Watch, Activity, Flame, Play, Check, Moon, Trash2,
  Plus, Minus, Timer, X, PartyPopper, Gauge, Download, Settings, Lock,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, BarChart, Bar, Tooltip, CartesianGrid } from "recharts";

// ---- Tokens ----
const C = {
  bg: "#0A0A0B", surface: "#141416", surface2: "#1B1B1F",
  line: "#26262B", lineStrong: "#3B3B44",
  text: "#F4F4F6", body: "#C9C9CF", muted: "#8C8C95",
  energy: "#29ABE2", energyDeep: "#1B7FB2",
  recovery: "#7ACBEF", inkOnEnergy: "#081C28",
};

const css = `
*, *::before, *::after { box-sizing: border-box; }
html, body { overflow-x: hidden; }
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap');
.ff-d { font-family: 'Barlow Condensed', sans-serif; }
.ff-b { font-family: 'Space Grotesk', system-ui, sans-serif; }
button { cursor: pointer; font-family: 'Space Grotesk', system-ui, sans-serif; }
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

const TTS_ENDPOINT = "/api/tts";
const KYLE_VOICE = "ZAIovxRU9FXNYmauX8CL";

// Build-time mode gate: only VITE_-prefixed env vars are inlined by Vite.
// Netlify (prototype) builds never set this — server mode is droplet-only.
const SERVER_MODE = import.meta.env.VITE_SERVER_MODE === "1";

const SPOKEN_WORDS = [
  [/\bDB\b/g, "dumbbell"],
  [/\bEZ-?Bar\b/gi, "easy bar"],
  [/\bRDL\b/g, "Romanian deadlift"],
  [/\bAMRAP\b/gi, "as many reps as possible"],
  [/\bBW\b/g, "bodyweight"],
  [/\b1RM\b/g, "one rep max"],
  [/\bHRV\b/g, "heart rate variability"],
];
const speechify = (t) => SPOKEN_WORDS.reduce((s, [re, w]) => s.replace(re, w), t);

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

const EX_LIB = [
  // ---- Existing 25 ----
  { name: "Barbell Bench Press", equipment: "Barbell", muscles: "Chest · Shoulders · Triceps", base: 185, video: "4Y2ZdHCOXok",
    blurb: "The standard for upper body pressing strength. Build it heavy and control the bar the whole way down.",
    cues: ["Feet planted, slight arch, shoulder blades pinned back", "Bar touches mid-chest — no bouncing", "Drive up and slightly back toward the rack"] },
  { name: "Seated DB Shoulder Press", equipment: "Dumbbell", muscles: "Shoulders · Triceps", base: 55, video: "vlFGTI5JzjI",
    blurb: "Builds overhead strength and shoulder stability without a spotter. Go through a full range every rep.",
    cues: ["Ribs down — don't flare at the bottom", "Elbows about 30° in front of your body", "Lock out without shrugging"] },
  { name: "Incline DB Press", equipment: "Dumbbell", muscles: "Upper Chest · Shoulders", base: 60, video: "IP4oeKh1Sd4",
    blurb: "Targets the upper chest that flat pressing misses. Keep the bench angle modest — steep angles turn it into a shoulder press.",
    cues: ["Bench at 30° — higher shifts load to shoulders", "Lower until upper arm dips just below parallel", "Press up and slightly together"] },
  { name: "Cable Lateral Raise", equipment: "Cable", muscles: "Side Delts", base: 15, video: "Sp8be0IFNvk",
    blurb: "Isolates the side delt with constant tension the whole rep — better than dumbbells for building width.",
    cues: ["Lead with the elbow, not the hand", "Stop at shoulder height", "Two seconds down, every rep"] },
  { name: "Overhead Rope Extension", equipment: "Cable", muscles: "Triceps", base: 42, video: "Fwl0T1_giQ0",
    blurb: "Hits the long head of the triceps with a deep stretch overhead — a finisher that adds real arm size.",
    cues: ["Elbows stay close to your ears", "Full stretch at the bottom", "Squeeze hard at lockout"] },
  { name: "Push-Up Finisher", equipment: "Bodyweight", muscles: "Chest · Triceps · Core", base: 0, video: "I9fsqKE5XHo",
    blurb: "Bodyweight finisher for max reps — burns out what heavy pressing left in the tank.",
    cues: ["One straight line, head to heels", "Chest to an inch off the floor", "Stop one rep before form breaks"] },
  { name: "Deadlift", equipment: "Barbell", muscles: "Back · Glutes · Hamstrings", base: 225, video: "XxWcirHIwVo",
    blurb: "The king of posterior chain lifts. Build the pull from the floor, not the back.",
    cues: ["Bar over mid-foot before you pull", "Push the floor away — hips and shoulders rise together", "Lock out with glutes, not lower back"] },
  { name: "Pull-Up", equipment: "Bodyweight", muscles: "Back · Biceps", base: 0, video: "eGo4IYlbE5g",
    blurb: "The gold standard for back width. Full hang to chin over the bar, every rep.",
    cues: ["Start from a dead hang, shoulders engaged", "Pull elbows down and back, not just up", "Chin clears the bar under control"] },
  { name: "Barbell Row", equipment: "Barbell", muscles: "Back · Biceps", base: 135, video: "FWJR5Ve8bnQ",
    blurb: "Builds back thickness and pulling strength. Keep the torso angle locked — don't let the hips rise on the pull.",
    cues: ["Hinge to roughly 45°, flat back", "Pull the bar to your lower ribs", "No jerking — control the weight down"] },
  { name: "Seated Cable Row", equipment: "Cable", muscles: "Back · Biceps", base: 120, video: "vwHG9Jfu4sw",
    blurb: "Builds mid-back thickness with a controlled, strict pull — no momentum needed.",
    cues: ["Sit tall, chest up through the whole rep", "Pull to your stomach, elbows close", "Pause and squeeze the shoulder blades together"] },
  { name: "Barbell Curl", equipment: "Barbell", muscles: "Biceps", base: 65, video: "QZEqB6wUPxQ",
    blurb: "The classic mass builder for the biceps. Strict form beats heavier weight swung with the hips.",
    cues: ["Elbows pinned to your sides", "Curl without swinging the torso", "Lower all the way — no partial reps"] },
  { name: "Back Squat", equipment: "Barbell", muscles: "Quads · Glutes", base: 205, video: "my0tLDaWyDU",
    blurb: "The foundational lower body lift. Depth and a braced core matter more than the number on the bar.",
    cues: ["Brace hard before you unrack", "Hips and knees break together, sit between your heels", "Drive through the whole foot to stand"] },
  { name: "Romanian Deadlift", equipment: "Barbell", muscles: "Hamstrings · Glutes", base: 155, video: "5zmlnbWb-g4",
    blurb: "Builds hamstring strength through a deep stretch. This is a hip hinge, not a squat — keep the bar close.",
    cues: ["Soft knees, hinge at the hips", "Bar stays close, sliding down your thighs", "Stop when you feel the hamstring stretch, not lower back rounding"] },
  { name: "Walking Lunge", equipment: "Dumbbell", muscles: "Quads · Glutes", base: 40, video: "Pbmj6xPo-Hw",
    blurb: "Unilateral leg work that exposes and fixes side-to-side imbalances.",
    cues: ["Step long enough for a 90° front knee", "Torso stays tall, no leaning forward", "Push through the front heel to stand"] },
  { name: "Leg Press", equipment: "Machine", muscles: "Quads · Glutes", base: 270, video: "FNTd_mxtWmo",
    blurb: "Loads the legs heavy with the back fully supported — a safe way to push volume.",
    cues: ["Feet shoulder-width on the platform", "Knees track over your toes, don't cave in", "Don't lock out hard or let hips lift off the pad"] },
  { name: "Standing Calf Raise", equipment: "Machine", muscles: "Calves", base: 90, video: "k8ipHzKeAkQ",
    blurb: "Builds calf size and ankle strength through a full range of motion — most people cut this rep short.",
    cues: ["Full stretch at the bottom", "Rise all the way onto the toes", "Pause a beat at the top before lowering"] },
  { name: "Push Press", equipment: "Barbell", muscles: "Shoulders · Triceps", base: 115, video: "gFmV302JErc",
    blurb: "Uses leg drive to move more weight overhead than a strict press — builds explosive pressing power.",
    cues: ["Slight dip, straight down, straight up", "Drive through the legs, not the arms first", "Punch through and lock out overhead"] },
  { name: "Weighted Pull-Up", equipment: "Bodyweight", muscles: "Back · Biceps", base: 25, video: "Sj7k-tOFdsM",
    blurb: "Adds external load once bodyweight pull-ups get easy — the next step for back strength.",
    cues: ["Start from a dead hang under load", "Pull without kipping or swinging", "Full lockout at the bottom every rep"] },
  { name: "Close-Grip Bench Press", equipment: "Barbell", muscles: "Triceps · Chest", base: 155, video: "UYJsFzqdgK4",
    blurb: "Shifts bench press emphasis onto the triceps with a narrower grip. Elbows track close, not flared.",
    cues: ["Hands just inside shoulder width", "Elbows track close to the body on the way down", "Drive up focusing on tricep lockout"] },
  { name: "EZ-Bar Curl", equipment: "Barbell", muscles: "Biceps", base: 60, video: "5NsFLGUf0Fo",
    blurb: "The angled grip takes stress off the wrists while still loading the biceps heavy.",
    cues: ["Elbows stay tucked at your sides", "Curl through a full range, no bouncing", "Control the lowering — don't just drop it"] },
  { name: "Triceps Pushdown", equipment: "Cable", muscles: "Triceps", base: 55, video: "8WL0m0vLAPo",
    blurb: "Simple, effective triceps isolation with constant cable tension top to bottom.",
    cues: ["Elbows locked at your sides the whole set", "Extend fully without leaning on the bar", "Control the return — don't let the weight stack slam"] },
  { name: "Kettlebell Swing", equipment: "Kettlebell", muscles: "Glutes · Hamstrings · Core", base: 53, video: "DqkYuWR4zRI",
    blurb: "A hip-hinge power move that trains the posterior chain explosively — this is a hip snap, not a squat or an arm lift.",
    cues: ["Hinge the hips back, load the hamstrings", "Snap the hips forward — the arms just follow", "Bell floats to chest height, no shoulder lifting"] },
  { name: "Rowing Sprint", equipment: "Machine", muscles: "Full Body · Conditioning", base: 0, video: "mrexeRFo4UM",
    blurb: "A full-body conditioning piece — legs drive the power, arms finish the pull.",
    cues: ["Legs drive first, then hips, then arms", "Keep the back flat through the whole stroke", "Recover in the same order you drove — arms, hips, legs"] },
  { name: "Sled Push", equipment: "Machine", muscles: "Quads · Glutes · Conditioning", base: 180, video: "9XRRXaUpnLk",
    blurb: "Brutal, low-skill leg conditioning with almost zero eccentric load — safe to push hard.",
    cues: ["Low shin angle, drive from the balls of your feet", "Short, powerful steps — don't overstride", "Keep the arms locked, let the legs do the work"] },
  { name: "Plank Hold", equipment: "Bodyweight", muscles: "Core", base: 0, video: "6LqqeBtFn9M",
    blurb: "Builds core stability under time, not reps — the whole point is resisting movement, not creating it.",
    cues: ["Straight line from head to heels", "Squeeze glutes and brace the abs, don't let hips sag", "Breathe — don't hold your breath through the set"] },
  // ---- New 25 ----
  { name: "Dumbbell Bench Press", equipment: "Dumbbell", muscles: "Chest · Triceps", base: 65, video: "YQ2s_Y7g5Qk",
    blurb: "Dumbbells let each arm work independently and add a deeper stretch than a barbell bench.",
    cues: ["Elbows at about 45° to your torso", "Lower until upper arms are level with the bench", "Press up and slightly in without clanking the dumbbells"] },
  { name: "One-Arm DB Row", equipment: "Dumbbell", muscles: "Back · Biceps", base: 70, video: "pYcpY20QaE8",
    blurb: "Trains each side of the back independently and lets you load heavier with a braced position.",
    cues: ["Flat back, brace the free hand on the bench", "Pull the elbow up and back, not out", "Squeeze at the top, control it down"] },
  { name: "Goblet Squat", equipment: "Kettlebell", muscles: "Quads · Glutes", base: 60, video: "MxsFDhcyFyE",
    blurb: "The front-loaded weight forces an upright torso — a great way to groove squat depth and pattern.",
    cues: ["Hold the bell tight to your chest", "Sit straight down between your heels", "Elbows brush your knees at the bottom"] },
  { name: "Barbell Hip Thrust", equipment: "Barbell", muscles: "Glutes · Hamstrings", base: 225, video: "EF7jXP17DPE",
    blurb: "The most direct way to overload the glutes. Full lockout at the top is the whole rep.",
    cues: ["Upper back braced on the bench, chin tucked", "Drive through the heels to full hip extension", "Squeeze glutes hard at the top, don't hyperextend the low back"] },
  { name: "Lat Pulldown", equipment: "Cable", muscles: "Back · Biceps", base: 140, video: "qaJhYsCkX2s",
    blurb: "Builds pulling strength and back width for anyone not yet doing full pull-ups.",
    cues: ["Grip just outside shoulder width", "Pull to your upper chest, lead with the elbows", "Control the bar back up — don't let it yank you"] },
  { name: "Face Pull", equipment: "Cable", muscles: "Rear Delts · Upper Back", base: 45, video: "UMGpxwhsy_k",
    blurb: "The best corrective move for rounded shoulders — high reps, light weight, done consistently.",
    cues: ["Pull to your face, not your chest", "Elbows finish high, above shoulder height", "Externally rotate at the end — thumbs point back"] },
  { name: "Hammer Curl", equipment: "Dumbbell", muscles: "Biceps · Forearms", base: 35, video: "8XLxfXROrTo",
    blurb: "The neutral grip shifts work onto the brachialis and forearms for thicker-looking arms.",
    cues: ["Palms face each other the whole rep", "Elbows stay pinned at your sides", "Curl and lower under control, no swinging"] },
  { name: "Bulgarian Split Squat", equipment: "Dumbbell", muscles: "Quads · Glutes", base: 40, video: "HBYGeyb4sSM",
    blurb: "Brutal single-leg work that builds strength and exposes imbalances a back squat hides.",
    cues: ["Rear foot elevated, most of your weight on the front leg", "Drop straight down, front knee tracks over the toes", "Drive through the front heel to stand"] },
  { name: "Leg Extension", equipment: "Machine", muscles: "Quads", base: 110, video: "m0FOpMEgero",
    blurb: "Pure quad isolation — a good finisher after compound leg work, not a replacement for it.",
    cues: ["Back flat against the pad", "Extend to full lockout, squeeze the quads", "Lower under control — don't let the stack drop"] },
  { name: "Lying Leg Curl", equipment: "Machine", muscles: "Hamstrings", base: 90, video: "n5WDXD_mpVY",
    blurb: "Isolates the hamstrings through knee flexion — complements the hip-hinge work RDLs and deadlifts do.",
    cues: ["Hips stay flat on the pad", "Curl through a full range, squeeze at the top", "Lower slowly — don't let momentum take over"] },
  { name: "Front Squat", equipment: "Barbell", muscles: "Quads · Core", base: 165, video: "G-Vamqoy8qM",
    blurb: "The front-rack position forces an upright torso and hammers the quads harder than a back squat.",
    cues: ["Elbows up, bar resting on your front delts", "Stay upright — the torso can't lean forward here", "Drive up through mid-foot, elbows stay high"] },
  { name: "Overhead Press", equipment: "Barbell", muscles: "Shoulders · Triceps", base: 115, video: "_RlRDWO2jfg",
    blurb: "The strict standing press — builds raw shoulder strength with no leg drive to cheat with.",
    cues: ["Brace the core, squeeze the glutes", "Bar path stays close, just past your face", "Lock out overhead, head through at the top"] },
  { name: "Dips", equipment: "Bodyweight", muscles: "Chest · Triceps", base: 0, video: "BRBVKxMb1RQ",
    blurb: "A heavy bodyweight pressing move — lean forward for chest, stay upright for triceps.",
    cues: ["Lean forward slightly to bias the chest", "Lower until upper arms are about parallel", "Press up without flaring the elbows wide"] },
  { name: "Cable Chest Fly", equipment: "Cable", muscles: "Chest", base: 35, video: "HXVtFoExms0",
    blurb: "Isolates the chest through a wide arc with constant tension a dumbbell fly can't match.",
    cues: ["Slight bend in the elbows, hold it", "Bring hands together in front of your chest", "Control the stretch back — don't let the cables yank your arms"] },
  { name: "Incline Bench Press", equipment: "Barbell", muscles: "Upper Chest · Shoulders", base: 155, video: "5kyLUGVq_pk",
    blurb: "Builds the upper chest with heavier loading than dumbbells allow at the same incline.",
    cues: ["Bench at 30–45°, don't go steeper", "Bar touches just below the collarbone", "Drive up and slightly back toward the rack"] },
  { name: "Preacher Curl", equipment: "Barbell", muscles: "Biceps", base: 55, video: "sxA__DoLsgo",
    blurb: "The pad locks out body english — pure bicep tension from a dead stop every rep.",
    cues: ["Upper arms flat against the pad", "Lower all the way to a full stretch", "Curl without lifting off the pad"] },
  { name: "Skull Crusher", equipment: "Barbell", muscles: "Triceps", base: 60, video: "OQ4TWXkZjTc",
    blurb: "Loads the triceps heavy through a deep stretch — control the bar, this isn't the exercise to rush.",
    cues: ["Elbows point at the ceiling, don't flare out", "Lower the bar to your forehead, not your chest", "Extend through the triceps, not the shoulders"] },
  { name: "DB Lateral Raise", equipment: "Dumbbell", muscles: "Side Delts", base: 20, video: "3VcKaXpzqRo",
    blurb: "The classic shoulder-width builder — light weight, strict form, no momentum.",
    cues: ["Slight bend in the elbows, lead with them", "Raise to shoulder height, no higher", "Lower slowly — don't let gravity do the work"] },
  { name: "Barbell Shrug", equipment: "Barbell", muscles: "Traps", base: 185, video: "KbsQ1E8Hg0o",
    blurb: "Direct trap work — straight up and down, no rolling the shoulders.",
    cues: ["Arms stay straight the whole rep", "Shrug straight up toward your ears", "Pause at the top, lower under control"] },
  { name: "Cable Crunch", equipment: "Cable", muscles: "Abs", base: 70, video: "AV5PmZJIrrw",
    blurb: "Lets you load the abs directly with weight instead of just bodyweight reps.",
    cues: ["Kneel tall, rope at your ears", "Crunch by flexing the spine, not pulling with the arms", "Exhale hard at the bottom of each rep"] },
  { name: "Hanging Leg Raise", equipment: "Bodyweight", muscles: "Abs · Hip Flexors", base: 0, video: "Pr1ieGZ5atk",
    blurb: "Advanced core work that hits the lower abs harder than most floor exercises.",
    cues: ["Dead hang, avoid swinging", "Raise legs by curling the pelvis, not just lifting the legs", "Lower under control — don't let momentum take over"] },
  { name: "Farmer's Carry", equipment: "Dumbbell", muscles: "Grip · Core · Traps", base: 90, video: "Fkzk_RqlYig",
    blurb: "Simple loaded carry that builds grip, core bracing, and trap strength all at once.",
    cues: ["Stand tall, shoulders back, don't lean", "Grip hard the entire walk", "Take controlled steps — don't let the weight swing"] },
  { name: "Box Jump", equipment: "Bodyweight", muscles: "Quads · Glutes · Power", base: 0, video: "Fk4KjYsLfSg",
    blurb: "Trains explosive power — land soft and reset each rep instead of chaining reps fast.",
    cues: ["Swing the arms to drive the jump", "Land soft with knees bent", "Step down — don't jump down off the box"] },
  { name: "Arnold Press", equipment: "Dumbbell", muscles: "Shoulders", base: 45, video: "6Z15_WdXmVw",
    blurb: "The rotation hits all three heads of the deltoid, not just the front like a standard press.",
    cues: ["Start with palms facing you at shoulder height", "Rotate palms out as you press overhead", "Reverse the rotation on the way down"] },
  { name: "Chest-Supported Row", equipment: "Machine", muscles: "Back · Biceps", base: 90, video: "0UBRfiO4zDs",
    blurb: "The chest pad removes any momentum from the low back — pure, strict back tension.",
    cues: ["Chest pinned to the pad the whole set", "Pull elbows back, squeeze the shoulder blades", "Control the weight back to a full stretch"] },
];
const VIDEO_IDS = Object.fromEntries(EX_LIB.map((e) => [e.name, e.video]));
const EX_INFO = Object.fromEntries(EX_LIB.map((e) => [e.name, e]));

// ---- Deterministic exercise history ----
function exHistory(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  const base = EX_BASE[name];
  const isReps = base === 0 || (base === undefined && /Push-Up|Plank/.test(name));
  // working max ≈ est. 1RM above the day-to-day load; PR triple sits between the two
  const baseMax = base > 0 ? Math.round((base * 1.25) / 5) * 5 : 95 + (hash % 40) * 5;
  const pr = isReps
    ? { label: `${15 + (hash % 12)} reps`, date: "Aug 14" }
    : { label: `${Math.round(((base > 0 ? base : baseMax / 1.25) * 1.15) / 5) * 5} lb × 3`, date: "Aug 9" };
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
const EX_BASE = Object.fromEntries(EX_LIB.map((e) => [e.name, e.base]));
const SCHEDULE = buildSchedule();

// ---- History export (CSV) ----
const csvField = (v) => {
  const s = String(v);
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function buildHistoryCsv(todayLog, todayDone) {
  const rows = [["date", "session", "block", "exercise", "set", "reps", "weight_lb", "volume_lb"]];
  const doneDates = Object.keys(SCHEDULE).filter((k) => SCHEDULE[k].status === "done").sort();
  doneDates.forEach((date) => {
    const entry = SCHEDULE[date];
    entry.blocks.forEach((b) => {
      b.sets.forEach((s, si) => {
        rows.push([date, entry.name, b.letter, b.name, si + 1, s.reps, s.w, s.reps * s.w]);
      });
    });
  });
  if (todayDone && todayLog.length) {
    const counts = {};
    todayLog.forEach((l) => {
      counts[l.i] = (counts[l.i] || 0) + 1;
      const w = l.w || 0;
      rows.push([iso(TODAY), workout.name, "ABCDEF"[l.i], workout.exercises[l.i].name, counts[l.i], l.reps, w, w * l.reps]);
    });
  }
  return rows.map((r) => r.map(csvField).join(",")).join("\n");
}

// ---- Active-workout header helpers ----
const BLOCK_TYPES = ["Strength / Power", "Strength / Power", "Hypertrophy", "Hypertrophy", "Accessory", "Finisher"];
function lastFor(name) {
  for (let o = 1; o <= 28; o++) {
    const d = new Date(TODAY.getTime() - o * DAY_MS);
    const e = SCHEDULE[iso(d)];
    if (!e || e.status !== "done") continue;
    const block = e.blocks.find((b) => b.name === name);
    if (!block) continue;
    const sets = block.sets;
    if (sets.every((s) => s.w === 0)) {
      const maxReps = Math.max(...sets.map((s) => s.reps));
      return `${sets.length}×${maxReps} reps`;
    }
    const maxW = Math.max(...sets.map((s) => s.w));
    return `${sets.length}×${sets[sets.length - 1].reps} @ ${maxW} lb`;
  }
  return null;
}

// ---- Readiness trend ----
const READINESS_TODAY = 82;
const readinessSeriesFor = (todayScore) => {
  const todayIso = iso(TODAY);
  const series = [];
  for (let o = -9; o <= 0; o++) {
    const d = new Date(TODAY.getTime() + o * DAY_MS);
    const k = iso(d);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    if (k === todayIso) {
      series.push({ d: label, v: todayScore, today: true });
    } else {
      const e = SCHEDULE[k];
      if (e && e.readiness != null) series.push({ d: label, v: e.readiness });
    }
  }
  return series;
};
const longAvg = (() => {
  const vals = Object.values(SCHEDULE).filter((e) => e.readiness != null).map((e) => e.readiness);
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
})();
const recentAvgFor = (series) => {
  const last3 = series.slice(-3);
  return Math.round(last3.reduce((s, p) => s + p.v, 0) / last3.length);
};

// ---- Morning check-in ----
// 7 questions, 4 answers each; answer index IS its point value (0..3), max 21
const CHECKIN_QS = [
  { key: "hours",    q: "How much sleep did you get?",
    opts: ["Under 5 hours", "5–6 hours", "6–7 hours", "7 or more"] },
  { key: "sleep",    q: "How did you sleep?",
    opts: ["Tossed and turned", "Woke up a few times", "Mostly solid", "Slept like a rock"] },
  { key: "soreness", q: "How's your body feeling?",
    opts: ["Beat up — everything aches", "Sore in a few spots", "A little stiff", "Fresh and loose"] },
  { key: "energy",   q: "Where's your energy right now?",
    opts: ["Running on empty", "Dragging a bit", "Steady", "Fully charged"] },
  { key: "stress",   q: "How's your head?",
    opts: ["Overloaded", "Carrying some stress", "Mostly clear", "Calm and focused"] },
  { key: "fuel",     q: "How was your eating yesterday?",
    opts: ["Barely ate, or all junk", "Hit and miss", "Pretty solid", "Dialed in"] },
  { key: "drive",    q: "How much do you want to train today?",
    opts: ["Not at all", "I'll show up", "Ready to work", "Can't wait"] },
];

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

function HartMark({ size = 30 }) {
  return (
    <img src="/brand/workhart_mark.png" alt="" aria-hidden="true"
      style={{ height: size, width: "auto", display: "block" }} />
  );
}

function Ring({ score, label = "Readiness" }) {
  const r = 52, circ = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: 126, height: 126, flexShrink: 0 }}>
      <svg width="126" height="126" viewBox="0 0 128 128" role="img" aria-label={`${label} ${score} of 100`}>
        <circle cx="64" cy="64" r={r} fill="none" stroke={C.line} strokeWidth="9" />
        <circle cx="64" cy="64" r={r} fill="none" stroke={C.recovery} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)} transform="rotate(-90 64 64)" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div className="ff-d" style={{ fontSize: 40, fontWeight: 800, color: C.text, lineHeight: 1 }}>{score}</div>
        <div className="ff-b" style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: ".12em", marginTop: 2 }}>{label}</div>
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

function CalendarStrip({ selected, onSelect, doneToday, dotFor, labelFor }) {
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
          const e = SCHEDULE[k];
          const isSel = k === selected, isToday = k === todayIso;
          const dot = dotFor
            ? (dotFor(k) || "transparent")
            : (e ? ((e.status === "done" || (isToday && doneToday)) ? C.recovery : C.energy) : "transparent");
          const label = labelFor
            ? labelFor(k, d)
            : `${fmtLong(d)}${e ? ` — ${e.name}${e.status === "done" ? ", completed" : ", planned"}` : ", rest day"}`;
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

// ---- Fuel ----
const FUEL_QUICK = [
  { name: "Protein shake", kcal: 160, protein: 30, carbs: 5, fat: 3 },
  { name: "Chicken & rice", kcal: 520, protein: 45, carbs: 55, fat: 12 },
  { name: "Greek yogurt", kcal: 150, protein: 15, carbs: 9, fat: 4 },
];
function loadFuelLog() {
  try { return JSON.parse(localStorage.getItem("forge.fuelLog")) || {}; } catch (e) { return {}; }
}
function saveFuelLog(log) { localStorage.setItem("forge.fuelLog", JSON.stringify(log)); }
const DEFAULT_FUEL_TARGETS = { kcal: 2400, protein: 160 };
function loadFuelTargets() {
  try {
    const v = JSON.parse(localStorage.getItem("forge.fuelTargets"));
    return v && typeof v === "object" ? { ...DEFAULT_FUEL_TARGETS, ...v } : { ...DEFAULT_FUEL_TARGETS };
  } catch (e) { return { ...DEFAULT_FUEL_TARGETS }; }
}
function saveFuelTargets(t) { localStorage.setItem("forge.fuelTargets", JSON.stringify(t)); }

// ---- Server API (server mode only) ----
// Thin fetch wrapper — same-origin cookie session, JSON body when present.
async function apiCall(path, opts) {
  return fetch(path, {
    credentials: "same-origin",
    headers: opts?.body ? { "Content-Type": "application/json" } : undefined,
    ...opts,
  });
}
// Postgres date/timestamp columns arrive JSON-serialized as full ISO strings
// (e.g. "2026-09-02T00:00:00.000Z") — reduce to the "YYYY-MM-DD" key the rest
// of the app already keys on.
function dayKey(v) {
  return typeof v === "string" ? v.slice(0, 10) : iso(new Date(v));
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
// Server-mode readiness trend: today + prior days from real checkin rows only
// (no mock SCHEDULE fallback — that stays prototype-only per the ask).
function readinessSeriesForServer(checkinsMap, todayScore) {
  const todayIso = iso(TODAY);
  const series = [];
  for (let o = -9; o <= 0; o++) {
    const d = new Date(TODAY.getTime() + o * DAY_MS);
    const k = iso(d);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    if (k === todayIso) series.push({ d: label, v: todayScore, today: true });
    else if (checkinsMap[k]) series.push({ d: label, v: checkinsMap[k].score });
  }
  return series;
}

// Server-mode assignment -> engine shape. exercise_key IS the EX_LIB name
// string (no separate key field) -- fall back gracefully when a key has no
// EX_LIB match (custom/typo'd keys still render, just without cues/video).
const FALLBACK_CUE = "Stay tight and control the tempo.";
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

const PROGRAMS = [
  { name: "40 Day Fitness",             meta: "40 days · 5 sessions/week",                     blurb: "Kyle's total-body reset. Show up, follow the day, get strong.", free: true },
  { name: "Runner's Workout",           meta: "8 weeks · 4 runs + 2 lifts/week",               blurb: "Engine work plus the lifting that keeps runners durable.", price: "$29" },
  { name: "Strength & Flexibility",     meta: "6 weeks · 3 lifts + 3 mobility days/week",      blurb: "Build strength without losing range of motion.", price: "$29" },
  { name: "Kettlebell Engine",          meta: "4 weeks · 3 sessions/week",                     blurb: "One bell, big conditioning. Swings, carries, complexes.", price: "$19" },
  { name: "One-on-One with Coach Kyle", meta: "Monthly · custom programming + weekly check-ins", blurb: "Direct line to Kyle. Your plan, adjusted every week.", price: "$149/mo" },
];

const P40_TEMPLATES = [
  { name: "Foundation Push", focus: "Chest · Shoulders · Triceps", exs: [
    ["Barbell Bench Press", "4 × 6–8"], ["Incline DB Press", "3 × 10"], ["Seated DB Shoulder Press", "3 × 8–10"],
    ["DB Lateral Raise", "3 × 12–15"], ["Triceps Pushdown", "3 × 12"], ["Push-Up Finisher", "1 × AMRAP"]] },
  { name: "Foundation Pull", focus: "Back · Biceps", exs: [
    ["Deadlift", "4 × 5"], ["Lat Pulldown", "3 × 10"], ["Barbell Row", "3 × 8"],
    ["Face Pull", "3 × 15"], ["Hammer Curl", "3 × 12"]] },
  { name: "Foundation Legs", focus: "Quads · Glutes · Hamstrings", exs: [
    ["Back Squat", "4 × 6–8"], ["Romanian Deadlift", "3 × 8–10"], ["Walking Lunge", "3 × 12"],
    ["Leg Extension", "3 × 12–15"], ["Standing Calf Raise", "4 × 15"]] },
  { name: "Full Body Strength", focus: "Total body", exs: [
    ["Front Squat", "4 × 6"], ["Overhead Press", "4 × 6–8"], ["Chest-Supported Row", "3 × 10"],
    ["Barbell Hip Thrust", "3 × 8–10"], ["Plank Hold", "3 × 45s"]] },
  { name: "Engine & Core", focus: "Conditioning · Core", exs: [
    ["Kettlebell Swing", "5 × 15"], ["Goblet Squat", "3 × 12"], ["Farmer's Carry", "4 × 40yd"],
    ["Cable Crunch", "3 × 15"], ["Rowing Sprint", "6 × 250m"]] },
];
const PROGRAM_40 = Array.from({ length: 40 }, (_, i) => {
  const day = i + 1, wd = i % 7;               // wd 3 and 6 are rest days → 5 sessions/week
  if (wd === 3 || wd === 6) return { day, rest: true };
  const workoutIndex = i - Math.floor(i / 7) * 2 - (wd > 3 ? 1 : 0); // count of workout days before this one
  return { day, ...P40_TEMPLATES[workoutIndex % 5] };
});

// ---- App ----
export default function Forge() {
  const [screen, setScreen] = useState(SERVER_MODE ? "boot" : "login");
  // ---- Server mode: auth + hydration state (unused, harmless, in prototype mode) ----
  const [authStage, setAuthStage] = useState("email"); // "email" | "sent"
  const [authEmail, setAuthEmail] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authExpired, setAuthExpired] = useState(false);
  const [writeError, setWriteError] = useState("");
  const [serverCheckins, setServerCheckins] = useState({}); // { "<iso>": {score, answers} }
  const [serverUser, setServerUser] = useState(null); // bootstrap `user` row (server mode)
  const [serverAssignments, setServerAssignments] = useState([]); // bootstrap `assignments`
  const firstName = (SERVER_MODE && serverUser?.name ? serverUser.name : "Alex").split(" ")[0];
  // Athlete-side assignment lookup + engine data (server mode only; prototype
  // mode never populates serverAssignments, so activeWorkout === the mock).
  const assignmentForDay = (dayIso) =>
    serverAssignments.find((a) => dayKey(a.scheduled_for) === dayIso && a.status !== "skipped") || null;
  const todayAssignment = SERVER_MODE ? assignmentForDay(iso(TODAY)) : null;
  const activeWorkout = useMemo(
    () => (SERVER_MODE && todayAssignment ? activeWorkoutFromAssignment(todayAssignment.workout) : workout),
    [todayAssignment]
  );
  // ---- Console (admin, server mode) ----
  const [consoleScreen, setConsoleScreen] = useState("roster"); // "roster" | "dashboard" | "builder"
  const [roster, setRoster] = useState([]);
  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterError, setRosterError] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [overview, setOverview] = useState(null);
  const [overviewBusy, setOverviewBusy] = useState(false);
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
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [foodUnavailable, setFoodUnavailable] = useState(false);
  const [device, setDevice] = useState(() => localStorage.getItem("forge.device") || "");
  const [pickingDevice, setPickingDevice] = useState(false);
  const [survey, setSurvey] = useState({});
  const [checkStep, setCheckStep] = useState(0);
  const [readyToday, setReadyToday] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(`forge.readiness.${iso(TODAY)}`));
      return s?.score ?? READINESS_TODAY;
    } catch { return READINESS_TODAY; }
  });
  const readinessSeries = useMemo(
    () => (SERVER_MODE ? readinessSeriesForServer(serverCheckins, readyToday) : readinessSeriesFor(readyToday)),
    [readyToday, serverCheckins]
  );
  const recentAvg = recentAvgFor(readinessSeries);
  const [tab, setTab] = useState("today");
  const [selDay, setSelDay] = useState(iso(TODAY));
  const [active, setActive] = useState(null);        // { i, done }
  const [grid, setGrid] = useState({});              // { [exIndex]: [{reps, w, done}] }
  const [videoOpen, setVideoOpen] = useState(false);
  const [log, setLog] = useState([]);                // [{i, w, reps}]
  const [rest, setRest] = useState(null);            // seconds or null
  const [summary, setSummary] = useState(null);      // {sets, volume, minutes}
  const [doneToday, setDoneToday] = useState(false);
  const [showReadiness, setShowReadiness] = useState(false);
  const [program40Open, setProgram40Open] = useState(false);
  const [p40Day, setP40Day] = useState(null);   // expanded day number or null
  const [rpe, setRpe] = useState(null);
  const [line, setLine] = useState(null);
  const [exDetail, setExDetail] = useState(null);    // exercise name or null
  const [exTab, setExTab] = useState("history");
  const [libQ, setLibQ] = useState("");
  const [libEq, setLibEq] = useState("All");
  const [maxes, setMaxes] = useState({});
  const [removed, setRemoved] = useState({});   // {`${iso}:${letter}`: true} — deleted log rows            // name -> working max lb
  const [comments, setComments] = useState([]); // { text, ref, time }, ref: { name, date } | null
  const [commentRef, setCommentRef] = useState(null);
  const [draft, setDraft] = useState("");
  const [voiceOn, setVoiceOn] = useState(true);
  const [talking, setTalking] = useState(false);
  const [coach, setCoach] = useState(() => {
    const s = localStorage.getItem("forge.coach");
    return s && s !== "Mike Torres" ? s : "Kyle";
  });
  const [showSettings, setShowSettings] = useState(false);
  const coachName = coach.trim() || "Kyle";
  const coachFirst = coachName.split(/\s+/)[0];
  const coachInitial = coachFirst[0].toUpperCase();
  const [voiceStatus, setVoiceStatus] = useState(null);
  const audioRef = useRef(null);
  const ttsCache = useRef({});
  const [devs, setDevs] = useState([
    { name: "Apple Watch", detail: "Heart rate · Workouts", on: true, icon: Watch },
    { name: "Whoop 5.0", detail: "Recovery · Strain · Sleep", on: true, icon: Activity },
    { name: "Garmin", detail: "via Health Connect", on: false, icon: Watch },
    { name: "Oura Ring", detail: "Sleep · HRV", on: false, icon: Moon },
    { name: "Fitbit", detail: "Steps · Heart rate", on: false, icon: Activity },
  ]);
  const [fuelLog, setFuelLog] = useState(loadFuelLog);
  const [fuelTargets, setFuelTargets] = useState(loadFuelTargets);
  const [fuelDay, setFuelDay] = useState(iso(TODAY));
  const [foodQ, setFoodQ] = useState("");
  const [foodResults, setFoodResults] = useState(null);
  const [foodBusy, setFoodBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ name: "", kcal: "", protein: "", carbs: "", fat: "" });
  const [bodyweight, setBodyweight] = useState(() => {
    const v = parseInt(localStorage.getItem("forge.bodyweight"), 10);
    return Number.isFinite(v) ? v : 180;
  });
  const [fuelGoal, setFuelGoal] = useState("maintain"); // cut | maintain | build
  const fuelIdRef = useRef(null);
  if (fuelIdRef.current === null) {
    const allFuel = Object.values(fuelLog).flat();
    fuelIdRef.current = allFuel.reduce((m, e) => Math.max(m, e.id || 0), 0) + 1;
  }
  const idx = useRef(0);
  const startedAt = useRef(null);

  const stopAudio = () => {
    if (audioRef.current) { try { audioRef.current.pause(); } catch (e) {} audioRef.current = null; }
    setTalking(false);
  };
  const speak = async (text) => {
    setLine(text);
    if (!voiceOn) return;
    stopAudio();
    const spoken = speechify(text);
    const vid = KYLE_VOICE;
    try {
      const cacheKey = vid + "|" + spoken;
      let url = ttsCache.current[cacheKey];
      if (!url) {
        const res = await fetch(TTS_ENDPOINT, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: spoken, voice_id: vid }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        url = URL.createObjectURL(await res.blob());
        ttsCache.current[cacheKey] = url;
      }
      const a = new Audio(url);
      audioRef.current = a;
      a.onplay = () => setTalking(true);
      a.onended = () => setTalking(false);
      a.onerror = () => setTalking(false);
      await a.play();
      setVoiceStatus("ok");
    } catch (e) { setVoiceStatus("fail"); setTalking(false); }
  };
  useEffect(() => () => stopAudio(), []);

  // ---- Server mode: sign-in state + bootstrap hydration ----
  const goSignedOut = () => {
    setScreen("login");
    setAuthStage("email");
  };
  const hydrateFromBootstrap = (data) => {
    const profile = data.profile || {};
    if (data.user) setServerUser(data.user);
    if (data.user?.role === "admin") {
      // Kyle doesn't train here -- land in the console instead of the
      // athlete tabs; skip survey/import entirely.
      setConsoleScreen("roster");
      setSelectedUserId(null);
      setOverview(null);
      setScreen("console");
      return;
    }
    setServerAssignments(data.assignments || []);
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
    setReadyToday(todayEntry ? todayEntry.score : READINESS_TODAY);

    const hasAnyData = (data.checkins || []).length > 0 || (data.fuel || []).length > 0;
    if (!hasAnyData && localStorage.getItem("forge.importDismissed") !== "1") {
      setScreen("import");
    } else if (todayEntry) {
      setScreen("app");
    } else {
      setScreen("survey");
    }
  };
  const refetchBootstrap = async () => {
    const res = await apiCall("/api/bootstrap");
    if (res.status === 401) return goSignedOut();
    if (!res.ok) { setWriteError("Couldn't refresh your data — try again."); return; }
    hydrateFromBootstrap(await res.json());
  };
  useEffect(() => {
    if (!SERVER_MODE) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "expired") {
      setAuthExpired(true);
      params.delete("auth");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
    (async () => {
      try {
        const meRes = await apiCall("/api/auth/me");
        if (meRes.status !== 200) { setScreen("login"); return; }
        const bRes = await apiCall("/api/bootstrap");
        if (bRes.status === 401 || !bRes.ok) { setScreen("login"); return; }
        hydrateFromBootstrap(await bRes.json());
      } catch {
        setScreen("login");
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

  // ---- Console (admin, server mode): data fetching ----
  useEffect(() => {
    if (!SERVER_MODE || screen !== "console" || consoleScreen !== "roster") return;
    let cancelled = false;
    (async () => {
      setRosterBusy(true); setRosterError("");
      try {
        const res = await apiCall("/api/admin/users");
        if (cancelled) return;
        if (res.status === 401) { setRosterBusy(false); return goSignedOut(); }
        if (!res.ok) { setRosterError("Couldn't load the roster — try again."); setRosterBusy(false); return; }
        const rows = await res.json();
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
    if (!SERVER_MODE || screen !== "console" || consoleScreen !== "dashboard" || !selectedUserId) return;
    let cancelled = false;
    (async () => {
      setOverviewBusy(true);
      try {
        const res = await apiCall(`/api/admin/users/${selectedUserId}/overview`);
        if (cancelled) return;
        if (res.status === 401) { setOverviewBusy(false); return goSignedOut(); }
        if (!res.ok) { setOverviewBusy(false); return; }
        setOverview(await res.json());
        setOverviewBusy(false);
      } catch {
        if (!cancelled) setOverviewBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [screen, consoleScreen, selectedUserId]); // eslint-disable-line

  useEffect(() => {
    if (!SERVER_MODE || screen !== "console" || consoleScreen !== "builder") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiCall("/api/admin/workouts");
        if (cancelled) return;
        if (res.status === 401) return goSignedOut();
        if (res.ok) setExistingWorkouts(await res.json());
      } catch {}
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
        const wRes = await apiCall("/api/admin/workouts", {
          method: "POST",
          body: JSON.stringify({ title: builderTitle.trim(), blocks }),
        });
        if (wRes.status === 401) return goSignedOut();
        if (!wRes.ok) { setBuilderError("Couldn't save the workout — check the exercises and try again."); setBuilderBusy(false); return; }
        const w = await wRes.json();
        workoutId = w.id;
      }
      if (!workoutId) { setBuilderError("Pick a workout first."); setBuilderBusy(false); return; }

      const aRes = await apiCall("/api/admin/assignments", {
        method: "POST",
        body: JSON.stringify({ user_id: selectedUserId, workout_id: workoutId, scheduled_for: builderDate }),
      });
      if (aRes.status === 401) return goSignedOut();
      if (aRes.status === 409) { setBuilderError("Already assigned that day."); setBuilderBusy(false); return; }
      if (!aRes.ok) { setBuilderError("Couldn't create the assignment — try again."); setBuilderBusy(false); return; }

      setBuilderBusy(false);
      const oRes = await apiCall(`/api/admin/users/${selectedUserId}/overview`);
      if (oRes.ok) setOverview(await oRes.json());
      setConsoleScreen("dashboard");
    } catch {
      setBuilderError("Something went wrong — try again.");
      setBuilderBusy(false);
    }
  };

  const openReadiness = () => {
    setShowReadiness(true);
    speak(`Readiness ${readyToday}. ${recentAvg >= longAvg ? "Trending above your baseline — green light to push." : "A touch under baseline — keep the top sets honest."}`);
  };

  const openExercise = (name) => { setExDetail(name); setExTab("history"); };

  const submitComment = () => {
    if (!draft.trim()) return;
    setComments([...comments, { text: draft.trim(), ref: commentRef, time: "Just now" }]);
    setDraft("");
    setCommentRef(null);
  };

  const applyFuelAdd = (day, item) => {
    setFuelLog((cur) => {
      const prevRows = cur[day] ?? [];
      const dayLog = [...prevRows, item];
      const next = { ...cur, [day]: dayLog };
      if (!SERVER_MODE) saveFuelLog(next);

      const prevProtein = prevRows.reduce((s, e) => s + (e.protein || 0), 0);
      const newProtein = dayLog.reduce((s, e) => s + (e.protein || 0), 0);
      if (day === iso(TODAY) && prevProtein < fuelTargets.protein && newProtein >= fuelTargets.protein) {
        if (localStorage.getItem("forge.proteinSpokeDay") !== day) {
          localStorage.setItem("forge.proteinSpokeDay", day);
          speak(`Protein target hit — ${fuelTargets.protein} grams down. That's how you build.`);
        }
      }
      return next;
    });
  };
  const addFuel = async (entry) => {
    const day = fuelDay;
    if (SERVER_MODE) {
      const res = await apiCall("/api/fuel-logs", {
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
      const row = await res.json();
      applyFuelAdd(day, { id: row.id, name: row.name, kcal: row.calories ?? 0, protein: row.protein_g ?? 0, carbs: row.carbs_g ?? 0, fat: row.fat_g ?? 0 });
      setWriteError("");
      return;
    }
    applyFuelAdd(day, {
      id: fuelIdRef.current++, name: entry.name, brand: entry.brand,
      kcal: entry.kcal || 0, protein: entry.protein || 0, carbs: entry.carbs || 0, fat: entry.fat || 0,
    });
  };
  const deleteFuel = async (id) => {
    const day = fuelDay;
    if (SERVER_MODE) {
      const res = await apiCall(`/api/fuel-logs/${id}`, { method: "DELETE" });
      if (res.status === 401) return goSignedOut();
      if (!res.ok) { setWriteError("Couldn't delete that entry — try again."); return; }
      setFuelLog((cur) => ({ ...cur, [day]: (cur[day] ?? []).filter((e) => e.id !== id) }));
      setWriteError("");
      return;
    }
    setFuelLog((cur) => {
      const next = { ...cur, [day]: (cur[day] ?? []).filter((e) => e.id !== id) };
      saveFuelLog(next);
      return next;
    });
  };
  const searchFood = async () => {
    const q = foodQ.trim();
    if (q.length < 2) return;
    setFoodBusy(true);
    setFoodUnavailable(false);
    try {
      const res = await fetch("/api/food?q=" + encodeURIComponent(q));
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
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
    if (!SERVER_MODE) {
      setBodyweight(v);
      localStorage.setItem("forge.bodyweight", String(v));
      return;
    }
    const res = await apiCall("/api/profile", { method: "PATCH", body: JSON.stringify({ bodyweight: v }) });
    if (res.status === 401) return goSignedOut();
    if (!res.ok) { setWriteError("Couldn't save bodyweight — try again."); return; }
    const profile = await res.json();
    setBodyweight(profile.bodyweight);
    setWriteError("");
  };
  const calcTargets = async () => {
    const kcalMult = { cut: 12, maintain: 14, build: 16 }[fuelGoal];
    const proteinMult = { cut: 1.0, maintain: 0.9, build: 0.85 }[fuelGoal];
    const next = {
      kcal: Math.round((bodyweight * kcalMult) / 10) * 10,
      protein: Math.round(Math.round(bodyweight * proteinMult) / 5) * 5,
    };
    if (!SERVER_MODE) {
      setFuelTargets(next);
      saveFuelTargets(next);
      return;
    }
    const res = await apiCall("/api/profile", { method: "PATCH", body: JSON.stringify({ fuelTargets: next }) });
    if (res.status === 401) return goSignedOut();
    if (!res.ok) { setWriteError("Couldn't save targets — try again."); return; }
    const profile = await res.json();
    setFuelTargets({ ...DEFAULT_FUEL_TARGETS, ...profile.fuelTargets });
    setWriteError("");
  };
  // Coach name is a live-typed field — reflect keystrokes immediately (matches
  // prototype's per-keystroke localStorage save) and persist async; on failure
  // show the inline note without fighting the user's typing.
  const changeCoach = async (v) => {
    setCoach(v);
    if (!SERVER_MODE) { localStorage.setItem("forge.coach", v); return; }
    const res = await apiCall("/api/profile", { method: "PATCH", body: JSON.stringify({ coach: v }) });
    if (res.status === 401) return goSignedOut();
    if (!res.ok) { setWriteError("Couldn't save coach name — try again."); return; }
    setWriteError("");
  };
  const exportData = () => {
    const checkins = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("forge.readiness.")) continue;
      try {
        const v = JSON.parse(localStorage.getItem(key));
        if (v && typeof v.score === "number" && v.answers) checkins[key.slice("forge.readiness.".length)] = { score: v.score, answers: v.answers };
      } catch {}
    }
    const payload = { checkins, fuelLog, bodyweight, fuelTargets, coach, device };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "workhart-export.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const handleSignOut = async () => {
    await apiCall("/api/auth/logout", { method: "POST" }).catch(() => {});
    setShowSettings(false);
    goSignedOut();
  };
  const skipImport = () => {
    localStorage.setItem("forge.importDismissed", "1");
    setScreen(serverCheckins[iso(TODAY)] ? "app" : "survey");
  };
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(""); setImportResult(null); setImportBusy(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await apiCall("/api/import", { method: "POST", body: JSON.stringify(json) });
      if (res.status === 401) { setImportBusy(false); return goSignedOut(); }
      if (res.status === 409) {
        setImportError("This account already has data.");
        setImportBusy(false);
        await refetchBootstrap();
        return;
      }
      if (!res.ok) { setImportError("Import failed — check the file and try again."); setImportBusy(false); return; }
      const data = await res.json();
      setImportResult(data.imported);
      setImportBusy(false);
      await refetchBootstrap();
    } catch {
      setImportError("Couldn't read that file.");
      setImportBusy(false);
    }
  };

  const start = () => {
    setTab("train");
    setLog([]); setSummary(null); setRest(null); setRpe(null); setGrid({});
    startedAt.current = Date.now();
    setActive({ i: 0, done: 0 });
    speak(`Welcome back, ${firstName}. Today is ${activeWorkout.name}. Warm up well — then we get after it.`);
  };

  const finish = async (finalLog) => {
    const mins = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    const volume = finalLog.reduce((s, l) => s + (l.w || 0) * l.reps, 0);
    setSummary({ sets: finalLog.length, volume, minutes: mins });
    setActive(null); setRest(null); setDoneToday(true);
    speak(`Workout complete. Outstanding session — Coach ${coachFirst} will see today's numbers tonight.`);

    if (SERVER_MODE) {
      const perExerciseCount = {};
      const sets = finalLog.map((l) => {
        const setNo = (perExerciseCount[l.i] = (perExerciseCount[l.i] || 0) + 1);
        const ex = activeWorkout.exercises[l.i];
        return { exercise_key: ex.name, set_no: setNo, reps: l.reps, weight_lbs: l.w };
      });
      try {
        const res = await apiCall("/api/workout-logs", {
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

  // ---- Boot (server mode: checking session before first paint) ----
  if (screen === "boot") {
    return (
      <div className="ff-b" style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{css}</style>
        <HartMark size={54} />
      </div>
    );
  }

  // ---- Login ----
  if (screen === "login") {
    if (SERVER_MODE) {
      const submitEmail = async () => {
        const email = authEmail.trim();
        if (!email) return;
        setAuthBusy(true);
        setAuthError("");
        try {
          const res = await apiCall("/api/auth/request-link", { method: "POST", body: JSON.stringify({ email }) });
          if (!res.ok) { setAuthError("Something went wrong — try again."); setAuthBusy(false); return; }
          setAuthStage("sent");
        } catch {
          setAuthError("Something went wrong — try again.");
        }
        setAuthBusy(false);
      };
      return (
        <div className="ff-b" style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <style>{css}</style>
          <div style={{ width: "100%", maxWidth: 380 }}>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <div style={{ margin: "0 auto 18px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <HartMark size={64} />
              </div>
              <img src="/brand/workhart_text_logo.png" alt="Workhart" style={{ width: "min(100%, 406px)", height: "auto", display: "block", margin: "0 auto" }} />
            </div>

            {authExpired && (
              <div style={{ color: C.energy, fontSize: 12.5, marginBottom: 16, textAlign: "center" }}>
                That link expired — request a new one.
              </div>
            )}

            {authStage === "email" ? (
              <>
                <input aria-label="Email" placeholder="Email" type="email" value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitEmail(); }}
                  style={inp} />
                {authError && <div style={{ color: C.energy, fontSize: 12, marginBottom: 10 }}>{authError}</div>}
                <button onClick={submitEmail} disabled={authBusy || !authEmail.trim()}
                  style={{ ...btnP, width: "100%", marginTop: 6, opacity: authBusy || !authEmail.trim() ? .5 : 1 }}>
                  {authBusy ? "Sending…" : "Email me a sign-in link"}
                </button>
              </>
            ) : (
              <>
                <div style={{ color: C.body, fontSize: 14.5, lineHeight: 1.6, textAlign: "center", padding: "8px 0" }}>
                  Check your email for a sign-in link.
                </div>
                <button onClick={() => { setAuthStage("email"); setAuthEmail(""); setAuthError(""); }}
                  style={{ ...btnG, width: "100%", marginTop: 14 }}>
                  Use a different email
                </button>
              </>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="ff-b" style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <style>{css}</style>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ margin: "0 auto 18px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <HartMark size={64} />
            </div>
            <img src="/brand/workhart_text_logo.png" alt="Workhart" style={{ width: "min(100%, 406px)", height: "auto", display: "block", margin: "0 auto" }} />
          </div>
          <input aria-label="Email" placeholder="Email" defaultValue="alex@email.com" style={inp} />
          <input aria-label="Password" placeholder="Password" type="password" defaultValue="••••••••" style={inp} />

          {device && !pickingDevice ? (
            <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: "12px 14px", marginBottom: 14, display: "flex", gap: 10, alignItems: "center" }}>
              <Watch size={16} color={C.recovery} />
              <span style={{ color: C.body, fontSize: 13, flex: 1 }}>{device === "No device" ? "No device connected" : `${device} connected`}</span>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: device === "No device" ? C.muted : C.recovery }} />
              <button onClick={() => setPickingDevice(true)} style={{ background: "none", border: "none", color: C.muted, fontSize: 12, textDecoration: "underline", padding: 0 }}>Change</button>
            </div>
          ) : (
            <select
              aria-label="Fitness device"
              value={device}
              onChange={(e) => { const v = e.target.value; localStorage.setItem("forge.device", v); setDevice(v); setPickingDevice(false); }}
              style={{ ...inp, color: device ? C.text : C.muted }}
            >
              <option value="" disabled>Connect your fitness device…</option>
              <option value="Samsung Galaxy Watch">Samsung Galaxy Watch</option>
              <option value="Apple Watch">Apple Watch</option>
              <option value="Garmin">Garmin</option>
              <option value="Whoop">Whoop</option>
              <option value="Fitbit">Fitbit</option>
              <option value="Oura Ring">Oura Ring</option>
              <option value="Polar">Polar</option>
              <option value="No device">No device</option>
            </select>
          )}

          <button onClick={() => { const todayKey = `forge.readiness.${iso(TODAY)}`; setScreen(localStorage.getItem(todayKey) ? "app" : "survey"); }} style={{ ...btnP, width: "100%", marginTop: 6 }}>Sign in</button>
        </div>
      </div>
    );
  }

  // ---- Import (server mode: fresh account, no data yet) ----
  if (screen === "import") {
    return (
      <div className="ff-b" style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <style>{css}</style>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <HartMark size={54} />
            </div>
            <div className="ff-d" style={{ fontSize: 26, fontWeight: 700, color: C.text, textTransform: "uppercase" }}>Import your data</div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
              Bring over check-ins and fuel logs from a WORKHART export file.
            </div>
          </div>
          <Card>
            <input aria-label="Import file" type="file" accept="application/json" onChange={handleImportFile} disabled={importBusy}
              style={{ color: C.body, fontSize: 13, width: "100%" }} />
            {importBusy && <div style={{ color: C.muted, fontSize: 12, marginTop: 10 }}>Importing…</div>}
            {importError && <div style={{ color: C.energy, fontSize: 12, marginTop: 10 }}>{importError}</div>}
            {importResult && (
              <div style={{ color: C.body, fontSize: 13, marginTop: 10 }}>
                Imported {importResult.checkins} check-in{importResult.checkins === 1 ? "" : "s"}, {importResult.fuel} fuel entr{importResult.fuel === 1 ? "y" : "ies"}
                {importResult.skipped ? `, skipped ${importResult.skipped}` : ""}.
              </div>
            )}
          </Card>
          <button onClick={skipImport} style={{ ...btnG, width: "100%", marginTop: 14 }}>Skip — start fresh</button>
        </div>
      </div>
    );
  }

  // ---- Morning check-in ----
  if (screen === "survey") {
    const finishSurvey = async (finalAnswers) => {
      const sum = Object.values(finalAnswers).reduce((s, v) => s + v, 0);
      const score = Math.round((sum / 21) * 100);
      if (SERVER_MODE) {
        const res = await apiCall("/api/checkins", {
          method: "POST",
          body: JSON.stringify({ day: iso(TODAY), score, answers: finalAnswers }),
        });
        if (res.status === 401) return goSignedOut();
        if (!res.ok) { setWriteError("Couldn't save your check-in — try again."); return; }
        const row = await res.json();
        setServerCheckins((cur) => ({ ...cur, [iso(TODAY)]: { score: row.score, answers: row.answers } }));
        setReadyToday(row.score);
        setScreen("app");
        speak(`Readiness logged at ${row.score}. ${row.score >= 75 ? "Green light — we push today." : row.score >= 55 ? "Solid enough. We work smart today." : "Running low — we keep it tight and honest today."}`);
        return;
      }
      const todayKey = `forge.readiness.${iso(TODAY)}`;
      localStorage.setItem(todayKey, JSON.stringify({ score, answers: finalAnswers }));
      setReadyToday(score);
      setScreen("app");
      speak(`Readiness logged at ${score}. ${score >= 75 ? "Green light — we push today." : score >= 55 ? "Solid enough. We work smart today." : "Running low — we keep it tight and honest today."}`);
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
              <HartMark size={30} />
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

                      <button onClick={openBuilder} style={{ ...btnP, width: "100%", marginTop: 16 }}>Assign a workout</button>
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
          </div>
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
            <HartMark size={30} />
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

        {writeError && (
          <div style={{ color: C.energy, fontSize: 11.5, padding: "0 20px", marginTop: 4 }}>{writeError}</div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 104px" }}>

          {/* TODAY */}
          {tab === "today" && (() => {
            const todayIso = iso(TODAY);
            const isToday = selDay === todayIso;
            const selDate = new Date(selDay + "T00:00:00");

            if (SERVER_MODE) {
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
                      <h1 className="ff-d" style={{ fontSize: 36, fontWeight: 700, color: C.text, lineHeight: 1.02, margin: "2px 0 0", textTransform: "uppercase" }}>Morning, {firstName}</h1>

                      <Card role="button" tabIndex={0} aria-expanded={showReadiness} onClick={openReadiness}
                        onKeyDown={(e) => { if (e.key === "Enter") openReadiness(); }}
                        style={{ marginTop: 18, display: "flex", gap: 16, alignItems: "center", width: "100%", textAlign: "left" }}>
                        <Ring score={readyToday} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: C.text, fontSize: 15, fontWeight: 600 }}>Ready to push</div>
                          <div style={{ color: C.body, fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
                            Check-in logged this morning.
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
            }

            const entry = SCHEDULE[selDay];
            return (
              <div>
                <CalendarStrip selected={selDay} onSelect={setSelDay} doneToday={doneToday} />
                <div style={{ color: C.muted, fontSize: 13, marginTop: 14 }}>{fmtLong(selDate)}</div>

                {isToday && (
                  <>
                    <h1 className="ff-d" style={{ fontSize: 36, fontWeight: 700, color: C.text, lineHeight: 1.02, margin: "2px 0 0", textTransform: "uppercase" }}>Morning, {firstName}</h1>

                    <Card role="button" tabIndex={0} aria-expanded={showReadiness} onClick={openReadiness}
                      onKeyDown={(e) => { if (e.key === "Enter") openReadiness(); }}
                      style={{ marginTop: 18, display: "flex", gap: 16, alignItems: "center", width: "100%", textAlign: "left" }}>
                      <Ring score={readyToday} />
                      <div style={{ flex: 1, minWidth: 0 }}>
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

                    <Label>From Coach {coachFirst}</Label>
                    <Card>
                      <div style={{ display: "flex", gap: 12 }}>
                        <div style={ava}>{coachInitial}</div>
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
                      <div style={{ color: C.muted, fontSize: 11.5, marginTop: 14 }}>Logged · synced to Coach {coachFirst}</div>
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
                      <div style={{ color: C.muted, fontSize: 11.5, marginTop: 7 }}>Unlocks on the day — Coach {coachFirst} may still adjust the plan.</div>
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
            const last = SERVER_MODE ? null : lastFor(ex.name);
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
                  {last && (
                    <button onClick={() => openExercise(ex.name)} style={chipStyle}>
                      <span style={{ color: C.muted }}>Last </span>{last}
                    </button>
                  )}
                  <button onClick={() => openExercise(ex.name)} style={chipStyle}>
                    <span style={{ color: C.muted }}>PR </span>{exHistory(ex.name).pr.label}
                  </button>
                  {!bw && (
                    <button onClick={() => openExercise(ex.name)} style={chipStyle}>
                      <span style={{ color: C.muted }}>Max </span>{maxes[ex.name] ?? exHistory(ex.name).baseMax} lb
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
                  const csv = buildHistoryCsv(log, doneToday);
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
                    <HartMark size={90} />
                  </div>
                  <div style={{ position: "absolute", top: 10, left: 10, fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase",
                    color: C.muted, background: "rgba(0,0,0,.35)", padding: "4px 8px", borderRadius: 6 }}>WEEKLY MESSAGE</div>
                  <div style={{ width: 54, height: 54, borderRadius: "50%", background: C.energy, display: "flex", alignItems: "center",
                    justifyContent: "center", boxShadow: "0 6px 18px rgba(41,171,226,.4)", position: "relative" }}>
                    <Play size={22} color="#fff" fill="currentColor" />
                  </div>
                </div>
                <div style={{ padding: "12px 16px" }}>
                  <div style={{ color: C.text, fontSize: 14.5, fontWeight: 600 }}>A word from Coach Kyle</div>
                  <div style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>This week's focus · 2:14</div>
                </div>
              </Card>

              <Label>Programs</Label>
              <Card style={{ padding: 0 }}>
                {PROGRAMS.map((p, i) => (
                  <div key={i}
                    role={p.free ? "button" : undefined}
                    tabIndex={p.free ? 0 : undefined}
                    aria-disabled={p.free ? undefined : "true"}
                    aria-expanded={p.free ? program40Open : undefined}
                    onClick={p.free ? () => setProgram40Open(true) : undefined}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                      borderBottom: i < PROGRAMS.length - 1 ? `1px solid ${C.line}` : "none" }}>
                    <div style={{ flex: 1, opacity: p.free ? 1 : .55 }}>
                      <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                      <div style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>{p.meta}</div>
                      <div style={{ color: C.body, fontSize: 12, marginTop: 4, lineHeight: 1.45 }}>{p.blurb}</div>
                    </div>
                    {p.free ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <Pill tone="recovery">Included</Pill>
                        <ChevronRight size={16} color={C.muted} />
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <div style={{ color: C.muted, fontSize: 11.5, fontWeight: 600 }}>{p.price}</div>
                        <Lock size={15} color={C.muted} />
                      </div>
                    )}
                  </div>
                ))}
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
                    <div style={{ color: C.muted, fontSize: 11.5, marginTop: 4 }}>{c.time} · seen by Coach {coachFirst}</div>
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

        {/* Nav */}
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
              <div style={ava}>{coachInitial}</div>
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

            <div style={{ color: C.muted, fontSize: 11.5, marginTop: 12 }}>Synced from Whoop &amp; Apple Watch · visible to Coach {coachFirst}</div>
          </Sheet>
        )}

        {program40Open && (
          <Sheet title="40 Day Fitness" onClose={() => { setProgram40Open(false); setP40Day(null); }}>
            <div style={{ color: C.muted, fontSize: 12.5, marginTop: 8 }}>40 days · 5 sessions a week · Coach Kyle</div>
            {Array.from({ length: 6 }, (_, w) => w).map((w) => {
              const weekDays = PROGRAM_40.slice(w * 7, w * 7 + 7);
              return (
                <div key={w}>
                  <Label>Week {w + 1}</Label>
                  <Card style={{ padding: 0 }}>
                    {weekDays.map((d, i) => {
                      const isOpen = p40Day === d.day;
                      return (
                        <div key={d.day} style={{ borderBottom: i < weekDays.length - 1 ? `1px solid ${C.line}` : "none" }}>
                          <div
                            role={d.rest ? undefined : "button"}
                            tabIndex={d.rest ? undefined : 0}
                            onClick={d.rest ? undefined : () => setP40Day(isOpen ? null : d.day)}
                            style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: d.rest ? "default" : "pointer" }}>
                            <div className="ff-d" style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".06em", color: d.rest ? C.muted : C.energy, width: 56, flexShrink: 0 }}>
                              DAY {d.day}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {d.rest ? (
                                <>
                                  <div style={{ color: C.muted, fontSize: 14 }}>Rest</div>
                                  <div style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>Recover. Walk, stretch, sleep.</div>
                                </>
                              ) : (
                                <>
                                  <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{d.name}</div>
                                  <div style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>{d.focus}</div>
                                </>
                              )}
                            </div>
                            {!d.rest && (
                              <ChevronDown size={16} color={C.muted} style={{ transform: isOpen ? "none" : "rotate(-90deg)", flexShrink: 0, transition: "transform .15s" }} />
                            )}
                          </div>
                          {!d.rest && isOpen && (
                            <div style={{ padding: "0 16px 14px" }}>
                              {d.exs.map(([name, target]) => (
                                <div key={name} role="button" tabIndex={0}
                                  onClick={() => openExercise(name)}
                                  onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") openExercise(name); }}
                                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", cursor: "pointer" }}>
                                  <img src={`https://i.ytimg.com/vi/${VIDEO_IDS[name]}/mqdefault.jpg`} alt="" width={44} height={26}
                                    style={{ borderRadius: 6, objectFit: "cover", flexShrink: 0, background: C.surface2 }} />
                                  <div style={{ color: C.text, fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0 }}>{name}</div>
                                  <div style={{ color: C.muted, fontSize: 11.5, whiteSpace: "nowrap" }}>{target}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </Card>
                </div>
              );
            })}
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

              {!SERVER_MODE && (
                <button onClick={exportData} style={{ ...btnG, width: "100%", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <Download size={16} /> Export my data
                </button>
              )}
              {SERVER_MODE && (
                <button onClick={handleSignOut} style={{ ...btnG, width: "100%", marginTop: 16 }}>Sign out</button>
              )}
            </div>
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
