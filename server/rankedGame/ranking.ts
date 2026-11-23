export const STARTING_RATING = 1000;

export const AURA_TIERS = [
  { name: 'Bronze', thresholds: [100, 1050, 1100] },
  { name: 'Silver', thresholds: [1150, 1230, 1310] },
  { name: 'Gold', thresholds: [1400, 1500, 1600] },
  { name: 'Diamond', thresholds: [1700, 1815, 1930] },
  { name: 'Aura Legend', thresholds: [2050, 2200, 2350] },
] as const;

export const AURA_DIVISIONS = AURA_TIERS.flatMap((tier, tierIndex) =>
  tier.thresholds.map((minimum, division) => ({
    tier: tier.name, tierIndex, minimum, label: `${tier.name} ${division + 1}`,
  })));

export function getAuraRank(rating: number) {
  const index = AURA_DIVISIONS.findIndex((_, i) => rating < (AURA_DIVISIONS[i + 1]?.minimum ?? Infinity));
  const position = Math.max(0, index);
  const current = AURA_DIVISIONS[position];
  const next = AURA_DIVISIONS[position + 1];
  return { ...current, position, next, pointsToNext: next ? next.minimum - rating : 0 };
}

export function rankedSearchRange(waitMs: number): number {
  return Math.min(450, 75 + Math.floor(Math.max(0, waitMs) / 12_000) * 75);
}

export interface RankedHistoryEntry {
  id: string;
  at: number;
  won: boolean;
  completed: boolean;
  opponent: string;
  opponentRating: number;
  before: number;
  after: number;
}

export interface RankedProfile {
  displayName: string;
  rating: number;
  peakRating: number;
  rankedMatches: number;
  rankedWins: number;
  history: RankedHistoryEntry[];
}
