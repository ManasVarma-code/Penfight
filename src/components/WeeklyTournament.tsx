import { CalendarDays, Check, ChevronRight, Gem, Lock, Trophy, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getOpponentByIndex, getPenById } from '../game/content';
import type { ProfileV1 } from '../game/types';
import { getWeeklyTournament, weeklyWins, WEEKLY_REWARDS } from '../game/weeklyTournament';
import { PenPreviewSvg } from './GameLogo';

export function WeeklyTournament({ profile, onClose, onPlay }: {
  profile: ProfileV1; onClose: () => void; onPlay: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const tournament = getWeeklyTournament(now);
  const wins = weeklyWins(profile.weeklyTournament, tournament.week);
  const complete = wins === WEEKLY_REWARDS.length;
  const hours = Math.ceil((tournament.endsAt - now) / 3_600_000);
  const remaining = hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h`;
  const total = WEEKLY_REWARDS.reduce((sum, value) => sum + value, 0);

  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#070b14]/90 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="weekly-title"
      onKeyDown={event => { if (event.key === 'Escape') onClose(); }}
      className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-3xl border border-amber-500/25 bg-[#111b2a] p-5 shadow-2xl">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
            <CalendarDays className="size-3.5" aria-hidden="true" /> Resets in {remaining}
          </p>
          <h2 id="weekly-title" className="mt-1 font-display text-2xl font-extrabold text-white">Weekly Tournament</h2>
        </div>
        <button autoFocus type="button" onClick={onClose} aria-label="Close weekly tournament"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-800 text-slate-200"><X className="size-5" /></button>
      </header>
      <p className="mt-3 text-sm text-slate-300">Beat three rivals in order for {total.toLocaleString()} Aura Points. Retry any match until the reset.</p>
      <ol className="mt-4 space-y-2">
        {tournament.rivals.map((index, stage) => {
          const rival = getOpponentByIndex(index);
          const pen = getPenById(rival.penId);
          return <li key={index} className={`flex items-center gap-3 rounded-xl border p-3 ${stage === wins ? 'border-amber-400/50 bg-[#2d251b]' : 'border-slate-700/70 bg-slate-950/45'}`}>
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-800 text-amber-200">
              {stage < wins ? <Check className="size-4" aria-label="Cleared" /> : stage === wins
                ? <ChevronRight className="size-4" aria-label="Next match" /> : <Lock className="size-3.5" aria-label="Locked" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{rival.name}</p>
              <p className="flex items-center gap-1 text-xs text-amber-200"><Gem className="size-3" aria-hidden="true" /> {WEEKLY_REWARDS[stage].toLocaleString()} AP</p>
            </div>
            <PenPreviewSvg pen={pen} className="h-8 w-20 shrink-0" />
          </li>;
        })}
      </ol>
      <button type="button" onClick={complete ? onClose : onPlay}
        className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 text-sm font-extrabold text-slate-950">
        <Trophy className="size-4" aria-hidden="true" />
        {complete ? 'All rewards earned' : wins ? 'Continue tournament' : 'Enter tournament'}
      </button>
    </section>
  </div>;
}
