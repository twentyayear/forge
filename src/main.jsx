import React from "react";
import { createRoot } from "react-dom/client";
import Workhart from "./Workhart.jsx";

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

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Workhart />
  </React.StrictMode>
);
