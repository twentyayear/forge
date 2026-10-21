import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App.jsx";

// One-time copy of the pre-rename "forge.*" localStorage keys to "workhart.*"
// so existing users keep their local data. Old keys are left in place.
try {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("forge.")) {
      const next = "workhart." + k.slice("forge.".length);
      if (localStorage.getItem(next) === null) localStorage.setItem(next, localStorage.getItem(k));
    }
  }
} catch (e) { /* storage unavailable */ }

// PRODUCTION ONLY: A WORKER IN `npm run dev` WOULD SERVE STALE MODULES OVER VITE'S HOT RELOAD.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* the app works without it */ });
  });
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
