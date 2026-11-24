import { Award, BarChart3, Check, Gem, Lock, Medal, Shield, Swords, Trophy, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getRivalStyle } from '../game/ai/aiController';
import { PENS, TOURNAMENT_LADDER } from '../game/content';
import { getPenRequirement, getTournamentAchievements, GOLD_PEN_ID } from '../game/progression';
import type { ProfileV1 } from '../game/types';
import { PenPreviewSvg } from './GameLogo';
import { RankedProgress } from './RankedViews';
import type { RankedProfile } from '../game/ranking';
import type { useOfflineBackup } from '../game/useOfflineBackup';

const boards = { ranked: 'Ranked Aura', tournament: 'Tournament Legends', wealth: 'Wealthiest Players' } as const;
const tabs = { ranked: 'Ranked', tournament: 'Tournament', wealth: 'Wealth' } as const;
type Board = keyof typeof boards;
interface Leader {
  displayName: string;
  rank: string;
  rating: number;
  equippedPen: string;
  completed: number;
  lifetimeAuraEarned: number;
  achievements?: string[];
}

const previousRows = new Map<Board, { rows: Leader[]; refreshedAt: number }>();
const CACHE_MS = 60_000;
const origin = (import.meta.env.VITE_ONLINE_SERVER_URL ?? '').replace(/\/+$/, '');

type ProgressView = 'overview' | 'rivals' | 'rank' | 'rankings';

export function ProgressModal({ profile, onClose, initialView, rankedProfile, backup, onSignIn, onSignOut }: {
  profile: ProfileV1; onClose: () => void; initialView: ProgressView; rankedProfile: RankedProfile | null;
  backup: ReturnType<typeof useOfflineBackup>;
  onSignIn: () => void; onSignOut: () => void;
}) {
  const [view, setView] = useState<ProgressView>(initialView);
  const [selectedBoard, setSelectedBoard] = useState<Board>('ranked');
  const board = view === 'rankings' ? selectedBoard : null;
  const [requestId, setRequestId] = useState(0);
  const [loaded, setLoaded] = useState<{ board: Board; requestId: number; unavailable: boolean }>();
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
    };
  }, []);
  const entry = board ? previousRows.get(board) : undefined;
  const rows = entry?.rows;
  const unavailable = loaded?.board === board && loaded?.requestId === requestId && loaded.unavailable;
  useEffect(() => {
    if (!board) return;
    const cached = previousRows.get(board);
    if (cached && Date.now() - cached.refreshedAt < CACHE_MS) return;
    const request = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => {
      setLoaded({ board, requestId, unavailable: true });
      request.abort();
    }, 5_000);
    void fetch(`${origin}/api/online/leaderboards/${board}`, { signal: request.signal })
      .then(response => {
        if (!response.ok) throw new Error('Leaderboard unavailable');
        return response.json();
      })
      .then(data => {
        if (!request.signal.aborted) {
          if (!Array.isArray(data.rows)) throw new Error('Invalid leaderboard');
          previousRows.set(board, { rows: data.rows, refreshedAt: Date.now() });
          setLoaded({ board, requestId, unavailable: false });
        }
      })
      .catch(() => { if (active && !request.signal.aborted) setLoaded({ board, requestId, unavailable: true }); })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      request.abort();
      window.clearTimeout(timeout);
    };
  }, [board, requestId]);


  const defeated = new Set(profile.defeatedRivals);
  const achievements = getTournamentAchievements(profile.defeatedRivals, profile.unlockedPens.includes(GOLD_PEN_ID));
  const equipped = PENS.find(pen => pen.id === profile.equippedPenId) ?? PENS[0];
  const rarest = [...PENS].reverse().find(pen => profile.unlockedPens.includes(pen.id));
  const nextPen = PENS.find(pen => !profile.unlockedPens.includes(pen.id));
  const nextRequirement = nextPen ? getPenRequirement(nextPen.requiredTournamentWins, profile.defeatedRivals) : null;
  const nextRival = TOURNAMENT_LADDER[profile.highestTournamentOpponent];
  const completed = defeated.size === TOURNAMENT_LADDER.length;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#050811]/85 sm:items-center sm:p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="progress-title"
        onKeyDown={event => {
          if (event.key === 'Escape') onClose();
          if (event.key !== 'Tab') return;
          const buttons = event.currentTarget.querySelectorAll('button:not(:disabled)');
          const edge = event.shiftKey ? buttons[0] : buttons[buttons.length - 1];
          if (document.activeElement !== edge) return;
          event.preventDefault();
          const target = event.shiftKey ? buttons[buttons.length - 1] : buttons[0];
          if (target instanceof HTMLElement) target.focus();
        }}
        className="flex h-[min(86dvh,45rem)] w-full max-w-md flex-col overflow-hidden rounded-t-[1.75rem] border border-slate-700 bg-[#0c1220] text-slate-100 shadow-2xl sm:rounded-[1.75rem]">
        <header className="flex items-center justify-between px-5 pb-3 pt-4">
          <h2 id="progress-title" className="font-display text-2xl font-black">Your progress</h2>
          <button ref={closeButton} type="button" onClick={onClose} aria-label="Close progress"
            className="grid size-11 place-items-center rounded-xl border border-slate-700 bg-slate-900 text-slate-200">
            <X className="size-5" />
          </button>
        </header>
        <nav className="mx-5 grid grid-cols-4 gap-1 rounded-xl bg-[#080e1a] p-1" aria-label="Progress sections">
          {([
            ['overview', 'Overview', UserRound],
            ['rivals', 'Rivals', Swords],
            ['rank', 'Rank', Shield],
            ['rankings', 'Rankings', BarChart3],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-1 text-xs font-bold text-slate-400 aria-pressed:bg-[#1b2a40] aria-pressed:text-cyan-200">
              <Icon className="size-3.5" aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>
        <div key={view} className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {view === 'rank' && <RankedProgress profile={rankedProfile} onSignIn={onSignIn} onSignOut={onSignOut} />}
          {view === 'overview' && <div className="space-y-5">
            <section className="rounded-2xl border border-slate-700 bg-[#121c2d] p-4">
              <h3 className="text-sm font-bold text-white">Cloud save</h3>
              <p role="status" className="mt-1 text-xs text-slate-300">
                {backup.status === 'saved' ? (backup.hasCloud ? 'Progress backed up.' : 'Ready to back up your progress.')
                  : backup.status === 'checking' ? 'Checking your save…'
                    : backup.status === 'saving' ? 'Backing up your progress…'
                    : backup.status === 'offline' ? 'Saved on this device. Cloud backup will retry.'
                      : backup.status === 'conflict' ? 'Choose which progress to keep for this account.'
                        : 'Sign in to back up your Tournament progress.'}
              </p>
              {backup.status === 'idle' && <button type="button" onClick={onSignIn}
                className="mt-2 min-h-11 text-sm font-bold text-cyan-200">Sign in with Google</button>}
              {backup.status === 'conflict' && <div className="mt-2 flex flex-wrap gap-3">
                {backup.hasCloud && <button type="button" className="min-h-11 text-sm font-bold text-cyan-200"
                  onClick={() => {
                    if (window.confirm('Replace the progress on this device with your cloud save?')) backup.resolve('cloud');
                  }}>Use cloud save</button>}
                <button type="button" className="min-h-11 text-sm font-bold text-cyan-200"
                  onClick={() => {
                    if (!backup.hasCloud || window.confirm('Replace this account’s cloud save with the progress on this device?')) backup.resolve('device');
                  }}>Back up this device</button>
              </div>}
            </section>
            <section className="overflow-hidden rounded-2xl border border-sky-900/80 bg-[radial-gradient(ellipse_at_top_right,#173852,transparent_72%),linear-gradient(140deg,#111b2d,#0b1322)] p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-sky-300">Equipped pen</p>
                  <h3 className="mt-1 font-display text-xl font-bold text-white">{equipped.name}</h3>
                  {rarest && rarest.id !== equipped.id && <p className="mt-1 text-[11px] text-slate-300">Rarest owned · {rarest.name}</p>}
                </div>
                <PenPreviewSvg pen={equipped} className="h-12 w-24 shrink-0 drop-shadow-lg" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-sky-900/70 pt-3">
                <div>
                  <p className="flex items-center gap-1.5 font-display text-xl font-bold text-amber-200">
                    <Gem className="size-4" aria-hidden="true" />{profile.lifetimeAuraEarned.toLocaleString()}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-300">Lifetime Aura Points</p>
                </div>
                <div className="border-l border-sky-900/70 pl-3">
                  <p className="font-display text-xl font-bold text-white">{defeated.size}<span className="text-sm text-slate-400"> / {TOURNAMENT_LADDER.length}</span></p>
                  <p className="mt-0.5 text-[11px] text-slate-300">Rivals defeated</p>
                </div>
              </div>
            </section>

            {nextPen && nextRequirement && <section className="rounded-2xl border border-slate-700/80 bg-[#121c2d] p-4">
              <header className="flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-200"><Lock className="size-3" aria-hidden="true" /> Next pen unlock</p>
                  <h3 className="mt-1 font-display text-lg font-bold">{nextPen.name}</h3>
                </div>
                <PenPreviewSvg pen={nextPen} className="h-10 w-20 shrink-0" />
              </header>
              <div className="mt-3 space-y-3">
                <ProgressMeter label={nextRequirement.label} value={nextRequirement.progress} goal={nextPen.requiredTournamentWins} />
                <ProgressMeter label="Aura Points available" value={profile.coins} goal={nextPen.unlockCoins} />
              </div>
            </section>}

            <section>
              <h3 className="mb-2.5 flex items-center gap-2 font-display text-base font-bold"><Medal className="size-4 text-amber-300" /> Achievements</h3>
              <ul className="grid grid-cols-2 gap-2">{achievements.map(achievement => (
                <li key={achievement.title} className={`flex min-h-12 items-center gap-2 rounded-xl border px-2.5 py-2 text-[11px] font-semibold leading-tight ${achievement.earned
                  ? 'border-amber-700/40 bg-[#282017] text-amber-200' : 'border-slate-800 bg-[#101827] text-slate-400'}`}>
                  {achievement.earned ? <Award className="size-4 shrink-0" aria-label="Earned" /> : <Lock className="size-3.5 shrink-0" aria-label="Locked" />}
                  {achievement.title}
                </li>
              ))}</ul>
            </section>
          </div>}
          {view === 'rivals' && <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-cyan-900 bg-[#14263a] p-4">
              <Swords className="size-6 shrink-0 text-cyan-200" aria-hidden="true" />
              <div><p className="text-xs font-bold text-cyan-200">{completed ? 'Tournament complete' : 'Next rival'}</p>
                <h3 className="font-display text-lg font-bold">{completed ? `${defeated.size} rivals defeated` : nextRival.name}</h3>
              </div>
            </div>
            <ol className="divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-[#101827]">
              {TOURNAMENT_LADDER.map(rival => {
                const won = defeated.has(rival.index);
                return <li key={rival.index} className="flex min-h-14 items-center gap-3 px-3 py-2">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-lg text-xs font-bold ${rival.isBoss ? 'bg-[#302518] text-amber-200' : 'bg-slate-900 text-slate-300'}`}>{rival.index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{rival.name}</p>
                    <p className="text-[11px] text-slate-400">{rival.isBoss ? 'Boss · ' : ''}{getRivalStyle(rival.index)}</p>
                  </div>
                  {won ? <Check className="size-4 text-emerald-300" aria-label="Defeated" />
                    : rival.index === nextRival.index ? <span className="text-xs font-bold text-cyan-200">Next</span>
                    : <Lock className="size-3.5 text-slate-400" aria-label="Locked" />}
                </li>;
              })}
            </ol>
          </div>}
          {view === 'rankings' && <div className="space-y-4">
            <div className="flex gap-2" role="group" aria-label="Leaderboard categories">
              {(Object.keys(tabs) as Board[]).map(key => (
                <button key={key} type="button" aria-pressed={board === key} onClick={() => setSelectedBoard(key)}
                  className="min-h-10 rounded-full border border-slate-700 px-3 text-xs font-bold text-slate-300 aria-pressed:border-amber-500/70 aria-pressed:bg-[#302518] aria-pressed:text-amber-100">{tabs[key]}</button>
              ))}
            </div>
            <h3 className="font-display text-lg font-bold">{boards[selectedBoard]}</h3>
            {unavailable && rows && <p role="status" className="text-xs text-slate-300">Showing last loaded rankings.</p>}
            {rows?.length ? <ol key={board} className="divide-y divide-slate-800 overflow-hidden rounded-2xl border border-slate-800 bg-[#101827]">
              {rows.map((row, index) => <li key={index} className="flex items-center gap-3 px-3 py-3">
                <span className={`grid size-7 shrink-0 place-items-center rounded-lg font-mono-num text-xs font-bold ${index < 3 ? 'bg-[#302518] text-amber-200' : 'bg-slate-800 text-slate-300'}`}>{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{row.displayName}</p>
                  <p className="truncate text-[11px] text-slate-400">{row.rank} · {PENS.find(pen => pen.id === row.equippedPen)?.name ?? 'Classic Ballpoint'}</p>
                  {!!row.achievements?.length && <p className="mt-0.5 text-[10px] text-amber-200">{row.achievements.join(' · ')}</p>}
                </div>
                <span className="shrink-0 font-mono-num text-xs font-bold text-cyan-200">{selectedBoard === 'ranked' ? row.rating.toLocaleString()
                  : selectedBoard === 'tournament' ? `${row.completed} clears` : `${row.lifetimeAuraEarned.toLocaleString()} AP`}</span>
              </li>)}
            </ol> : <div className="rounded-2xl border border-slate-800 bg-[#101827] px-4 py-7 text-center">
              <Trophy className="mx-auto mb-2 size-6 text-slate-400" aria-hidden="true" />
              <p role="status" className="text-sm text-slate-300">{unavailable ? 'Rankings are temporarily unavailable.' : rows ? 'No verified entries yet.' : 'Loading rankings…'}</p>
              {unavailable && <button type="button" onClick={() => setRequestId(id => id + 1)}
                className="mt-3 min-h-11 rounded-xl bg-[#1b3043] px-5 text-sm font-bold text-cyan-100">Retry</button>}
            </div>}
          </div>}
        </div>
      </section>
    </div>
  );
}

function ProgressMeter({ label, value, goal }: { label: string; value: number; goal: number }) {
  const progress = Math.min(value, goal);
  return (
    <div>
      <div className="flex items-end justify-between gap-2 text-xs text-slate-300">
        <span>{label}</span>
        <span className="shrink-0 font-mono-num text-[11px] font-bold text-cyan-100">{progress.toLocaleString()} / {goal.toLocaleString()}</span>
      </div>
      <progress aria-label={label} value={progress} max={goal}
        className="mt-1 block h-1.5 w-full appearance-none overflow-hidden rounded bg-slate-800 [&::-webkit-progress-bar]:bg-slate-800 [&::-webkit-progress-value]:rounded [&::-webkit-progress-value]:bg-cyan-400 [&::-moz-progress-bar]:bg-cyan-400" />
    </div>
  );
}

