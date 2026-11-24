import { DESKS, PENS, TOURNAMENT_LADDER } from './content';
import { getPenUpgradeCost, getPenUpgradeLevel, isPenPurchaseUnlocked, MAX_PEN_UPGRADE_LEVEL } from './garage';
import { calculateTournamentReward, canDoubleToday } from './progression';
import { getWeeklyTournament, parseWeeklyProgress, weeklyWins, WEEKLY_REWARDS } from './weeklyTournament';
import { AdMetrics, PendingRewardRecord, PenUpgradePart, ProfileV1, RewardPlacement } from './types';

const LS_KEY = 'pen_fight_royale_profile_v1';
const LS_BACKUP_KEY = 'pen_fight_royale_profile_v1_backup';
const IDB_NAME = 'pen_fight_royale_db';
const IDB_STORE = 'profiles';
const IDB_KEY = 'main';
const MAX_CLAIMED_IDS = 120;

export function getLocalDayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function createDefaultAdMetrics(): AdMetrics {
  return {
    rewardedByPlacement: {
      edge_save: 0,
      double_coins: 0,
      pen_trial: 0,
      coin_chest: 0,
    },
    rewardedDismissedEarly: 0,
    rewardedFailed: 0,
    interstitialShown: 0,
    interstitialSkipped: 0,
    bannerImpressions: 0,
  };
}

export function createDefaultProfile(): ProfileV1 {
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return {
    schemaVersion: 1,
    revision: 1,
    coins: 0,
    unlockedPens: [PENS[0].id],
    equippedPenId: PENS[0].id,
    penMastery: {},
    penGripLevels: {},
    unlockedDeskIds: [DESKS[0].id],
    equippedDeskId: DESKS[0].id,
    highestTournamentOpponent: 0,
    selectedOpponentIndex: 0,
    tournamentWins: 0,
    defeatedRivals: [],
    lifetimeAuraEarned: 0,
    totalKOs: 0,
    currentWinStreak: 0,
    bestWinStreak: 0,
    claimedRewardIds: [],
    matchesSinceInterstitial: 0,
    lastInterstitialAt: 0,
    muted: false,
    reducedMotion: !!prefersReduced,
    localChestDay: getLocalDayKey(),
    localChestCount: 0,
    dailyDoubleDay: getLocalDayKey(),
    dailyDoubleCount: 0,
    adMetrics: createDefaultAdMetrics(),
  };
}

const VALID_PEN_IDS = new Set(PENS.map((p) => p.id));
const VALID_DESK_IDS = new Set(DESKS.map((d) => d.id));

function sanitizePenLevels(raw: unknown): Record<string, number> {
  const levels: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return levels;
  for (const [id, value] of Object.entries(raw)) {
    if (!VALID_PEN_IDS.has(id) || typeof value !== 'number') continue;
    const level = Math.floor(value);
    if (level >= 0 && level <= MAX_PEN_UPGRADE_LEVEL) levels[id] = level;
  }
  return levels;
}

function sanitizeProfile(raw: unknown): ProfileV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== 1) return null;

  const coins = Number(obj.coins);
  if (!Number.isFinite(coins) || coins < 0 || coins > Number.MAX_SAFE_INTEGER) return null;

  const base = createDefaultProfile();

  const unlockedPens = Array.isArray(obj.unlockedPens)
    ? Array.from(
        new Set(
          obj.unlockedPens.filter(
            (id): id is string => typeof id === 'string' && VALID_PEN_IDS.has(id)
          )
        )
      )
    : [PENS[0].id];
  if (!unlockedPens.includes(PENS[0].id)) unlockedPens.unshift(PENS[0].id);

  const equippedPenId =
    typeof obj.equippedPenId === 'string' && unlockedPens.includes(obj.equippedPenId)
      ? obj.equippedPenId
      : PENS[0].id;

  const unlockedDeskIds = Array.isArray(obj.unlockedDeskIds)
    ? Array.from(
        new Set(
          obj.unlockedDeskIds.filter(
            (id): id is string => typeof id === 'string' && VALID_DESK_IDS.has(id)
          )
        )
      )
    : [DESKS[0].id];
  if (!unlockedDeskIds.includes(DESKS[0].id)) unlockedDeskIds.unshift(DESKS[0].id);

  const equippedDeskId =
    typeof obj.equippedDeskId === 'string' && unlockedDeskIds.includes(obj.equippedDeskId)
      ? obj.equippedDeskId
      : DESKS[0].id;

  const maxOpp = TOURNAMENT_LADDER.length - 1;
  const highestTournamentOpponent = Math.max(
    0,
    Math.min(maxOpp, Math.floor(Number(obj.highestTournamentOpponent) || 0))
  );
  const savedOpponentIndex = obj.selectedOpponentIndex == null ? NaN : Number(obj.selectedOpponentIndex);
  const selectedOpponentIndex = Math.max(
    0,
    Math.min(
      highestTournamentOpponent,
      Number.isFinite(savedOpponentIndex) ? Math.floor(savedOpponentIndex) : highestTournamentOpponent
    )
  );
  // Previous saves advanced the ladder one rival at a time. Reaching a rival
  // proves the earlier clears, but does not prove that rival was defeated.
  const defeatedRivals = Array.isArray(obj.defeatedRivals)
    ? [...new Set(obj.defeatedRivals.filter((item): item is number =>
      Number.isInteger(item) && item >= 0 && item <= highestTournamentOpponent))]
    : Array.from({ length: highestTournamentOpponent }, (_, index) => index);
  const savedLifetime = Number(obj.lifetimeAuraEarned);
  const lifetimeAuraEarned = Number.isSafeInteger(savedLifetime) && savedLifetime >= coins
    ? savedLifetime : Math.floor(coins);

  const rawMetrics = (obj.adMetrics ?? {}) as Partial<AdMetrics>;
  const defaultMetrics = createDefaultAdMetrics();
  const adMetrics: AdMetrics = {
    rewardedByPlacement: {
      edge_save: Math.max(0, Number(rawMetrics.rewardedByPlacement?.edge_save) || 0),
      double_coins: Math.max(0, Number(rawMetrics.rewardedByPlacement?.double_coins) || 0),
      pen_trial: Math.max(0, Number(rawMetrics.rewardedByPlacement?.pen_trial) || 0),
      coin_chest: Math.max(0, Number(rawMetrics.rewardedByPlacement?.coin_chest) || 0),
    },
    rewardedDismissedEarly: Math.max(0, Number(rawMetrics.rewardedDismissedEarly) || 0),
    rewardedFailed: Math.max(0, Number(rawMetrics.rewardedFailed) || 0),
    interstitialShown: Math.max(0, Number(rawMetrics.interstitialShown) || 0),
    interstitialSkipped: Math.max(0, Number(rawMetrics.interstitialSkipped) || 0),
    bannerImpressions: Math.max(0, Number(rawMetrics.bannerImpressions) || 0),
  };

  // Clock-change safeguard for daily chest counter
  const today = getLocalDayKey();
  const storedDay = typeof obj.localChestDay === 'string' ? obj.localChestDay : today;
  const localChestCount =
    storedDay === today
      ? Math.max(0, Math.min(2, Math.floor(Number(obj.localChestCount) || 0)))
      : storedDay > today
        ? 2 // Guard against setting clock backwards
        : 0;

  const claimedRewardIds = Array.isArray(obj.claimedRewardIds)
    ? obj.claimedRewardIds
        .filter((s): s is string => typeof s === 'string')
        .slice(-MAX_CLAIMED_IDS)
    : [];

  let pendingReward: PendingRewardRecord | undefined;
  if (obj.pendingReward && typeof obj.pendingReward === 'object') {
    const p = obj.pendingReward as Record<string, unknown>;
    if (typeof p.id === 'string' && typeof p.kind === 'string' && typeof p.contextId === 'string') {
      pendingReward = {
        id: p.id,
        kind: p.kind as RewardPlacement,
        contextId: p.contextId,
        createdAt: Number(p.createdAt) || Date.now(),
      };
    }
  }

  const doubleOffer = obj.pendingDoubleOffer as ProfileV1['pendingDoubleOffer'];
  const pendingDoubleOffer = doubleOffer && typeof doubleOffer.matchId === 'string'
    && Number.isSafeInteger(doubleOffer.points) && doubleOffer.points > 0
    && claimedRewardIds.includes(`match_payout_${doubleOffer.matchId}`)
    && !claimedRewardIds.includes(`double_coins_${doubleOffer.matchId}`) ? doubleOffer : undefined;

  return {
    ...base,
    revision: Math.max(1, Math.floor(Number(obj.revision) || 1)),
    coins: Math.floor(coins),
    unlockedPens,
    equippedPenId,
    penMastery: sanitizePenLevels(obj.penMastery),
    penGripLevels: sanitizePenLevels(obj.penGripLevels),
    unlockedDeskIds,
    equippedDeskId,
    highestTournamentOpponent,
    selectedOpponentIndex,
    tournamentWins: Math.max(0, Math.floor(Number(obj.tournamentWins) || 0)),
    defeatedRivals,
    weeklyTournament: parseWeeklyProgress(obj.weeklyTournament),
    lifetimeAuraEarned,
    totalKOs: Math.max(0, Math.floor(Number(obj.totalKOs) || 0)),
    currentWinStreak: Math.max(0, Math.floor(Number(obj.currentWinStreak) || 0)),
    bestWinStreak: Math.max(0, Math.floor(Number(obj.bestWinStreak) || 0)),
    claimedRewardIds,
    pendingReward,
    matchesSinceInterstitial: Math.max(0, Math.floor(Number(obj.matchesSinceInterstitial) || 0)),
    lastInterstitialAt: Math.max(0, Number(obj.lastInterstitialAt) || 0),
    muted: Boolean(obj.muted),
    reducedMotion:
      typeof obj.reducedMotion === 'boolean' ? obj.reducedMotion : base.reducedMotion,
    localChestDay: storedDay > today ? storedDay : today,
    localChestCount,
    dailyDoubleDay: typeof obj.dailyDoubleDay === 'string' ? obj.dailyDoubleDay : today,
    dailyDoubleCount: Math.max(0, Math.min(2, Math.floor(Number(obj.dailyDoubleCount) || 0))),
    pendingDoubleOffer,
    adMetrics: { ...defaultMetrics, ...adMetrics },
  };
}

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readFromIDB(): Promise<unknown | null> {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeToIDB(profile: ProfileV1): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(profile, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

class ProfileRepository {
  private current: ProfileV1 = createDefaultProfile();
  private listeners = new Set<(profile: ProfileV1) => void>();
  public recoveryWarning: string | null = null;

  constructor() {
    // Immediate synchronous bootstrap from localStorage so UI never flickers
    this.bootstrapSync();
  }

  private bootstrapSync(): void {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = sanitizeProfile(JSON.parse(raw));
        if (parsed) {
          this.current = parsed;
          return;
        }
        // Attempt backup snapshot recovery
        const backup = localStorage.getItem(LS_BACKUP_KEY);
        if (backup) {
          const recovered = sanitizeProfile(JSON.parse(backup));
          if (recovered) {
            this.current = recovered;
            this.recoveryWarning = 'Recovered saved profile from last valid backup.';
            this.persistSync(recovered);
            return;
          }
        }
        this.recoveryWarning = 'Saved data was invalid and reset to defaults.';
      }
    } catch {
      // Ignore storage errors in private contexts
    }
  }

  async hydrate(): Promise<ProfileV1> {
    const idbRaw = await readFromIDB();
    const idbProfile = sanitizeProfile(idbRaw);
    if (idbProfile && idbProfile.revision > this.current.revision) {
      this.current = idbProfile;
      this.persistSync(idbProfile);
      this.emit();
    } else {
      await writeToIDB(this.current);
    }
    return this.current;
  }

  get(): ProfileV1 {
    return this.current;
  }

  restoreOfflineProgress(progress: unknown): boolean {
    const restored = sanitizeProfile(progress);
    if (!restored) return false;
    this.commit(draft => {
      Object.assign(draft, offlineProgress(restored));
      delete draft.pendingReward;
      delete draft.pendingDoubleOffer;
    });
    return true;
  }

  subscribe(fn: (profile: ProfileV1) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.current);
  }

  private persistSync(next: ProfileV1): void {
    try {
      const prev = localStorage.getItem(LS_KEY);
      if (prev) localStorage.setItem(LS_BACKUP_KEY, prev);
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota errors
    }
  }

  commit(mutator: (draft: ProfileV1) => void): ProfileV1 {
    const draft: ProfileV1 = JSON.parse(JSON.stringify(this.current));
    mutator(draft);
    draft.revision = this.current.revision + 1;

    // Enforce hard invariants
    if (!Number.isFinite(draft.coins) || draft.coins < 0) {
      draft.coins = this.current.coins;
    } else {
      draft.coins = Math.floor(draft.coins);
    }
    if (draft.claimedRewardIds.length > MAX_CLAIMED_IDS) {
      draft.claimedRewardIds = draft.claimedRewardIds.slice(-MAX_CLAIMED_IDS);
    }

    const validated = sanitizeProfile(draft) ?? this.current;
    this.current = validated;
    this.persistSync(validated);
    void writeToIDB(validated);
    this.emit();
    return validated;
  }

  /**
   * Atomic deduplicated currency grant (Blueprint §7.2).
   * Prevents duplicate grants on repeated ad callbacks or reload retries.
   */
  grantCoinsAtomic(transactionId: string, amount: number): boolean {
    if (!transactionId || !Number.isFinite(amount) || amount <= 0) return false;
    if (this.current.claimedRewardIds.includes(transactionId)) {
      return false;
    }
    this.commit((draft) => {
      draft.coins += Math.floor(amount);
      draft.lifetimeAuraEarned += Math.floor(amount);
      draft.claimedRewardIds.push(transactionId);
    });
    return true;
  }

  settleWeeklyWin(week: number, stage: number, rivalIndex: number, now = Date.now()): number {
    const tournament = getWeeklyTournament(now);
    const points = WEEKLY_REWARDS[stage];
    if (tournament.week !== week || !points || tournament.rivals[stage] !== rivalIndex ||
        (this.current.weeklyTournament?.week ?? 0) > week || weeklyWins(this.current.weeklyTournament, week) !== stage) return 0;
    this.commit(draft => {
      draft.weeklyTournament = { week, wins: stage + 1 };
      draft.coins += points;
      draft.lifetimeAuraEarned += points;
    });
    return points;
  }

  settleTournamentMatch(matchId: string, rivalIndex: number, won: boolean, oneShot: boolean, crit: boolean) {
    const rival = TOURNAMENT_LADDER[rivalIndex];
    const transactionId = `match_payout_${matchId}`;
    if (!matchId || !rival || rivalIndex > this.current.highestTournamentOpponent
      || this.current.claimedRewardIds.includes(transactionId)) return null;
    const reward = calculateTournamentReward(this.current, rival, won, oneShot, crit, getLocalDayKey());
    const unlockedNewDesk = won && rivalIndex >= 7 && !this.current.unlockedDeskIds.includes('exam_slate')
      ? 'Exam Slate Table' : undefined;
    this.commit((draft) => {
      draft.coins += reward.totalCoins;
      draft.lifetimeAuraEarned += reward.totalCoins;
      draft.claimedRewardIds.push(transactionId);
      draft.matchesSinceInterstitial++;
      draft.pendingDoubleOffer = reward.doubleCoinsBonus > 0
        ? { matchId, points: reward.doubleCoinsBonus } : undefined;
      draft.defeatedRivals = reward.nextRivals;
      if (won) {
        draft.tournamentWins++;
        draft.currentWinStreak++;
        draft.bestWinStreak = Math.max(draft.bestWinStreak, draft.currentWinStreak);
        if (rivalIndex < TOURNAMENT_LADDER.length - 1) {
          draft.highestTournamentOpponent = Math.max(draft.highestTournamentOpponent, rivalIndex + 1);
          draft.selectedOpponentIndex = rivalIndex + 1;
        }
        if (unlockedNewDesk) draft.unlockedDeskIds.push('exam_slate');
      } else {
        draft.currentWinStreak = 0;
      }
    });
    return { ...reward, unlockedNewDesk };
  }

  claimTournamentDouble(matchId: string, points: number): boolean {
    const today = getLocalDayKey();
    const transactionId = `double_coins_${matchId}`;
    const offer = this.current.pendingDoubleOffer;
    if (!offer || offer.matchId !== matchId || offer.points !== points || !canDoubleToday(this.current, today)
      || !Number.isSafeInteger(this.current.lifetimeAuraEarned + offer.points)) return false;
    this.commit((draft) => {
      draft.dailyDoubleCount = draft.dailyDoubleDay === today ? draft.dailyDoubleCount + 1 : 1;
      draft.dailyDoubleDay = today;
      draft.coins += points;
      draft.lifetimeAuraEarned += points;
      draft.claimedRewardIds.push(transactionId);
      draft.pendingDoubleOffer = undefined;
    });
    return true;
  }

  buyPen(penId: string): boolean {
    const pen = PENS.find((item) => item.id === penId);
    const profile = this.current;
    if (!pen || profile.unlockedPens.includes(penId) || profile.coins < pen.unlockCoins
      || !isPenPurchaseUnlocked(profile, pen)) return false;
    this.commit((draft) => {
      draft.coins -= pen.unlockCoins;
      draft.unlockedPens.push(penId);
      draft.equippedPenId = penId;
    });
    return true;
  }

  upgradePen(penId: string, part: PenUpgradePart, expectedLevel: number): boolean {
    const profile = this.current;
    if (!profile.unlockedPens.includes(penId)) return false;
    const level = getPenUpgradeLevel(profile, penId, part);
    const cost = getPenUpgradeCost(part, level);
    if (level !== expectedLevel || cost === undefined || profile.coins < cost) return false;
    this.commit((draft) => {
      draft.coins -= cost;
      const levels = part === 'grip' ? draft.penGripLevels : draft.penMastery;
      levels[penId] = level + 1;
    });
    return true;
  }

  resetAll(): ProfileV1 {
    const fresh = createDefaultProfile();
    this.current = fresh;
    this.persistSync(fresh);
    void writeToIDB(fresh);
    this.emit();
    return fresh;
  }
}

export const profileRepo = new ProfileRepository();

export function offlineProgress(profile: ProfileV1) {
  const { revision, muted, reducedMotion, adMetrics, matchesSinceInterstitial, lastInterstitialAt,
    pendingReward, pendingDoubleOffer, ...progress } = profile;
  const ordered = (levels: Record<string, number>) =>
    Object.fromEntries(Object.entries(levels).sort(([a], [b]) => a.localeCompare(b)));
  return { ...progress, penMastery: ordered(progress.penMastery), penGripLevels: ordered(progress.penGripLevels) };
}

export function normalizedOfflineProgress(raw: unknown) {
  const profile = sanitizeProfile(raw);
  return profile ? offlineProgress(profile) : null;
}

const activeSlotKey = 'pen_fight_active_save_slot';
const localSlotPrefix = 'pen_fight_save_slot_';

export function currentOfflineSlot(): string {
  try {
    const active = localStorage.getItem(activeSlotKey);
    if (active) return active;
    // Older installs have only the cloud marker. Keep their existing progress.
    const previous = JSON.parse(localStorage.getItem('pen_fight_offline_backup_marker') ?? 'null');
    if (typeof previous?.slot === 'string' && /^[a-f0-9]{64}$/.test(previous.slot)) return previous.slot;
  } catch { /* Older or unavailable storage. */ }
  return 'guest';
}

export function switchOfflineSlot(slot: string, cloud: unknown, carryGuest = false): boolean {
  const current = currentOfflineSlot();
  if (current === slot) return true;
  try {
    const stored = localStorage.getItem(localSlotPrefix + slot);
    const local = stored ? normalizedOfflineProgress(JSON.parse(stored)) : null;
    const outgoing = offlineProgress(profileRepo.get());
    const incoming = local ?? normalizedOfflineProgress(cloud)
      ?? (carryGuest && current === 'guest' ? outgoing : offlineProgress(createDefaultProfile()));
    localStorage.setItem(localSlotPrefix + current, JSON.stringify(outgoing));
    localStorage.setItem(activeSlotKey, slot);
    return profileRepo.restoreOfflineProgress(incoming);
  } catch { return false; }
}
