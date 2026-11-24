import React, { useEffect, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Crown,
  Gem,
  PenLine,
  Play,
  Sliders,
  Swords,
  Trophy,
  Users,
  Settings,
  Wrench,
} from 'lucide-react';
import { adService } from '../game/ads/adService';
import { AD_QA_ENABLED } from '../game/ads/adQa';
import { getOpponentByIndex, getPenById, TOURNAMENT_LADDER } from '../game/content';
import { MatchMode, ProfileV1 } from '../game/types';
import { GameLogo } from './GameLogo';
import { PWAInstallButton } from './PWAComponents';
import { RankedHome } from './RankedViews';
import type { RankedProfile } from '../game/ranking';

interface TitleScreenProps {
  profile: ProfileV1;
  trialPenId: string | null;
  bannerInset: number;
  onStartMatch: (mode: MatchMode, opponentIndex: number) => void;
  onFindOnlineMatch: () => void;
  onOpenLocker: () => void;
  onOpenPublisher: () => void;
  onOpenSettings: () => void;
  onSelectOpponent: (idx: number) => void;
  onOpenProgress: () => void;
  rankedProfile: RankedProfile | null;
  onOpenRank: () => void;
  onFindRankedMatch: () => void;
  onOpenWeekly: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  profile,
  trialPenId,
  bannerInset,
  onStartMatch,
  onFindOnlineMatch,
  onOpenLocker,
  onOpenPublisher,
  onOpenSettings,
  onSelectOpponent,
  onOpenProgress,
  rankedProfile, onOpenRank, onFindRankedMatch, onOpenWeekly,
}) => {
  const [mode, setMode] = useState<MatchMode>('tournament');
  const [requiresPrivacyChoices, setRequiresPrivacyChoices] = useState(false);

  useEffect(() => adService.subscribePrivacyOptions(setRequiresPrivacyChoices), []);

  const opponent = getOpponentByIndex(profile.selectedOpponentIndex);
  const activePen = getPenById(trialPenId ?? profile.equippedPenId);
  const canStepPrev = profile.selectedOpponentIndex > 0;
  const canStepNext = profile.selectedOpponentIndex < profile.highestTournamentOpponent;

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-gradient-to-b from-[#0B1120]/85 via-[#0B1120]/40 to-[#0B1120]/95">
      <header className="safe-top mx-auto flex w-full max-w-[410px] shrink-0 items-center justify-between gap-3 px-5 pb-2">
        <div className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-[#241E19]/95 px-3 py-2 text-amber-200">
          <Gem className="h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="leading-tight">
            <span className="font-mono-num block text-base font-bold">{profile.coins.toLocaleString()}</span>
            <span className="block text-[10px] font-semibold">Aura Points</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-700/80 bg-[#111827]/90 text-slate-200 hover:bg-slate-800 transition"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button type="button" onClick={onOpenProgress}
            className="flex h-11 items-center gap-1.5 rounded-2xl border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-amber-200">
            <Trophy className="h-4 w-4" /> Progress
          </button>
          {AD_QA_ENABLED && (
            <button
              type="button"
              onClick={onOpenPublisher}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-950/70 px-3 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/70 transition whitespace-nowrap shrink-0"
            >
              <Sliders className="w-3.5 h-3.5" />
              AdMob
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[390px] flex-col justify-center gap-5 px-5 py-5 text-center [@media(max-height:650px)]:gap-3 [@media(max-height:650px)]:py-2">
          <div className="flex flex-col items-center gap-2 [@media(max-height:650px)]:[&_svg]:max-w-[215px]">
            <GameLogo />
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <PenLine className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
              {activePen.name}
              {trialPenId && <span className="text-yellow-300"> · Trial</span>}
            </p>
          </div>

          <div className="space-y-3 rounded-3xl border border-slate-700/80 bg-[#0D1727]/95 p-3.5 shadow-xl">
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#0B1120] p-1.5">
              <button
                type="button"
                onClick={() => setMode('tournament')}
                aria-pressed={mode === 'tournament'}
                className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition whitespace-nowrap ${
                  mode === 'tournament'
                    ? 'bg-sky-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Crown className="w-3.5 h-3.5" />
                Tournament
              </button>
              <button
                type="button"
                onClick={() => setMode('pass_and_play')}
                aria-pressed={mode === 'pass_and_play'}
                className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition whitespace-nowrap ${
                  mode === 'pass_and_play'
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Local Duel
              </button>
            </div>

            {/* Opponent Selector Strip (Tournament) */}
            {mode === 'tournament' ? (
              <div className="px-0.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={!canStepPrev}
                    onClick={() => onSelectOpponent(profile.selectedOpponentIndex - 1)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-200 disabled:opacity-30 hover:bg-slate-700 transition"
                    aria-label="Previous opponent"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex flex-col items-center min-w-0">
                    <span className="truncate font-display text-base font-bold text-white">
                      {opponent.name}
                    </span>
                    <span className="mt-0.5 truncate text-[10px] font-medium text-slate-400">
                      {opponent.isBoss ? 'Boss · ' : ''}Level {opponent.index + 1}/{TOURNAMENT_LADDER.length}
                    </span>
                    <span className="mt-0.5 text-[10px] font-medium text-sky-200">{getPenById(opponent.penId).name}</span>
                  </div>
                  <button
                    type="button"
                    disabled={!canStepNext}
                    onClick={() => onSelectOpponent(profile.selectedOpponentIndex + 1)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-200 disabled:opacity-30 hover:bg-slate-700 transition"
                    aria-label="Next unlocked opponent"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <p className="py-1 text-xs leading-relaxed text-slate-300">
                Two players, one phone. First to two rounds wins.
              </p>
            )}

            {/* Dominant Single Primary Play CTA */}
            <button
              type="button"
              onClick={() => onStartMatch(mode, opponent.index)}
              className="flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 font-display text-lg font-extrabold text-slate-950 shadow-[0_6px_18px_rgba(251,191,36,0.22)] hover:bg-amber-200 active:scale-[0.98] transition"
            >
              <Play className="w-5 h-5 fill-slate-950" />
              {mode === 'tournament' ? 'Start Match' : 'Start Local Duel'}
            </button>
          </div>

          <RankedHome profile={rankedProfile} onDetails={onOpenRank} onQueue={onFindRankedMatch} />

          <button type="button" onClick={onOpenWeekly}
            className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-[#292219] px-4 text-left text-sm font-bold text-amber-100 hover:bg-[#362c20]">
            <span className="flex items-center gap-2"><CalendarDays className="size-4 text-amber-300" aria-hidden="true" /> Weekly Tournament</span>
            <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
          </button>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onFindOnlineMatch}
              className="flex min-h-13 items-center justify-center gap-2 rounded-2xl border border-sky-700/80 bg-sky-950/95 px-2 text-sm font-bold text-sky-100 hover:bg-sky-900"
            >
              <Swords className="h-4 w-4 shrink-0 text-sky-300" />
              Guest 1v1
            </button>
            <button
              type="button"
              onClick={onOpenLocker}
              className="flex min-h-13 items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-[#172235]/95 px-2 text-sm font-bold text-white hover:bg-slate-700 active:scale-[0.98] transition"
            >
              <Wrench className="h-4 w-4 shrink-0 text-amber-300" />
              Pen Garage
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[11px] font-medium text-slate-400">
            <span>{profile.tournamentWins} wins</span>
            <span>Best streak {profile.bestWinStreak}</span>
            {requiresPrivacyChoices && (
              <button type="button" onClick={() => void adService.openPrivacyOptions()}
                className="py-1 text-slate-300 underline underline-offset-2">
                Privacy choices
              </button>
            )}
            <PWAInstallButton />
          </div>
        </div>
      </div>

      <div className="safe-bottom px-3 pb-2" aria-hidden="true">
        <div style={{ height: Math.max(12, bannerInset) }} />
      </div>
    </div>
  );
};
