import React from 'react';
import { Pause, Volume2, VolumeX, Zap } from 'lucide-react';
import { HudSnapshot } from '../game/types';

interface HudOverlayProps {
  hud: HudSnapshot;
  coins: number;
  muted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  hud,
  coins,
  muted,
  onToggleMute,
  onPause,
}) => {
  const p1Turn = hud.turn === 'p1';
  const p2Label = hud.mode === 'pass_and_play' ? 'Player 2' : hud.opponent.name;
  const p1Label = hud.mode === 'pass_and_play' ? 'Player 1' : 'You';

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between">
      {/* Top Perimeter Match Cluster (No backdrop-filter over canvas!) */}
      <div className="safe-top px-3 pt-2.5 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          {/* P1 Side */}
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span
                className={`text-xs font-bold tracking-wide truncate ${
                  p1Turn ? 'text-sky-300' : 'text-slate-400'
                }`}
              >
                {p1Label}
              </span>
              <div className="flex items-center gap-1" aria-label={`Player 1 rounds: ${hud.scoreP1}`}>
                {[0, 1].map((i) => (
                  <span
                    key={i}
                    className={`h-2 w-2 rounded-full border ${
                      hud.scoreP1 > i
                        ? 'bg-sky-400 border-sky-200'
                        : 'bg-slate-800 border-slate-600'
                    }`}
                  />
                ))}
              </div>
            </div>
            {/* P1 Surge Meter */}
            <div className="mt-1 flex items-center gap-1.5">
              <div className="h-1.5 w-24 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-transform duration-150 origin-left ${
                    hud.surgeP1 >= 100 ? 'bg-yellow-400' : 'bg-sky-400'
                  }`}
                  style={{ transform: `scaleX(${hud.surgeP1 / 100})` }}
                />
              </div>
              {hud.surgeP1 >= 100 ? (
                <span className="font-mono-num text-[10px] font-bold text-yellow-300 flex items-center gap-0.5 whitespace-nowrap">
                  <Zap className="w-2.5 h-2.5 fill-yellow-300" />
                  TURBO
                </span>
              ) : (
                <span className="font-mono-num text-[10px] text-slate-400">
                  {hud.surgeP1}%
                </span>
              )}
            </div>
          </div>

          {/* Center Round / Turn Indicator */}
          <div className="flex flex-col items-center shrink-0">
            <div className="font-display text-xs font-extrabold tracking-wider text-slate-100 whitespace-nowrap">
              {hud.suddenDeath ? (
                <span className="text-rose-400">
                  SUDDEN DEATH +{hud.suddenDeathBonusPct}%
                </span>
              ) : (
                `ROUND ${hud.roundNumber}`
              )}
            </div>
            <div className="font-mono-num text-[10px] text-slate-400 whitespace-nowrap">
              {hud.turnPhase === 'AI_THINKING'
                ? `${hud.opponent.name} aiming...`
                : hud.turnPhase === 'SIMULATING'
                  ? 'In motion'
                  : p1Turn
                    ? `${p1Label}'s flick`
                    : `${p2Label}'s flick`}
            </div>
          </div>

          {/* P2 / Rival Side + Utility Buttons */}
          <div className="flex items-center justify-end gap-2 flex-1 min-w-0">
            <div className="flex flex-col items-end min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-1" aria-label={`Opponent rounds: ${hud.scoreP2}`}>
                  {[0, 1].map((i) => (
                    <span
                      key={i}
                      className={`h-2 w-2 rounded-full border ${
                        hud.scoreP2 > i
                          ? 'bg-rose-400 border-rose-200'
                          : 'bg-slate-800 border-slate-600'
                      }`}
                    />
                  ))}
                </div>
                <span
                  className={`text-xs font-bold tracking-wide truncate max-w-[78px] ${
                    !p1Turn ? 'text-rose-300' : 'text-slate-400'
                  }`}
                >
                  {p2Label}
                </span>
              </div>
              {/* P2 Surge Meter */}
              <div className="mt-1 flex items-center gap-1.5">
                {hud.surgeP2 >= 100 ? (
                  <span className="font-mono-num text-[10px] font-bold text-yellow-300 flex items-center gap-0.5 whitespace-nowrap">
                    <Zap className="w-2.5 h-2.5 fill-yellow-300" />
                    TURBO
                  </span>
                ) : (
                  <span className="font-mono-num text-[10px] text-slate-400">
                    {hud.surgeP2}%
                  </span>
                )}
                <div className="h-1.5 w-20 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-transform duration-150 origin-right ${
                      hud.surgeP2 >= 100 ? 'bg-yellow-400' : 'bg-rose-400'
                    }`}
                    style={{ transform: `scaleX(${hud.surgeP2 / 100})` }}
                  />
                </div>
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onToggleMute}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/90 bg-[#111827] text-slate-200 hover:bg-slate-800 active:scale-95 transition"
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={onPause}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/90 bg-[#111827] text-slate-200 hover:bg-slate-800 active:scale-95 transition"
                aria-label={hud.mode === 'online' ? 'Leave online match' : 'Pause match'}
              >
                <Pause className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Quiet unboxed metadata sub-line */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 px-0.5">
          <span className="truncate">
            {hud.p1PenName}
            {hud.trialPenName ? ' (Free Trial)' : ''} · {hud.deskName}
          </span>
          {hud.mode === 'tournament' && (
            <span className="font-mono-num text-yellow-300 font-semibold shrink-0">
              {coins.toLocaleString()} coins
            </span>
          )}
        </div>
      </div>

      {/* Bottom Quiet Control Hint */}
      <div className="safe-bottom px-3 pb-2.5 text-center">
        <p className="text-[11px] font-medium text-slate-400/90">
          {hud.turnPhase === 'AIMING' && (hud.turn === 'p1' || hud.mode === 'pass_and_play')
            ? 'Touch pen & pull back to flick · Grip near tip for Whip Spin'
            : hud.turnPhase === 'AI_THINKING'
              ? `${hud.opponent.name} is lining up a shot...`
              : hud.mode === 'online' && hud.turnPhase === 'AIMING'
                ? 'Opponent’s turn'
                : 'Wait for pens to settle'}
        </p>
      </div>
    </div>
  );
};
