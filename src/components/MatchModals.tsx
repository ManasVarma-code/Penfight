import React from 'react';
import {
  ArrowRight,
  EyeOff,
  Film,
  Home,
  Play,
  RotateCcw,
  ShieldCheck,
  Gem,
  Trophy,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react';
import { TOURNAMENT_LADDER } from '../game/content';
import { adService } from '../game/ads/adService';
import { HudSnapshot } from '../game/types';
import { useOnlineStatus } from './PWAComponents';

interface PassHandoffModalProps {
  turn: 'p1' | 'p2';
  roundNumber: number;
  onReady: () => void;
}

export const PassHandoffModal: React.FC<PassHandoffModalProps> = ({
  turn,
  roundNumber,
  onReady,
}) => {
  const isP1 = turn === 'p1';
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#070B14]/88 p-5">
      <div className="w-full max-w-xs rounded-3xl border border-slate-700 bg-[#111827] p-6 text-center shadow-2xl">
        <p className="text-xs font-semibold text-slate-400">
          2P Pass &amp; Play · Round {roundNumber}
        </p>
        <h2
          className={`mt-2 font-display text-2xl font-extrabold ${
            isP1 ? 'text-sky-400' : 'text-rose-400'
          }`}
        >
          {isP1 ? 'Player 1 Turn' : 'Player 2 Turn'}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-300">
          Pass the device to <strong className="text-white">{isP1 ? 'Player 1 (Cyan)' : 'Player 2 (Coral)'}</strong>. Tap Ready when holding the phone to prevent accidental flicks.
        </p>
        <button
          type="button"
          onClick={onReady}
          className={`mt-5 w-full rounded-2xl py-3.5 font-display text-base font-extrabold transition active:scale-[0.98] ${
            isP1
              ? 'bg-sky-400 text-slate-950 hover:bg-sky-300'
              : 'bg-rose-500 text-white hover:bg-rose-400'
          }`}
        >
          Ready to Flick
        </button>
      </div>
    </div>
  );
};

interface SecondChanceModalProps {
  opponentName: string;
  adBusy: boolean;
  onWatchReviveAd: () => void;
  onDecline: () => void;
}

export const SecondChanceModal: React.FC<SecondChanceModalProps> = ({
  opponentName,
  adBusy,
  onWatchReviveAd,
  onDecline,
}) => {
  const isOnline = useOnlineStatus();
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#070B14]/85 p-5">
      <div className="w-full max-w-sm rounded-3xl border border-emerald-500/35 bg-[#111827] p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h2 className="mt-3 font-display text-2xl font-extrabold text-white">
          Second Chance?
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-300">
          {opponentName} knocked you off on match point! Watch a short ad to{' '}
          <strong className="text-white">replay this round from a fair symmetric start</strong>{' '}
          and stay in the match (once per match).
        </p>

        <button
          type="button"
          disabled={!isOnline || adBusy}
          onClick={onWatchReviveAd}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3.5 font-display text-base font-extrabold text-slate-950 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 active:scale-[0.98] transition whitespace-nowrap"
        >
          <Film className="w-4 h-4" />
          {!isOnline ? 'Offline — Ad Unavailable' : 'Watch Ad · Second Chance'}
        </button>

        <button
          type="button"
          disabled={adBusy}
          onClick={onDecline}
          className="mt-2.5 w-full rounded-xl py-2.5 text-xs font-semibold text-slate-400 hover:bg-slate-800/80 hover:text-white transition"
        >
          Accept Defeat
        </button>
      </div>
    </div>
  );
};

interface MatchOverModalProps {
  hud: HudSnapshot;
  adBusy: boolean;
  onWatchDoubleCoins: () => void;
  onNextOrReplay: (nextOpponentIndex?: number) => void;
  onOpenLocker: () => void;
  onReturnMenu: () => void;
}

export const MatchOverModal: React.FC<MatchOverModalProps> = ({
  hud,
  adBusy,
  onWatchDoubleCoins,
  onNextOrReplay,
  onOpenLocker,
  onReturnMenu,
}) => {
  const isOnline = useOnlineStatus();
  const ledger = hud.ledger;
  if (!ledger) return null;

  const isTournament = hud.mode === 'tournament';
  const weekly = ledger.weekly;
  const nextIndex = Math.min(TOURNAMENT_LADDER.length - 1, hud.opponent.index + 1);
  const hasNextOpponent = isTournament && !weekly && ledger.won && hud.opponent.index < TOURNAMENT_LADDER.length - 1;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#070B14]/88 p-5">
      <div className="w-full max-w-sm rounded-3xl border border-slate-700 bg-[#111827] p-6 shadow-2xl">
        <div className="text-center">
          <div
            className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl ${
              ledger.won
                ? 'bg-yellow-400/15 text-yellow-400'
                : 'bg-rose-500/15 text-rose-400'
            }`}
          >
            <Trophy className="w-6 h-6" />
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-400">
            {ledger.opponentRank} · Final {hud.scoreP1} – {hud.scoreP2}
          </p>
          <h2 className="mt-1 font-display text-2xl font-extrabold text-white">
            {isTournament
              ? ledger.won
                ? 'Victory!'
                : 'Knocked Out'
              : ledger.won
                ? 'Player 1 Wins!'
                : 'Player 2 Wins!'}
          </h2>
          {ledger.unlockedNewDesk && (
            <p className="mt-1.5 text-xs font-bold text-sky-300">
              New Arena Unlocked: {ledger.unlockedNewDesk}!
            </p>
          )}
          {hasNextOpponent && (
            <p className="mt-1.5 text-xs font-bold text-sky-300">
              Next up: {TOURNAMENT_LADDER[nextIndex].name}
            </p>
          )}
          {isTournament && !weekly && ledger.won && !hasNextOpponent && (
            <p className="mt-1.5 text-xs font-bold text-sky-300">Tournament ladder complete!</p>
          )}
          {weekly?.complete && <p className="mt-2 text-sm font-bold text-amber-200">Weekly Tournament cleared</p>}
          {weekly?.expired && <p className="mt-2 text-sm text-slate-300">The next weekly bracket is open.</p>}
          {isTournament && !ledger.won && !weekly?.expired && (
            <p className="mt-1.5 text-xs text-slate-400">Win a full match to advance.</p>
          )}
        </div>

        {/* Match Aura Points ledger */}
        {isTournament && (
          <div className="mt-4 rounded-2xl border border-slate-800 bg-[#0B1120] p-4 space-y-2 text-xs">
            {ledger.won && <div className="flex justify-between text-slate-300">
              <span>{weekly ? 'Weekly stage reward' : 'Match Victory Payout'}</span>
              <span className="font-mono-num font-semibold text-white">
                +{ledger.baseCoins.toLocaleString()}
              </span>
            </div>}
            {ledger.oneShotKoBonus > 0 && (
              <div className="flex justify-between text-yellow-300">
                <span>1-Shot Knockout Bonus</span>
                <span className="font-mono-num font-semibold">
                  +{ledger.oneShotKoBonus}
                </span>
              </div>
            )}
            {ledger.firstCritBonus > 0 && (
              <div className="flex justify-between text-sky-300">
                <span>Whip Crit Bonus</span>
                <span className="font-mono-num font-semibold">
                  +{ledger.firstCritBonus}
                </span>
              </div>
            )}
            {!!ledger.firstClearBonus && (
              <div className="flex justify-between text-cyan-200">
                <span>First clear{ledger.wasBoss ? ' · Boss' : ''}</span>
                <span>+{ledger.firstClearBonus.toLocaleString()}</span>
              </div>
            )}
            {!!ledger.achievementBonus && (
              <div className="flex justify-between gap-2 text-amber-200">
                <span>{ledger.newAchievements?.join(' · ')}</span>
                <span>+{ledger.achievementBonus.toLocaleString()}</span>
              </div>
            )}
            <div className={`flex items-center justify-between text-sm font-bold ${ledger.won ? 'border-t border-slate-800 pt-2' : ''}`}>
              <span className="text-slate-200">
                {ledger.doubled ? 'Aura Points · Ad bonus added' : ledger.won || weekly ? 'Aura Points earned' : 'Participation reward'}
              </span>
              <span className="flex items-center gap-1 font-mono-num text-yellow-300">
                <Gem className="w-4 h-4 text-yellow-400" aria-hidden="true" />
                +{ledger.totalCoins.toLocaleString()}{!ledger.won && ' AP'}
              </span>
            </div>
            {!ledger.won && !weekly && <p className="text-xs text-slate-400">You receive 70% of the participation reward after a defeat.</p>}
          </div>
        )}

        {/* Double match Aura Points once per match */}
        {adService.supportsAdPlacements() && isTournament && !ledger.doubled && !!ledger.doubleCoinsBonus && (
          <button
            type="button"
            disabled={!isOnline || adBusy}
            onClick={onWatchDoubleCoins}
            className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-3 py-3.5 font-display text-sm font-extrabold text-slate-950 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-400 active:scale-[0.98] transition"
          >
            <Film className="w-4 h-4" />
            {!isOnline
              ? 'Connect to double Aura Points'
              : `Double battle payout · +${ledger.doubleCoinsBonus.toLocaleString()}`}
          </button>
        )}

        {/* Primary Next / Play Again CTA */}
        <button
          type="button"
          disabled={adBusy}
          onClick={() => onNextOrReplay(hasNextOpponent ? nextIndex : hud.opponent.index)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-yellow-400 px-5 py-3.5 font-display text-base font-extrabold text-slate-950 hover:bg-yellow-300 active:scale-[0.98] transition whitespace-nowrap"
        >
          {weekly?.complete || weekly?.expired ? 'View Weekly Tournament' : hasNextOpponent || (weekly && ledger.won) ? (
            <>
              Next Opponent
              <ArrowRight className="w-4 h-4" />
            </>
          ) : (
            <>
              <RotateCcw className="w-4 h-4" />
              {isTournament && !ledger.won ? 'Rematch' : 'Play Again'}
            </>
          )}
        </button>

        {/* Secondary Navigation Row */}
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={adBusy}
            onClick={onOpenLocker}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700 transition whitespace-nowrap"
          >
            <Wrench className="w-3.5 h-3.5 text-yellow-400" />
            Pen Garage
          </button>
          <button
            type="button"
            disabled={adBusy}
            onClick={onReturnMenu}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700 transition whitespace-nowrap"
          >
            <Home className="w-3.5 h-3.5" />
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
};

interface PauseModalProps {
  muted: boolean;
  reducedMotion: boolean;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  onToggleMute: () => void;
  onToggleReducedMotion: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  muted,
  reducedMotion,
  onResume,
  onRestart,
  onQuit,
  onToggleMute,
  onToggleReducedMotion,
}) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#070B14]/82 p-5">
      <div className="w-full max-w-xs rounded-3xl border border-slate-700 bg-[#111827] p-6 shadow-2xl">
        <h2 className="text-center font-display text-xl font-extrabold text-white">
          Match Paused
        </h2>

        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={onResume}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-yellow-400 py-3 font-display text-sm font-extrabold text-slate-950 hover:bg-yellow-300 transition"
          >
            <Play className="w-4 h-4 fill-slate-950" />
            Resume Match
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            className="flex w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
          >
            <span className="flex items-center gap-2">
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              Sound Effects
            </span>
            <span className="font-mono-num text-slate-400">{muted ? 'Off' : 'On'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleReducedMotion}
            className="flex w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
          >
            <span className="flex items-center gap-2">
              <EyeOff className="w-4 h-4" />
              Reduced Motion
            </span>
            <span className="font-mono-num text-slate-400">
              {reducedMotion ? 'On' : 'Off'}
            </span>
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restart Match
          </button>

          <button
            type="button"
            onClick={onQuit}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold text-rose-400 hover:bg-rose-950/50 transition"
          >
            <Home className="w-3.5 h-3.5" />
            Quit to Menu
          </button>
        </div>
      </div>
    </div>
  );
};
