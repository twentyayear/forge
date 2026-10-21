// THE ONLY fetch IN src/ (src/theme.test.js PINS IT): ONE PLACE TO CHANGE CREDENTIALS, HEADERS AND ERROR SHAPE.

function withJson(init) {
  return {
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  };
}

// RESOLVES {status, ok, data} FOR EVERY HTTP STATUS; data IS null WHEN THE BODY IS EMPTY OR NOT JSON.
// A NETWORK FAILURE STILL REJECTS, SO CALLERS' try/catch BLOCKS KEEP THEIR MEANING.
export async function api(path, init) {
  const res = await fetch(path, withJson(init));
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }
  return { status: res.status, ok: res.ok, data };
}

export async function apiBlob(path, init) {
  const res = await fetch(path, withJson(init));
  const blob = res.ok ? await res.blob() : null;
  return { status: res.status, ok: res.ok, blob };
}

export function foodSearch(q) {
  return api("/api/food?q=" + encodeURIComponent(q));
}
