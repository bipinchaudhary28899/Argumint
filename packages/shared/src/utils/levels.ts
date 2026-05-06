export interface LevelEntry {
  level: number;
  minXP: number;
  title: string;
}

export const LEVEL_TABLE: LevelEntry[] = [
  { level: 1,  minXP: 0,     title: "Novice"       },
  { level: 2,  minXP: 150,   title: "Debater"      },
  { level: 3,  minXP: 400,   title: "Arguer"       },
  { level: 4,  minXP: 750,   title: "Advocate"     },
  { level: 5,  minXP: 1200,  title: "Orator"       },
  { level: 6,  minXP: 1800,  title: "Rhetorician"  },
  { level: 7,  minXP: 2600,  title: "Sophist"      },
  { level: 8,  minXP: 3600,  title: "Dialectician" },
  { level: 9,  minXP: 5000,  title: "Logician"     },
  { level: 10, minXP: 7000,  title: "Grand Master"  },
];

export interface LevelInfo {
  current: LevelEntry;
  next: LevelEntry | null;
  totalXP: number;
  progressXP: number;
  neededXP: number;
  progressPct: number;
}

export function getLevelInfo(totalXP: number): LevelInfo {
  let idx = 0;
  for (let i = LEVEL_TABLE.length - 1; i >= 0; i--) {
    if (totalXP >= LEVEL_TABLE[i].minXP) { idx = i; break; }
  }
  const current = LEVEL_TABLE[idx];
  const next    = LEVEL_TABLE[idx + 1] ?? null;
  const progressXP  = next ? totalXP - current.minXP : 0;
  const neededXP    = next ? next.minXP - current.minXP : 0;
  const progressPct = next ? Math.min(100, Math.round((progressXP / neededXP) * 100)) : 100;
  return { current, next, totalXP, progressXP, neededXP, progressPct };
}
