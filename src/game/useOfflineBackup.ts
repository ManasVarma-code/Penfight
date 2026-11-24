import { useEffect, useRef, useState } from 'react';
import { createDefaultProfile, currentOfflineSlot, normalizedOfflineProgress, offlineProgress, profileRepo, switchOfflineSlot } from './persistence';

const origin = (import.meta.env.VITE_ONLINE_SERVER_URL ?? '').trim().replace(/\/+$/, '');
const endpoint = `${origin}/api/online/competition/offline-backup`;
const markerKey = 'pen_fight_offline_backup_marker';
type Progress = ReturnType<typeof offlineProgress>;
type Backup = { version: number; progress: Progress };
type RemoteSave = { slot: string; backup: Backup | null };
type Marker = { slot: string; version: number; contents: string };
type Choice = 'cloud' | 'device';
type Status = 'checking' | 'saving' | 'saved' | 'offline' | 'conflict' | 'idle';
const empty = JSON.stringify(offlineProgress(createDefaultProfile()));

function readMarker(): Marker | null {
  try {
    const slot = currentOfflineSlot();
    const saved = JSON.parse(localStorage.getItem(`${markerKey}_${slot}`) ?? localStorage.getItem(markerKey) ?? 'null');
    return saved?.slot === slot ? saved : null;
  }
  catch { return null; }
}

function hasProgress(progress: Progress) {
  return progress.coins > 0 || progress.lifetimeAuraEarned > 0 || progress.tournamentWins > 0 ||
    progress.highestTournamentOpponent > 0 || progress.unlockedPens.length > 1 ||
    progress.unlockedDeskIds.length > 1 || progress.claimedRewardIds.length > 0 ||
    Object.values(progress.penMastery).some(level => level > 0) ||
    Object.values(progress.penGripLevels).some(level => level > 0);
}

export function useOfflineBackup(token: string | null, ready: boolean, atMenu: boolean) {
  const [status, setStatus] = useState<Status>('idle');
  const [hasCloud, setHasCloud] = useState(false);
  const [readyToken, setReadyToken] = useState<string | null>(null);
  const resolve = useRef<(choice: Choice) => void>(() => {});
  const flush = useRef<() => Promise<void>>(async () => {});
  const canRestore = useRef(atMenu);
  canRestore.current = atMenu;

  useEffect(() => {
    if (!token || !ready) return;
    let stopped = false;
    let busy = false;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | undefined;
    let remote: RemoteSave | undefined;
    let conflict = false;
    let marker = readMarker();
    let lastObserved = JSON.stringify(offlineProgress(profileRepo.get()));
    const statusIfActive = (next: Status) => { if (!stopped) setStatus(next); };
    statusIfActive('checking');
    setHasCloud(false);

    function remember(contents: string) {
      if (!remote) return;
      marker = { slot: remote.slot, version: remote.backup?.version ?? 0, contents };
      try { localStorage.setItem(`${markerKey}_${remote.slot}`, JSON.stringify(marker)); } catch { /* Keep this session synced. */ }
    }

    async function send(method: 'GET' | 'PUT', body?: unknown) {
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort(), 12_000);
      try {
        return await fetch(endpoint, {
          method, signal: controller.signal,
          headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
      } finally { clearTimeout(timeout); request = undefined; }
    }

    let running: Promise<void> | undefined;
    function run(choice?: Choice) {
      if (running) return running;
      running = sync(choice).finally(() => { running = undefined; });
      return running;
    }

    function schedule(delay = 300) {
      if (stopped || conflict) return;
      clearTimeout(timer);
      timer = setTimeout(() => { void run(); }, delay);
    }

    async function sync(choice?: Choice) {
      if (stopped || busy || (conflict && !choice)) return;
      if (document.visibilityState === 'hidden' && !choice) return;
      busy = true;
      try {
        if (!remote) {
          const response = await send('GET');
          if (!response.ok) throw new Error('Backup unavailable');
          const data: RemoteSave = await response.json();
          if (stopped) return;
          if (!/^[a-f0-9]{64}$/.test(data.slot)) throw new Error('Invalid account slot');
          if (data.backup) {
            const progress = normalizedOfflineProgress(data.backup.progress);
            if (!progress || !Number.isSafeInteger(data.backup.version) || data.backup.version <= 0) {
              throw new Error('Invalid cloud backup');
            }
            data.backup.progress = progress;
          }
          remote = data;
          setHasCloud(!!data.backup);
        }
        if (currentOfflineSlot() !== remote.slot) {
          if (!canRestore.current) { schedule(3000); return; }
          if (!switchOfflineSlot(remote.slot, remote.backup?.progress, !remote.backup)) throw new Error('Local storage unavailable');
          try {
            marker = JSON.parse(localStorage.getItem(`${markerKey}_${remote.slot}`) ?? 'null');
          } catch { marker = null; }
        }
        setReadyToken(token);
        const local = offlineProgress(profileRepo.get());
        const contents = JSON.stringify(local);
        const cloud = remote.backup;
        const cloudContents = cloud ? JSON.stringify(cloud.progress) : empty;
        const sameAccount = marker?.slot === remote.slot;
        const restore = cloud && (choice === 'cloud' || !hasProgress(local) ||
          (sameAccount && marker?.contents === contents && marker?.version !== cloud.version));
        if (restore && contents !== cloudContents) {
          if (!canRestore.current && choice !== 'cloud') { schedule(3000); return; }
          remember(cloudContents);
          if (!profileRepo.restoreOfflineProgress(cloud.progress)) throw new Error('Invalid backup');
          conflict = false;
          statusIfActive('saved');
          return;
        }
        if (contents === cloudContents && (cloud || !hasProgress(local))) {
          remember(contents);
          conflict = false;
          statusIfActive('saved');
          return;
        }
        const version = cloud?.version ?? 0;
        if (choice !== 'device' && (cloud ? !sameAccount || marker?.version !== version : !!marker && !sameAccount)) {
          conflict = true;
          statusIfActive('conflict');
          return;
        }
        statusIfActive('saving');
        const response = await send('PUT', { version, progress: local });
        if (stopped) return;
        if (response.status === 409) {
          conflict = false;
          remote = undefined;
          schedule(0);
          return;
        }
        if (!response.ok) throw new Error('Backup unavailable');
        const data = await response.json();
        if (stopped) return;
        if (data.version !== version + 1) throw new Error('Invalid backup version');
        remote.backup = { version: data.version, progress: local };
        setHasCloud(true);
        remember(contents);
        conflict = false;
        statusIfActive('saved');
        if (JSON.stringify(offlineProgress(profileRepo.get())) !== contents) schedule();
      } catch {
        statusIfActive(conflict ? 'conflict' : 'offline');
        schedule(12_000);
      } finally { busy = false; }
    }

    const unsubscribe = profileRepo.subscribe(profile => {
      const contents = JSON.stringify(offlineProgress(profile));
      if (contents !== lastObserved) {
        lastObserved = contents;
        if (!conflict) statusIfActive('saving');
        schedule();
      }
    });
    const resume = () => {
      if (!busy && !conflict) remote = undefined;
      schedule(0);
    };
    resolve.current = choice => { void run(choice); };
    flush.current = async () => {
      if (running) await running;
      clearTimeout(timer);
      await run();
    };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    void run();
    return () => {
      stopped = true;
      clearTimeout(timer);
      request?.abort();
      unsubscribe();
      resolve.current = () => {};
      flush.current = async () => {};
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [token, ready]);

  return {
    status: token ? status : 'idle', hasCloud,
    ready: !!token && readyToken === token,
    resolve: (choice: Choice) => resolve.current(choice), saveNow: () => flush.current(),
  };
}
