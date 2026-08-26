const OFF_ORIGIN = "https://search.openfoodfacts.org";

// Coerce to a finite number, round to 1 decimal (mirrors Fresh Start's n()).
const n = (x) => {
  const v = typeof x === "string" ? parseFloat(x) : x;
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : 0;
};

export default async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 2 || q.length > 40) return new Response("Bad request", { status: 400 });

  const apiUrl = `${OFF_ORIGIN}/search?q=${encodeURIComponent(q)}&page_size=8&fields=product_name,brands,serving_size,nutriments`;
  const r = await fetch(apiUrl, {
    headers: { "User-Agent": "Forge-Prototype/1.0 (personal use)" },
  });
  if (!r.ok) return new Response("Upstream error", { status: 502 });

  const json = await r.json();
  const hits = Array.isArray(json.hits) ? json.hits : [];

  const results = hits.map((p) => {
    const name = p.product_name;
    if (!name) return null;
    const nut = p.nutriments ?? {};
    // Prefer per-serving values; fall back to per-100g (Fresh Start's preference rule).
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
      kcal, protein, carbs, fat,
    };
  }).filter(Boolean);

  return new Response(JSON.stringify({ results }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  });
};

export const config = { path: "/api/food" };
