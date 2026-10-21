// MORNING CHECK-IN: 7 QUESTIONS, 4 ANSWERS EACH; THE ANSWER INDEX IS ITS POINT VALUE (0..3), MAX 21.
export const CHECKIN_QS = [
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
