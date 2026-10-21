// THE SIX STARTER PROGRAMS KYLE OFFERS, AS PURE DATA. SEEDED BY scripts/seed-programs.js; CHECKED BY
// test/seed-programs.test.js (DB) AND src/data/exercises.test.js (EVERY exercise_key IS AN EX_LIB NAME).
//
// STARTING LOADS ARE PLACEHOLDERS FOR A NEW CLIENT: THE TRAINER ADJUSTS THEM PER PERSON AND THE CLIENT EDITS
// THEM IN THE SET GRID. weight_lbs null = BODYWEIGHT. TIMED WORK (HOLDS, CARRIES, SPRINTS) IS ONE REP PER SET
// WITH THE TIME IN THE BLOCK NOTE.

// ex(key, sets, reps, weight, rest, note) -> ONE BLOCK IN THE SHAPE server/admin.js isValidBlocks ACCEPTS.
function ex(exercise_key, sets, reps, weight_lbs, rest_sec = 90, note) {
  const block = {
    exercise_key,
    sets: Array.from({ length: sets }, () => ({ reps, weight_lbs })),
    rest_sec,
  };
  if (note) block.note = note;
  return block;
}

// WORKOUTS BY TITLE. A TITLE IS THE IDEMPOTENCY KEY FOR THE SEED (ONE ROW PER TRAINER PER TITLE).
export const WORKOUTS = {
  "Foundations A": {
    notes: "Full body, the basics. Learn the squat, the push and the row with loads you own.",
    blocks: [
      ex("Goblet Squat", 3, 10, 35),
      ex("Push-Up Finisher", 3, 10, null, 60),
      ex("Inverted Row", 3, 8, null),
      ex("Dumbbell Step-Up", 3, 8, 20, 60, "Each leg"),
      ex("Dead Bug", 3, 10, null, 45, "Each side"),
      ex("Plank Hold", 3, 1, null, 60, "45 seconds"),
    ],
  },
  "Foundations B": {
    notes: "Full body with a hinge. The trap bar teaches the pull from the floor safely.",
    blocks: [
      ex("Trap Bar Deadlift", 3, 6, 95, 120),
      ex("Dumbbell Bench Press", 3, 10, 25),
      ex("Seated Cable Row", 3, 10, 60),
      ex("Reverse Lunge", 3, 8, 20, 60, "Each leg"),
      ex("Pallof Press", 3, 10, 20, 45, "Each side"),
      ex("Farmer's Carry", 3, 1, 40, 60, "40 yards"),
    ],
  },
  "Foundations C": {
    notes: "Full body, machines and balance. Finish with a short row effort.",
    blocks: [
      ex("Leg Press", 3, 12, 135),
      ex("Seated DB Shoulder Press", 3, 10, 20),
      ex("Lat Pulldown", 3, 10, 70),
      ex("Single-Leg RDL", 3, 8, 20, 60, "Each leg"),
      ex("Cable Crunch", 3, 12, 40, 45),
      ex("Rowing Sprint", 3, 1, null, 90, "250 metres"),
    ],
  },

  "Lower A": {
    notes: "Squat day. Five hard reps, then the hamstrings and single-leg work.",
    blocks: [
      ex("Back Squat", 4, 5, 135, 150),
      ex("Romanian Deadlift", 3, 8, 115, 120),
      ex("Walking Lunge", 3, 10, 25, 90, "Each leg"),
      ex("Standing Calf Raise", 3, 12, 90, 60),
      ex("Hanging Leg Raise", 3, 10, null, 60),
    ],
  },
  "Upper A": {
    notes: "Bench and row. Heavy pressing, heavy pulling, then shoulders and rear delts.",
    blocks: [
      ex("Barbell Bench Press", 4, 5, 115, 150),
      ex("Barbell Row", 4, 6, 95, 120),
      ex("Overhead Press", 3, 8, 65, 120),
      ex("Weighted Pull-Up", 3, 5, 10, 120),
      ex("Face Pull", 3, 15, 30, 60),
    ],
  },
  "Lower B": {
    notes: "Deadlift day. Four crisp reps, then the front squat and single-leg work.",
    blocks: [
      ex("Deadlift", 4, 4, 185, 180),
      ex("Front Squat", 3, 6, 95, 120),
      ex("Bulgarian Split Squat", 3, 8, 25, 90, "Each leg"),
      ex("Lying Leg Curl", 3, 10, 60, 60),
      ex("Plank Hold", 3, 1, null, 60, "45 seconds"),
    ],
  },
  "Upper B": {
    notes: "Incline and chin-ups, then power pressing and arms.",
    blocks: [
      ex("Incline Bench Press", 4, 6, 95, 150),
      ex("Chin-Up", 4, 6, null, 120),
      ex("Push Press", 3, 5, 75, 120),
      ex("Chest-Supported Row", 3, 10, 90, 90),
      ex("Barbell Curl", 3, 10, 45, 60),
      ex("Skull Crusher", 3, 10, 45, 60),
    ],
  },

  "Push": {
    notes: "Chest, shoulders, triceps. Eight to fifteen reps, two seconds down on every set.",
    blocks: [
      ex("Barbell Bench Press", 4, 8, 95, 120),
      ex("Incline DB Press", 3, 10, 30, 90),
      ex("Seated DB Shoulder Press", 3, 10, 25, 90),
      ex("Cable Lateral Raise", 3, 15, 10, 60),
      ex("Cable Chest Fly", 3, 12, 20, 60),
      ex("Overhead Rope Extension", 3, 12, 30, 60),
      ex("Triceps Pushdown", 3, 12, 30, 60),
    ],
  },
  "Pull": {
    notes: "Back and biceps. One heavy pull from the floor, then volume.",
    blocks: [
      ex("Deadlift", 3, 5, 185, 180),
      ex("Pull-Up", 4, 8, null, 120),
      ex("Seated Cable Row", 3, 10, 90, 90),
      ex("Lat Pulldown", 3, 12, 80, 90),
      ex("Face Pull", 3, 15, 30, 60),
      ex("EZ-Bar Curl", 3, 12, 40, 60),
      ex("Preacher Curl", 3, 12, 35, 60),
    ],
  },
  "Legs": {
    notes: "Quads, hamstrings, calves. The squat leads; the machines finish the job.",
    blocks: [
      ex("Back Squat", 4, 8, 135, 150),
      ex("Leg Press", 3, 12, 180, 120),
      ex("Romanian Deadlift", 3, 10, 95, 120),
      ex("Leg Extension", 3, 15, 60, 60),
      ex("Lying Leg Curl", 3, 12, 60, 60),
      ex("Standing Calf Raise", 4, 15, 90, 60),
      ex("Cable Crunch", 3, 15, 40, 45),
    ],
  },

  "Engine A": {
    notes: "Row intervals, swings, burpees. Work hard, rest honestly, core to finish.",
    blocks: [
      ex("Rowing Sprint", 6, 1, null, 90, "250 metres hard"),
      ex("Kettlebell Swing", 5, 15, 35, 60),
      ex("Burpee", 4, 10, null, 60),
      ex("Dead Bug", 3, 12, null, 45, "Each side"),
      ex("Plank Hold", 3, 1, null, 60, "60 seconds"),
    ],
  },
  "Engine B": {
    notes: "Sled, jumps, thrusters. Power first while you are fresh.",
    blocks: [
      ex("Sled Push", 6, 1, null, 90, "40 yards"),
      ex("Box Jump", 4, 6, null, 90),
      ex("Dumbbell Thruster", 4, 10, 20, 90),
      ex("Pallof Press", 3, 12, 20, 45, "Each side"),
      ex("Hanging Leg Raise", 3, 12, null, 60),
    ],
  },
  "Engine C": {
    notes: "Burpees and swings in rounds, then carries and a last row.",
    blocks: [
      ex("Burpee", 5, 8, null, 60),
      ex("Kettlebell Swing", 4, 20, 35, 60),
      ex("Farmer's Carry", 4, 1, 50, 60, "40 yards"),
      ex("Cable Crunch", 3, 15, 40, 45),
      ex("Rowing Sprint", 4, 1, null, 90, "500 metres"),
    ],
  },

  "Dumbbells A": {
    notes: "Full body with a pair of dumbbells. Squat, press, row.",
    blocks: [
      ex("Goblet Squat", 4, 10, 40, 90),
      ex("Dumbbell Bench Press", 4, 10, 30, 90),
      ex("One-Arm DB Row", 3, 10, 35, 60, "Each arm"),
      ex("Reverse Lunge", 3, 10, 20, 60, "Each leg"),
      ex("DB Lateral Raise", 3, 15, 10, 45),
      ex("Hammer Curl", 3, 12, 20, 45),
    ],
  },
  "Dumbbells B": {
    notes: "Full body, power and balance. Thrusters open it; the core closes it.",
    blocks: [
      ex("Dumbbell Thruster", 4, 8, 20, 90),
      ex("Single-Leg RDL", 3, 8, 25, 60, "Each leg"),
      ex("Incline DB Press", 3, 10, 30, 90),
      ex("Dumbbell Step-Up", 3, 10, 20, 60, "Each leg"),
      ex("Arnold Press", 3, 10, 20, 60),
      ex("Dead Bug", 3, 12, null, 45, "Each side"),
    ],
  },
  "Dumbbells C": {
    notes: "Full body, single-leg and carries. Finish with push-ups to failure minus one.",
    blocks: [
      ex("Bulgarian Split Squat", 3, 10, 20, 90, "Each leg"),
      ex("Seated DB Shoulder Press", 3, 10, 25, 90),
      ex("One-Arm DB Row", 4, 8, 40, 60, "Each arm"),
      ex("Walking Lunge", 3, 12, 20, 60, "Each leg"),
      ex("Farmer's Carry", 3, 1, 50, 60, "40 yards"),
      ex("Push-Up Finisher", 3, 15, null, 60),
    ],
  },

  "Power A": {
    notes: "Jump, squat, press, pull. Low reps, full rest, perfect speed.",
    blocks: [
      ex("Box Jump", 5, 3, null, 120),
      ex("Front Squat", 4, 4, 115, 180),
      ex("Push Press", 4, 3, 85, 150),
      ex("Trap Bar Deadlift", 3, 5, 155, 150),
      ex("Pallof Press", 3, 10, 25, 60, "Each side"),
    ],
  },
  "Power B": {
    notes: "Hip power and pulling. Swings fast, hip thrusts heavy, chin-ups strict.",
    blocks: [
      ex("Kettlebell Swing", 5, 8, 44, 90),
      ex("Chin-Up", 4, 6, null, 120),
      ex("Barbell Hip Thrust", 4, 8, 135, 120),
      ex("Dips", 3, 8, null, 90),
      ex("Hanging Leg Raise", 3, 10, null, 60),
    ],
  },
  "Power C": {
    notes: "Sled and pressing power, then weighted pulls and single-leg strength.",
    blocks: [
      ex("Sled Push", 5, 1, null, 120, "30 yards fast"),
      ex("Close-Grip Bench Press", 4, 5, 95, 150),
      ex("Weighted Pull-Up", 4, 4, 10, 150),
      ex("Bulgarian Split Squat", 3, 6, 30, 90, "Each leg"),
      ex("Barbell Shrug", 3, 10, 135, 60),
      ex("Plank Hold", 3, 1, null, 60, "60 seconds"),
    ],
  },
};

// PROGRAMS: weeks × a weekly pattern of [day offset within the week (0 = Monday), workout title].
// DAYS NOT LISTED ARE REST DAYS (NO program_days ROW).
export const PROGRAMS = [
  {
    title: "Foundations",
    description: "Four weeks, three days a week, full body. Learn the big patterns with loads you own. Start here if you are new or returning.",
    weeks: 4,
    pattern: [[0, "Foundations A"], [2, "Foundations B"], [4, "Foundations C"]],
  },
  {
    title: "Strength Block",
    description: "Four weeks, four days a week: two lower, two upper. Low reps on the main lifts, add weight when every rep is clean.",
    weeks: 4,
    pattern: [[0, "Lower A"], [1, "Upper A"], [3, "Lower B"], [4, "Upper B"]],
  },
  {
    title: "Push Pull Legs",
    description: "Four weeks, six days a week. Muscle-building volume with a rest day on Sunday. For people who already train.",
    weeks: 4,
    pattern: [[0, "Push"], [1, "Pull"], [2, "Legs"], [3, "Push"], [4, "Pull"], [5, "Legs"]],
  },
  {
    title: "Conditioning and Core",
    description: "Three weeks, three days a week. Rowing, swings, sled and burpees in intervals, core every session. Pairs with any strength plan.",
    weeks: 3,
    pattern: [[1, "Engine A"], [3, "Engine B"], [5, "Engine C"]],
  },
  {
    title: "Dumbbells Only",
    description: "Four weeks, three days a week, nothing but a pair of dumbbells and a bench. Home or hotel gym.",
    weeks: 4,
    pattern: [[0, "Dumbbells A"], [2, "Dumbbells B"], [4, "Dumbbells C"]],
  },
  {
    title: "Athletic Power",
    description: "Four weeks, three days a week. Jumps, fast lifts and heavy pulls with full rest. Move faster, not just heavier.",
    weeks: 4,
    pattern: [[0, "Power A"], [2, "Power B"], [4, "Power C"]],
  },
];

// programDays(program) -> [{day_index, workoutTitle}] EXPANDED OVER THE WEEKS.
export function programDays(program) {
  const out = [];
  for (let w = 0; w < program.weeks; w++) {
    for (const [offset, title] of program.pattern) out.push({ day_index: w * 7 + offset, workoutTitle: title });
  }
  return out;
}
