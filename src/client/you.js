// PURE HELPERS FOR THE You TAB.

// THE REGISTRY'S BLURBS CARRY <exercise> AND <program> PLACEHOLDERS; context HOLDS THE REAL NAMES. A MISSING NAME FALLS BACK TO PLAIN WORDS.
export function fillBlurb(blurb, context) {
  const ctx = context && typeof context === "object" ? context : {};
  return String(blurb || "")
    .replace(/<exercise>/g, ctx.exercise || "that lift")
    .replace(/<program>/g, ctx.program || "your program");
}
