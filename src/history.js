// Pure helpers that turn the athlete's real server data into the shapes the
// UI used to get from prototype mocks. No React, no DOM.

const csvField = (v) => {
  const s = String(v);
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const wOf = (s) => Number(s.weight_lbs) || 0;
const round5 = (n) => Math.round(n / 5) * 5;
const epley = (w, reps) => w * (1 + reps / 30);
const sortedLogs = (logs) =>
  [...(logs || [])].sort((a, b) => new Date(a.performed_at) - new Date(b.performed_at));
const pad = (n) => String(n).padStart(2, "0");

export function realHistory(name, logs) {
  const hits = [];
  for (const log of sortedLogs(logs)) {
    for (const s of log.sets || []) {
      if (s.exercise_key === name) hits.push({ log, s });
    }
  }
  if (!hits.length) return null;
  const fmt = (log) =>
    new Date(log.performed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (hits.every(({ s }) => wOf(s) === 0)) {
    let best = hits[0];
    for (const h of hits) if ((Number(h.s.reps) || 0) > (Number(best.s.reps) || 0)) best = h;
    return { pr: { label: `${Number(best.s.reps) || 0} reps`, date: fmt(best.log) }, baseMax: null, series: [] };
  }

  // hits are in chronological order, so strict comparisons keep the earliest on a full tie.
  let pr = null;
  for (const h of hits) {
    const w = wOf(h.s);
    const reps = Number(h.s.reps) || 0;
    if (!pr || w > pr.w || (w === pr.w && reps > pr.reps)) pr = { w, reps, log: h.log };
  }
  let bestEst = 0;
  const series = [];
  const seen = new Set();
  for (const { log } of hits) {
    if (seen.has(log)) continue;
    seen.add(log);
    let logBest = 0;
    for (const s of log.sets) {
      if (s.exercise_key !== name) continue;
      const w = wOf(s);
      if (w > 0) logBest = Math.max(logBest, epley(w, Number(s.reps) || 0));
    }
    bestEst = Math.max(bestEst, logBest);
    if (logBest > 0) {
      const d = new Date(log.performed_at);
      series.push({ wk: `${d.getMonth() + 1}/${d.getDate()}`, lb: round5(logBest) });
    }
  }
  return {
    pr: { label: `${pr.w} lb × ${pr.reps}`, date: fmt(pr.log) },
    baseMax: round5(bestEst),
    series: series.slice(-8),
  };
}

export function averageScore(checkinMap) {
  const vals = Object.values(checkinMap || {}).map((c) => c.score).filter((v) => Number.isFinite(v));
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export function buildServerHistoryCsv(logs, assignments) {
  const rows = [["date", "session", "block", "exercise", "set", "reps", "weight_lb", "volume_lb"]];
  for (const log of sortedLogs(logs)) {
    const d = new Date(log.performed_at);
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const a = (assignments || []).find((x) => x.id === log.assignment_id);
    const session = a?.workout?.title || "Workout";
    const order = [];
    const sets = [...(log.sets || [])].sort((x, y) => x.set_no - y.set_no);
    // block letter = order of first appearance within the log (in set_no order)
    for (const s of sets) if (!order.includes(s.exercise_key)) order.push(s.exercise_key);
    for (const s of sets) {
      const w = wOf(s);
      const reps = Number(s.reps) || 0;
      rows.push([date, session, "ABCDEFGHIJ"[order.indexOf(s.exercise_key)] ?? "", s.exercise_key, s.set_no, reps, w, reps * w]);
    }
  }
  return rows.map((r) => r.map(csvField).join(",")).join("\n");
}
