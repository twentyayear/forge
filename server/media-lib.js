// server/media-lib.js — pure helpers shared by server/media.js and its tests.
// No fetch calls live here on purpose: keeping the transform/mapper pure lets
// tests exercise the exact logic the routes use with no live upstream calls.

// Verbatim port of netlify/functions/tts.mjs's sentence-boundary transform:
// a real pause at each sentence boundary — models rush periods on their own.
export function addSentenceBreaks(text) {
  return text.replace(/([.!?])\s+/g, '$1 <break time="0.6s" /> ');
}

// Coerce to a finite number, round to 1 decimal (mirrors netlify/functions/food.mjs's n()).
function n(x) {
  const v = typeof x === "string" ? parseFloat(x) : x;
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : 0;
}

// Verbatim port of netlify/functions/food.mjs's per-hit mapping: prefer
// per-serving values, fall back to per-100g; brands may be an array (join
// with ", "); drop nameless hits and hits with all-zero macros.
export function mapOffHit(p) {
  const name = p.product_name;
  if (!name) return null;
  const nut = p.nutriments ?? {};
  const hasServing = nut["energy-kcal_serving"] !== undefined || nut["proteins_serving"] !== undefined;
  const suffix = hasServing ? "_serving" : "_100g";
  const kcal = n(nut[`energy-kcal${suffix}`]);
  const protein = n(nut[`proteins${suffix}`]);
  const carbs = n(nut[`carbohydrates${suffix}`]);
  const fat = n(nut[`fat${suffix}`]);
  if (!kcal && !protein && !carbs && !fat) return null;
  const brand = Array.isArray(p.brands) ? p.brands.join(", ") : p.brands;
  return {
    name,
    brand: brand || undefined,
    unit: hasServing ? (p.serving_size || "serving") : "100 g",
    kcal,
    protein,
    carbs,
    fat,
  };
}
