import { DESKS, PENS, TOURNAMENT_LADDER } from './content';
import { AdMetrics, PendingRewardRecord, ProfileV1, RewardPlacement } from './types';

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
    unlockedDeskIds: [DESKS[0].id],
    equippedDeskId: DESKS[0].id,
    highestTournamentOpponent: 0,
    selectedOpponentIndex: 0,
    tournamentWins: 0,
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
    adMetrics: createDefaultAdMetrics(),
  };
}

const VALID_PEN_IDS = new Set(PENS.map((p) => p.id));
const VALID_DESK_IDS = new Set(DESKS.map((d) => d.id));

function sanitizeProfile(raw: unknown): ProfileV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== 1) return null;

  const coins = Number(obj.coins);
  if (!Number.isFinite(coins) || coins < 0 || coins > 10_000_000) return null;

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

  const penMastery: Record<string, number> = {};
  if (obj.penMastery && typeof obj.penMastery === 'object') {
    for (const [k, v] of Object.entries(obj.penMastery as Record<string, unknown>)) {
      if (VALID_PEN_IDS.has(k)) {
        const lvl = Math.floor(Number(v));
        if (Number.isFinite(lvl) && lvl >= 0 && lvl <= 5) {
          penMastery[k] = lvl;
        }
      }
    }
  }

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

  return {
    ...base,
    revision: Math.max(1, Math.floor(Number(obj.revision) || 1)),
    coins: Math.floor(coins),
    unlockedPens,
    equippedPenId,
    penMastery,
    unlockedDeskIds,
    equippedDeskId,
    highestTournamentOpponent,
    selectedOpponentIndex,
    tournamentWins: Math.max(0, Math.floor(Number(obj.tournamentWins) || 0)),
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
      draft.claimedRewardIds.push(transactionId);
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
