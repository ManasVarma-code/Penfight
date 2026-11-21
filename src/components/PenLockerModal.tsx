import React, { useState } from 'react';
import { Check, Coins, Film, Gift, Lock, Sparkles, X } from 'lucide-react';
import { DESKS, PENS } from '../game/content';
import { getLocalDayKey } from '../game/persistence';
import { PenSpec, ProfileV1 } from '../game/types';
import { PenPreviewSvg } from './GameLogo';
import { useOnlineStatus } from './PWAComponents';

interface PenLockerModalProps {
  profile: ProfileV1;
  trialPenId: string | null;
  adBusy: boolean;
  onClose: () => void;
  onEquipPen: (penId: string) => void;
  onUnlockPen: (pen: PenSpec) => void;
  onUpgradeMastery: (penId: string) => void;
  onWatchPenTrialAd: (pen: PenSpec) => void;
  onWatchCoinChestAd: () => void;
  onEquipDesk: (deskId: string) => void;
}

const StatBar: React.FC<{ label: string; value: number; color: string }> = ({
  label,
  value,
  color,
}) => {
  // Normalize 0.80..1.35 into 25%..100% bar visual
  const pct = Math.max(20, Math.min(100, ((value - 0.72) / 0.62) * 100));
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-11 text-slate-400 shrink-0">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono-num w-8 text-right text-slate-300">
        {value.toFixed(2)}
      </span>
    </div>
  );
};

export const PenLockerModal: React.FC<PenLockerModalProps> = ({
  profile,
  trialPenId,
  adBusy,
  onClose,
  onEquipPen,
  onUnlockPen,
  onUpgradeMastery,
  onWatchPenTrialAd,
  onWatchCoinChestAd,
  onEquipDesk,
}) => {
  const [tab, setTab] = useState<'pens' | 'desks'>('pens');
  const isOnline = useOnlineStatus();

  const today = getLocalDayKey();
  const chestsUsedToday = profile.localChestDay === today ? profile.localChestCount : 0;
  const chestsRemaining = Math.max(0, 2 - chestsUsedToday);

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4">
      <div className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-3xl sm:rounded-3xl border border-slate-700/80 bg-[#111827] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-extrabold text-white">
              Pen Locker
            </h2>
            <p className="text-xs text-slate-400">
              Unique physics profiles · Guaranteed coin unlocks
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 font-mono-num text-sm font-bold text-yellow-300">
              <Coins className="w-4 h-4 text-yellow-400" />
              {profile.coins.toLocaleString()}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition"
              aria-label="Close Pen Locker"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Lucky Pencil Box Rewarded Ad Placement (Blueprint §8.1: Guaranteed +100 Coins, max 2/day) */}
        <div className="border-b border-slate-800 bg-[#162033] px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-400/15 text-yellow-300 shrink-0">
              <Gift className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">
                Lucky Pencil Box · +100 Coins
              </div>
              <div className="text-[11px] text-slate-400">
                Guaranteed payout · {chestsRemaining}/2 left today
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={!isOnline || chestsRemaining <= 0 || adBusy}
            onClick={onWatchCoinChestAd}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 active:scale-95 transition whitespace-nowrap shrink-0"
          >
            <Film className="w-3.5 h-3.5" />
            {!isOnline
              ? 'Offline'
              : chestsRemaining <= 0
                ? 'Limit Reached'
                : 'Watch Ad'}
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-1.5 px-5 pt-3">
          <button
            type="button"
            onClick={() => setTab('pens')}
            className={`rounded-xl py-2 text-xs font-bold transition ${
              tab === 'pens'
                ? 'bg-sky-500 text-slate-950'
                : 'bg-slate-800/80 text-slate-300 hover:text-white'
            }`}
          >
            Pens ({profile.unlockedPens.length}/{PENS.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('desks')}
            className={`rounded-xl py-2 text-xs font-bold transition ${
              tab === 'desks'
                ? 'bg-sky-500 text-slate-950'
                : 'bg-slate-800/80 text-slate-300 hover:text-white'
            }`}
          >
            Desk Arenas ({profile.unlockedDeskIds.length}/{DESKS.length})
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {tab === 'pens'
            ? PENS.map((pen) => {
                const unlocked = profile.unlockedPens.includes(pen.id);
                const equipped = profile.equippedPenId === pen.id && !trialPenId;
                const isTrial = trialPenId === pen.id;
                const mastery = profile.penMastery[pen.id] || 0;
                const masteryCost = 120 + mastery * 90;
                const canAfford = profile.coins >= pen.unlockCoins;

                return (
                  <div
                    key={pen.id}
                    className={`rounded-2xl border p-4 transition ${
                      equipped || isTrial
                        ? 'border-sky-400/60 bg-[#1B2840]'
                        : 'border-slate-800 bg-[#172033]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display text-base font-bold text-white">
                          {pen.name}
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {pen.tagline}
                        </p>
                      </div>
                      {equipped && (
                        <span className="flex items-center gap-1 text-xs font-bold text-sky-300 shrink-0">
                          <Check className="w-3.5 h-3.5" />
                          Equipped
                        </span>
                      )}
                      {isTrial && (
                        <span className="text-xs font-bold text-yellow-300 shrink-0">
                          1-Match Trial
                        </span>
                      )}
                    </div>

                    <div className="my-3 rounded-xl bg-[#0B1120]/70 px-3 py-2">
                      <PenPreviewSvg pen={pen} />
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      <StatBar label="Mass" value={pen.mass} color="bg-rose-400" />
                      <StatBar label="Power" value={pen.power} color="bg-yellow-400" />
                      <StatBar label="Spin" value={pen.spin} color="bg-violet-400" />
                      <StatBar label="Grip" value={pen.grip} color="bg-emerald-400" />
                    </div>

                    <div className="mt-3.5 flex items-center gap-2">
                      {unlocked ? (
                        <>
                          <button
                            type="button"
                            disabled={equipped}
                            onClick={() => onEquipPen(pen.id)}
                            className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition whitespace-nowrap ${
                              equipped
                                ? 'bg-slate-800 text-slate-400'
                                : 'bg-sky-500 text-slate-950 hover:bg-sky-400 active:scale-[0.98]'
                            }`}
                          >
                            {equipped ? 'Active Pen' : 'Equip'}
                          </button>

                          {/* Capped Tournament Mastery track (+5% max, disabled in Pass & Play) */}
                          <button
                            type="button"
                            disabled={mastery >= 5 || profile.coins < masteryCost}
                            onClick={() => onUpgradeMastery(pen.id)}
                            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-45 transition whitespace-nowrap"
                            title="Tournament mastery (+1% per level, capped at +5%, disabled in Pass & Play)"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                            {mastery >= 5
                              ? 'Max +5%'
                              : `Mastery +${mastery}% (${masteryCost})`}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={!canAfford}
                            onClick={() => onUnlockPen(pen)}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-yellow-400 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-yellow-300 disabled:bg-slate-800 disabled:text-slate-500 active:scale-[0.98] transition whitespace-nowrap"
                          >
                            <Coins className="w-3.5 h-3.5" />
                            Unlock · {pen.unlockCoins}
                          </button>

                          {/* High-Converting Rewarded Ad: Try Locked Pen for 1 Match */}
                          <button
                            type="button"
                            disabled={!isOnline || isTrial || adBusy}
                            onClick={() => onWatchPenTrialAd(pen)}
                            className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 active:scale-[0.98] transition whitespace-nowrap"
                          >
                            <Film className="w-3.5 h-3.5" />
                            {!isOnline
                              ? 'Offline'
                              : isTrial
                                ? 'Trial Active'
                                : 'Try Free (Ad)'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            : DESKS.map((desk) => {
                const unlocked = profile.unlockedDeskIds.includes(desk.id);
                const equipped = profile.equippedDeskId === desk.id;
                return (
                  <div
                    key={desk.id}
                    className={`rounded-2xl border p-4 ${
                      equipped
                        ? 'border-sky-400/60 bg-[#1B2840]'
                        : 'border-slate-800 bg-[#172033]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="font-display text-base font-bold text-white">
                          {desk.name}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {desk.description}
                        </p>
                      </div>
                      <span className="font-mono-num text-xs text-slate-300 shrink-0">
                        Friction {desk.frictionMult.toFixed(2)}×
                      </span>
                    </div>

                    <div
                      className="mt-3 h-12 w-full rounded-xl border-2"
                      style={{
                        background: `linear-gradient(135deg, ${desk.surfacePrimary}, ${desk.surfaceSecondary})`,
                        borderColor: desk.trimAccent,
                      }}
                    />

                    <div className="mt-3">
                      {unlocked ? (
                        <button
                          type="button"
                          disabled={equipped}
                          onClick={() => onEquipDesk(desk.id)}
                          className={`w-full rounded-xl py-2.5 text-xs font-bold transition ${
                            equipped
                              ? 'bg-slate-800 text-slate-400'
                              : 'bg-sky-500 text-slate-950 hover:bg-sky-400'
                          }`}
                        >
                          {equipped ? 'Active Desk Arena' : 'Select Arena'}
                        </button>
                      ) : (
                        <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-800/80 py-2.5 text-xs font-medium text-slate-400">
                          <Lock className="w-3.5 h-3.5" />
                          Defeat Rank 2 Boss (Meera) to unlock
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
        </div>
      </div>
    </div>
  );
};
