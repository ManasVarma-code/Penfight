import type { PenSpec, PenUpgradePart, ProfileV1 } from './types';
import { getPenRequirement } from './progression';

export const MAX_PEN_UPGRADE_LEVEL = 5;
export const GRIP_GAIN_PERCENT = 7;
export const NIB_GAIN_PERCENT = 4;

const UPGRADE_COSTS = {
  grip: [90, 150, 240, 360, 520],
  nib: [120, 210, 300, 390, 480],
} satisfies Record<PenUpgradePart, number[]>;

export function getPenUpgradeLevel(profile: ProfileV1, penId: string, part: PenUpgradePart): number {
  return (part === 'grip' ? profile.penGripLevels : profile.penMastery)[penId] ?? 0;
}

export function getPenUpgradeCost(part: PenUpgradePart, level: number): number | undefined {
  return UPGRADE_COSTS[part][level];
}

export function isPenPurchaseUnlocked(profile: ProfileV1, pen: PenSpec): boolean {
  return getPenRequirement(pen.requiredTournamentWins, profile.defeatedRivals).met;
}

export function getTournamentPen(profile: ProfileV1, pen: PenSpec): PenSpec {
  const gripLevel = getPenUpgradeLevel(profile, pen.id, 'grip');
  const nibLevel = getPenUpgradeLevel(profile, pen.id, 'nib');
  return {
    ...pen,
    impactGrip: (pen.impactGrip ?? 1) * (1 + gripLevel * GRIP_GAIN_PERCENT / 100),
    power: pen.power * (1 + nibLevel * NIB_GAIN_PERCENT / 100),
  };
}
