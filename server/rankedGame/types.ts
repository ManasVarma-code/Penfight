export type MatchMode = 'tournament' | 'pass_and_play' | 'online';

export type PlayerId = 'p1' | 'p2' | 'ai';

export type GameShellState =
  | 'TITLE_MENU'
  | 'PLAYING'
  | 'PASS_HANDOFF'
  | 'PAUSED'
  | 'SECOND_CHANCE'
  | 'MATCH_OVER';

export type TurnPhase = 'AIMING' | 'AI_THINKING' | 'SIMULATING' | 'KO_SLOWMO';

export type PenStyleKind =
  | 'ballpoint'
  | 'gel'
  | 'highlighter'
  | 'marker'
  | 'spinner'
  | 'fountain';

export type PenUpgradePart = 'grip' | 'nib';

export interface PenSpec {
  /** Additional surface drag when another pen knocks this one along the desk. */
  impactGrip?: number;
  /** Mid-power response of the flick input. */
  powerCurve?: number;
  id: string;
  name: string;
  tagline: string;
  unlockCoins: number;
  requiredTournamentWins: number;
  style: PenStyleKind;
  // Relative physics multipliers (Blueprint §5)
  mass: number;
  power: number;
  spin: number;
  grip: number;
  // World dimensions
  length: number;
  radius: number;
  // Visual palette
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  nibColor: string;
  clipColor: string;
}

export interface DeskSpec {
  id: string;
  name: string;
  description: string;
  unlockRankIndex: number; // 0 = starter, 2 = after Rank 2 (8 wins)
  frictionMult: number;
  surfacePrimary: string;
  surfaceSecondary: string;
  borderColor: string;
  trimAccent: string;
}

export interface OpponentSpec {
  index: number;
  rankIndex: number; // 0..3
  rankName: string;
  name: string;
  title: string;
  isBoss: boolean;
  penId: string;
  deskId: string;
}

export interface FlickCommand {
  shotId: string;
  playerId: PlayerId;
  gripOffset01: number; // -1 back tip, 0 center, +1 front tip
  aimRadians: number;
  normalizedPower: number; // 0..1
}

export interface PenBodyState {
  owner: PlayerId;
  spec: PenSpec;
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  omega: number;
  outOfBounds: boolean;
  overhangRatio: number; // 0..1 visual edge warning
  hitFlash: number;
  fallProgress: number; // 0..1 when tumbling off edge
  fallDirX: number;
  fallDirY: number;
  fallSpin: number;
  trail: Array<{ x: number; y: number; angle: number; alpha: number; turbo: boolean }>;
}

export interface PhysicsEvent {
  type: 'collision' | 'whip_crit' | 'ring_out';
  shotId: string;
  x: number;
  y: number;
  impulse: number;
  targetOwner?: PlayerId;
  attackerOwner?: PlayerId;
  angularGain?: number;
}

export interface PhysicsSnapshot {
  tournament?: true;
  p1: PenBodyState;
  p2: PenBodyState;
  isAtRest: boolean;
}

export interface AimPreviewState {
  active: boolean;
  owner: PlayerId;
  gripOffset01: number;
  gripX: number;
  gripY: number;
  aimRadians: number;
  normalizedPower: number;
  spinSign: -1 | 0 | 1;
  shotKind: 'RAM' | 'LEFT WHIP' | 'RIGHT WHIP';
  cancelled: boolean;
}

export interface MatchLedger {
  matchId: string;
  won: boolean;
  baseCoins: number;
  oneShotKoBonus: number;
  firstCritBonus: number;
  firstClearBonus?: number;
  achievementBonus?: number;
  newAchievements?: string[];
  doubleCoinsBonus?: number;
  totalCoins: number;
  doubled: boolean;
  opponentName: string;
  opponentRank: string;
  wasBoss: boolean;
  unlockedNewDesk?: string;
}

export type RewardPlacement =
  | 'edge_save'
  | 'double_coins'
  | 'pen_trial'
  | 'coin_chest';

export type AdLifecycleState =
  | 'IDLE'
  | 'LOADING'
  | 'READY'
  | 'SHOWING'
  | 'EARNED'
  | 'DISMISSED_UNEARNED'
  | 'FAILED';

export interface RewardIntent {
  rewardRequestId: string;
  placement: RewardPlacement;
  contextId: string;
  label: string;
  rewardSummary: string;
}

export interface PendingRewardRecord {
  id: string;
  kind: RewardPlacement;
  contextId: string;
  createdAt: number;
}

export interface AdMetrics {
  rewardedByPlacement: Record<RewardPlacement, number>;
  rewardedDismissedEarly: number;
  rewardedFailed: number;
  interstitialShown: number;
  interstitialSkipped: number;
  bannerImpressions: number;
}

export interface ProfileV1 {
  schemaVersion: 1;
  revision: number;
  coins: number;
  unlockedPens: string[];
  equippedPenId: string;
  penMastery: Record<string, number>; // Saved nib levels, including legacy mastery purchases
  penGripLevels: Record<string, number>;
  unlockedDeskIds: string[];
  equippedDeskId: string;
  highestTournamentOpponent: number; // Zero-based index of the furthest unlocked rival
  selectedOpponentIndex: number;
  tournamentWins: number;
  defeatedRivals: number[];
  lifetimeAuraEarned: number;
  totalKOs: number;
  currentWinStreak: number;
  bestWinStreak: number;
  claimedRewardIds: string[];
  pendingReward?: PendingRewardRecord;
  matchesSinceInterstitial: number;
  lastInterstitialAt: number;
  muted: boolean;
  reducedMotion: boolean;
  localChestDay: string;
  localChestCount: number;
  dailyDoubleDay: string;
  dailyDoubleCount: number;
  pendingDoubleOffer?: { matchId: string; points: number };
  adMetrics: AdMetrics;
}

export interface HudSnapshot {
  shellState: GameShellState;
  mode: MatchMode;
  turn: 'p1' | 'p2';
  turnPhase: TurnPhase;
  roundNumber: number;
  scoreP1: number;
  scoreP2: number;
  surgeP1: number;
  surgeP2: number;
  shotsInRound: number;
  suddenDeath: boolean;
  suddenDeathBonusPct: number;
  canRevive: boolean;
  opponent: OpponentSpec;
  p1PenName: string;
  p2PenName: string;
  deskName: string;
  trialPenName: string | null;
  statusBanner: string | null;
  ledger: MatchLedger | null;
  lastRoundDraw: boolean;
}
