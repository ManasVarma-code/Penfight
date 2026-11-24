import { TOURNAMENT_LADDER } from './content';
import type { OpponentSpec, ProfileV1 } from './types';

export const DAILY_DOUBLE_LIMIT = 2;
export const GOLD_PEN_ID = 'gold_fountain';

export function getTournamentAchievements(rivals: readonly number[], ownsGold: boolean) {
  const defeated = new Set(rivals);
  const achievements = [
    { title: 'First Victory', reward: 400, earned: defeated.size >= 1 },
    { title: 'Eight Rivals Down', reward: 2_500, earned: defeated.size >= 8 },
    { title: 'Original Sixteen', reward: 6_000, earned: hasOriginalVictories(defeated) },
    { title: 'Aura Trials Champion', reward: 9_000, earned: defeated.has(19) },
    { title: 'Tournament Legend', reward: 18_000, earned: defeated.size === TOURNAMENT_LADDER.length },
    { title: 'Golden Legacy', reward: 0, earned: ownsGold },
  ];
  return achievements;
}

function hasOriginalVictories(defeated: ReadonlySet<number>): boolean {
  return Array.from({ length: 16 }, (_, index) => index).every(index => defeated.has(index));
}

export function getPenRequirement(required: number, rivals: readonly number[]) {
  const progress = required === 16 ? rivals.filter(index => index < 16).length : rivals.length;
  return {
    progress: Math.min(required, progress),
    label: required === 16 ? 'Defeat all 16 original rivals' : `Defeat ${required} different Tournament rivals`,
    met: progress >= required,
  };
}

export function canDoubleToday(profile: Pick<ProfileV1, 'dailyDoubleDay' | 'dailyDoubleCount'>, today: string): boolean {
  return profile.dailyDoubleDay < today ||
    (profile.dailyDoubleDay === today && profile.dailyDoubleCount < DAILY_DOUBLE_LIMIT);
}

export function calculateTournamentReward(
  profile: Pick<ProfileV1, 'defeatedRivals' | 'unlockedPens' | 'dailyDoubleDay' | 'dailyDoubleCount'>,
  rival: OpponentSpec, won: boolean, oneShot: boolean, crit: boolean, today: string
) {
  const firstClear = won && !profile.defeatedRivals.includes(rival.index);
  const nextRivals = firstClear ? [...profile.defeatedRivals, rival.index] : profile.defeatedRivals;
  const ownsGold = profile.unlockedPens.includes(GOLD_PEN_ID);
  const previous = new Set(getTournamentAchievements(profile.defeatedRivals, ownsGold)
    .filter(a => a.earned).map(a => a.title));
  const achievements = getTournamentAchievements(nextRivals, ownsGold)
    .filter(a => a.earned && !previous.has(a.title));
  const baseCoins = won
    ? Math.floor((700 + rival.index * 95) * (firstClear ? 1 : 0.45))
    : (140 + rival.index * 20) * 7 / 10;
  const oneShotKoBonus = won && oneShot ? 120 : 0;
  const firstCritBonus = won && crit ? 100 : 0;
  const firstClearBonus = firstClear
    ? 1_100 + rival.index * 125 + (rival.isBoss ? 1_800 + rival.index * 175 : 0) : 0;
  const achievementBonus = achievements.reduce((total, a) => total + a.reward, 0);
  const battleCoins = baseCoins + oneShotKoBonus + firstCritBonus;
  return {
    nextRivals, baseCoins, oneShotKoBonus, firstCritBonus, firstClearBonus, achievementBonus,
    newAchievements: achievements.map(a => a.title),
    totalCoins: battleCoins + firstClearBonus + achievementBonus,
    doubleCoinsBonus: won && canDoubleToday(profile, today) ? battleCoins : 0,
  };
}
