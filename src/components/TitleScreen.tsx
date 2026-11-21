import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Play,
  Sliders,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { adService } from '../game/ads/adService';
import { getOpponentByIndex, getPenById, TOURNAMENT_LADDER } from '../game/content';
import { MatchMode, ProfileV1 } from '../game/types';
import { GameLogo } from './GameLogo';
import { PWAInstallButton, useOnlineStatus } from './PWAComponents';

interface TitleScreenProps {
  profile: ProfileV1;
  trialPenId: string | null;
  bannerVisible: boolean;
  onStartMatch: (mode: MatchMode, opponentIndex: number) => void;
  onFindOnlineMatch: () => void;
  onOpenLocker: () => void;
  onOpenPublisher: () => void;
  onToggleMute: () => void;
  onSelectOpponent: (idx: number) => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  profile,
  trialPenId,
  bannerVisible,
  onStartMatch,
  onFindOnlineMatch,
  onOpenLocker,
  onOpenPublisher,
  onToggleMute,
  onSelectOpponent,
}) => {
  const [mode, setMode] = useState<MatchMode>('tournament');
  const [requiresPrivacyChoices, setRequiresPrivacyChoices] = useState(false);
  const isOnline = useOnlineStatus();
  const adConfig = adService.getConfig();

  useEffect(() => adService.subscribePrivacyOptions(setRequiresPrivacyChoices), []);

  const opponent = getOpponentByIndex(profile.selectedOpponentIndex);
  const activePen = getPenById(trialPenId ?? profile.equippedPenId);
  const canStepPrev = profile.selectedOpponentIndex > 0;
  const canStepNext = profile.selectedOpponentIndex < profile.highestTournamentOpponent;

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-between bg-gradient-to-b from-[#0B1120]/80 via-[#0B1120]/35 to-[#0B1120]/95">
      {/* Top Quiet Stats & Audio Bar */}
      <div className="safe-top flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <Sparkles className="w-4 h-4 text-yellow-400 shrink-0" aria-hidden="true" />
          <div className="flex flex-col leading-tight text-yellow-300" aria-label={`${profile.coins.toLocaleString()} Aura Points`}>
            <span className="font-mono-num font-bold">{profile.coins.toLocaleString()}</span>
            <span className="text-[9px] whitespace-nowrap">Aura Points</span>
          </div>
          <span className="text-slate-500" aria-hidden="true">·</span>
          <span className="font-mono-num text-slate-300">
            {profile.tournamentWins} Wins
          </span>
          <span className="text-slate-500" aria-hidden="true">·</span>
          <span className="font-mono-num text-slate-400">
            Streak {profile.bestWinStreak}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleMute}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/80 bg-[#111827]/90 text-slate-200 hover:bg-slate-800 transition"
            aria-label={profile.muted ? 'Unmute sound' : 'Mute sound'}
          >
            {profile.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          {adConfig.showPublisherConsole && (
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
      </div>

      {/* Center Hero Title over Live Attract Desk */}
      <div className="flex flex-col items-center px-5 text-center my-auto">
        <GameLogo />

        {/* Clean Unboxed Equipped Status */}
        <p className="mt-2 text-xs font-medium text-slate-300">
          Equipped: <span className="text-white font-semibold">{activePen.name}</span>
          {trialPenId && <span className="text-yellow-300"> · Free Trial Ready</span>}
        </p>

        {/* Functional Mode Switcher (Segmented Control) */}
        <div className="mt-5 grid grid-cols-2 gap-1.5 w-full max-w-[310px] rounded-2xl bg-[#111827]/95 p-1.5 border border-slate-800">
          <button
            type="button"
            onClick={() => setMode('tournament')}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition whitespace-nowrap ${
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
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition whitespace-nowrap ${
              mode === 'pass_and_play'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            2P Duel
          </button>
        </div>

        {/* Opponent Selector Strip (Tournament) */}
        {mode === 'tournament' ? (
          <div className="mt-3 w-full max-w-[310px] rounded-2xl border border-slate-800 bg-[#111827]/92 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={!canStepPrev}
                onClick={() => onSelectOpponent(profile.selectedOpponentIndex - 1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-200 disabled:opacity-30 hover:bg-slate-700 transition"
                aria-label="Previous opponent"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex flex-col items-center min-w-0">
                <span className="text-[11px] font-medium text-slate-400 truncate">
                  {opponent.rankName} · Level {opponent.index + 1}/{TOURNAMENT_LADDER.length}
                </span>
                <span className="font-display text-sm font-bold text-white truncate">
                  {opponent.isBoss ? `BOSS: ${opponent.name}` : opponent.name}
                </span>
              </div>
              <button
                type="button"
                disabled={!canStepNext}
                onClick={() => onSelectOpponent(profile.selectedOpponentIndex + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-200 disabled:opacity-30 hover:bg-slate-700 transition"
                aria-label="Next unlocked opponent"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-3 max-w-[290px] text-xs leading-relaxed text-slate-300">
            Two players, one phone. Best of 3 rounds with turn-handoff guard and balanced neutral stats.
          </p>
        )}

        {/* Dominant Single Primary Play CTA */}
        <button
          type="button"
          onClick={() => onStartMatch(mode, opponent.index)}
          className="mt-4 flex w-full max-w-[310px] items-center justify-center gap-2.5 rounded-2xl bg-yellow-400 px-6 py-4 font-display text-lg font-extrabold text-slate-950 shadow-[0_8px_24px_rgba(250,204,21,0.3)] hover:bg-yellow-300 active:scale-[0.98] transition whitespace-nowrap"
        >
          <Play className="w-5 h-5 fill-slate-950" />
          {mode === 'tournament' ? 'Start Match' : 'Start 2P Duel'}
        </button>

        {/* Secondary Action Row */}
        <div className="mt-3 flex items-center justify-center gap-2.5 w-full max-w-[310px]">
          <button
            type="button"
            onClick={onFindOnlineMatch}
            className="flex flex-1 items-center justify-center rounded-xl border border-sky-700 bg-sky-950 px-3 py-2.5 text-xs font-bold text-sky-100 hover:bg-sky-900 whitespace-nowrap"
          >
            Play Online
          </button>
          <button
            type="button"
            onClick={onOpenLocker}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-[#1E293B]/95 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-700 active:scale-[0.98] transition whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
            Pen Locker ({profile.unlockedPens.length}/6)
          </button>
          <PWAInstallButton />
        </div>

        {/* Single Flat Control Hint Line */}
        <p className="mt-4 text-[11px] font-medium text-slate-400">
          Drag &amp; Pull Pen to Flick · Grip Near Tip for Spin · Esc Pause
        </p>
        {requiresPrivacyChoices && (
          <button type="button" onClick={() => void adService.openPrivacyOptions()}
            className="mt-2 text-xs text-slate-300 underline underline-offset-2">
            Privacy choices
          </button>
        )}
      </div>

      {/* Policy-Safe Menu Adaptive Banner Slot (Auto-hidden during gameplay!) */}
      <div className="safe-bottom px-3 pb-2">
        {bannerVisible && isOnline ? (
          <div className="mx-auto flex h-[52px] w-full max-w-[360px] items-center justify-between rounded-xl border border-slate-800 bg-[#0F172A] px-3.5">
            <div className="flex flex-col text-left min-w-0">
              <span className="text-[10px] font-semibold tracking-wider text-emerald-400">
                ADMOB ADAPTIVE BANNER · MENU SAFE ZONE
              </span>
              <span className="text-[11px] text-slate-400 truncate">
                {adConfig.isNativeAndroid
                  ? 'Native Android Banner Active'
                  : `Test Unit ${adConfig.bannerUnitId.slice(-10)} · Hidden in gameplay`}
              </span>
            </div>
            <span className="font-mono-num text-[10px] text-slate-500 shrink-0 ml-2">
              320×50
            </span>
          </div>
        ) : (
          <div className="h-3" />
        )}
      </div>
    </div>
  );
};
