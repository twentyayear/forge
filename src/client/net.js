import { api } from "../lib/api.js";

// EVERY CLIENT CALL GOES THROUGH HERE: A 401 SIGNS THE SHELL OUT, A NETWORK FAILURE BECOMES {status: 0, ok: false} INSTEAD OF A THROW.
export async function call(path, init, onSignedOut) {
  try {
    const res = await api(path, init);
    if (res.status === 401 && onSignedOut) onSignedOut();
    return res;
  } catch {
    return { status: 0, ok: false, data: null };
  }
}

export const post = (path, body, onSignedOut) =>
  call(path, { method: "POST", body: JSON.stringify(body) }, onSignedOut);
