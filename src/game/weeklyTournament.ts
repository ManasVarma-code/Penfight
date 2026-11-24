const day = 86_400_000;
const weekLength = 7 * day;
const mondayOffset = 3 * day;

export const WEEKLY_REWARDS = [350, 650, 1500] as const;
export type WeeklyProgress = { week: number; wins: number };

const brackets = [
  [1, 4, 8], [0, 5, 9], [2, 6, 10], [3, 7, 11],
] as const;

export function getWeeklyTournament(now = Date.now()) {
  const week = Math.floor((now + mondayOffset) / weekLength);
  return {
    week,
    endsAt: (week + 1) * weekLength - mondayOffset,
    rivals: brackets[week % brackets.length],
  };
}

export function weeklyWins(progress: WeeklyProgress | undefined, week: number) {
  return progress?.week === week ? progress.wins : 0;
}

export function parseWeeklyProgress(value: unknown): WeeklyProgress | undefined {
  if (!value || typeof value !== 'object') return;
  const { week, wins } = value as Partial<WeeklyProgress>;
  if (typeof week === 'number' && Number.isSafeInteger(week) && week >= 0 &&
      typeof wins === 'number' && Number.isInteger(wins) && wins >= 1 && wins <= WEEKLY_REWARDS.length) {
    return { week, wins };
  }
}
