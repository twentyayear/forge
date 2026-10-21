// PURE FUEL HELPERS: NO REACT, NO NETWORK, NO CLOCK.

// eaten_on ARRIVES AS A FULL TIMESTAMP STRING; ONLY THE FIRST TEN CHARACTERS ARE THE DAY.
export const withinDay = (eatenOn, day) => typeof eatenOn === "string" && eatenOn.slice(0, 10) === day;

// SUMS ONLY THE ROWS OF day; A NULL MACRO COUNTS AS 0 AND count IS THE NUMBER OF ROWS.
export function dayTotals(rows, day) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, count: 0 };
  for (const r of rows || []) {
    if (!withinDay(r.eaten_on, day)) continue;
    t.kcal += Number(r.calories) || 0;
    t.protein += Number(r.protein_g) || 0;
    t.carbs += Number(r.carbs_g) || 0;
    t.fat += Number(r.fat_g) || 0;
    t.count += 1;
  }
  return t;
}

// PROTEIN GRAMS PER DAY: 0.8 TO 1.0 x BODYWEIGHT IN LB; null WHEN THERE IS NO USABLE BODYWEIGHT.
export function proteinRange(bw) {
  const n = Number(bw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return [Math.round(n * 0.8), Math.round(n)];
}

export const fmtKcal = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");

// THE FOOD ROUTE SENDS {name, brand, unit, kcal, protein, carbs, fat}; THE ASK DESCRIBES {calories, protein_g, ...}. BOTH SHAPES ARE ACCEPTED, ROUNDED TO WHOLE NUMBERS.
export function normalizeFood(hit) {
  if (!hit || typeof hit.name !== "string" || !hit.name) return null;
  const num = (...vals) => { for (const v of vals) if (v != null && Number.isFinite(Number(v))) return Math.round(Number(v)); return 0; };
  return {
    name: hit.name,
    brand: hit.brand || "",
    kcal: num(hit.kcal, hit.calories),
    protein: num(hit.protein, hit.protein_g),
    carbs: num(hit.carbs, hit.carbs_g),
    fat: num(hit.fat, hit.fat_g),
    raw: hit.raw ?? null,
  };
}

// THE LAST seven DAYS ENDING AT today, OLDEST FIRST; BUILT FROM Y/M/D PARTS SO A DST WEEK KEEPS SEVEN DISTINCT DAYS.
export function lastDays(today, n = 7) {
  const [y, m, d] = today.split("-").map(Number);
  const pad = (v) => String(v).padStart(2, "0");
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(y, m - 1, d - (n - 1 - i));
    return { date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`, weekday: ["S", "M", "T", "W", "T", "F", "S"][dt.getDay()], dom: dt.getDate(), long: dt.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) };
  });
}
