import React, { lazy, Suspense, useState } from 'react';
import { Check, Film, Gem, Gift, Lock, Wrench, X } from 'lucide-react';
import { adService } from '../game/ads/adService';
import { DESKS, PENS } from '../game/content';
import { getPenUpgradeLevel, isPenPurchaseUnlocked } from '../game/garage';
import { getPenRequirement } from '../game/progression';
import { getLocalDayKey } from '../game/persistence';
import { PenSpec, PenUpgradePart, ProfileV1 } from '../game/types';
import { PenPreviewSvg } from './GameLogo';
import { useOnlineStatus } from './PWAComponents';

const GarageWorkbench = lazy(() => import('./GarageWorkbench'));

interface PenLockerModalProps {
  profile: ProfileV1;
  trialPenId: string | null;
  adBusy: boolean;
  onClose: () => void;
  onEquipPen: (penId: string) => void;
  onUnlockPen: (pen: PenSpec) => void;
  onUpgradePen: (penId: string, part: PenUpgradePart, level: number) => boolean;
  onWatchPenTrialAd: (pen: PenSpec) => void;
  onWatchCoinChestAd: () => void;
  onEquipDesk: (deskId: string) => void;
}

const StatBar: React.FC<{ label: string; value: number; color: string }> = ({
  label,
  value,
  color,
}) => {
  const pct = Math.max(20, Math.min(100, ((value - 0.55) / 1.05) * 100));
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-12 text-slate-400 shrink-0">{label}</span>
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
  onUpgradePen,
  onWatchPenTrialAd,
  onWatchCoinChestAd,
  onEquipDesk,
}) => {
  const [tab, setTab] = useState<'pens' | 'desks'>('pens');
  const [workbenchPenId, setWorkbenchPenId] = useState<string | null>(null);
  const workbenchPen = PENS.find((pen) => pen.id === workbenchPenId && profile.unlockedPens.includes(pen.id));
  const isOnline = useOnlineStatus();
  const supportsAds = adService.supportsAdPlacements();

  const today = getLocalDayKey();
  const chestsUsedToday = profile.localChestDay === today ? profile.localChestCount : 0;
  const chestsRemaining = Math.max(0, 2 - chestsUsedToday);

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="garage-title"
        className="flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl sm:rounded-3xl border border-slate-700/80 bg-[#111827] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 id="garage-title" className="font-display text-lg font-extrabold text-white">
              Pen Garage
            </h2>
            <p className="text-xs text-slate-400">
              {workbenchPen ? 'Workbench' : 'Pens and arenas'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 font-mono-num text-sm font-bold text-yellow-300"
              aria-label={`${profile.coins.toLocaleString()} Aura Points`}>
              <Gem className="w-4 h-4 text-yellow-400" aria-hidden="true" />
              {profile.coins.toLocaleString()}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition"
              aria-label="Close Pen Garage"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Lucky Pencil Box: +100 Aura Points, up to twice a day */}
        {!workbenchPen && supportsAds && <div className="border-b border-slate-800 bg-[#162033] px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-400/15 text-yellow-300 shrink-0">
              <Gift className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white">
                Lucky Pencil Box · +100 Aura Points
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
        </div>}

        {/* Tabs */}
        {!workbenchPen && <div className="grid grid-cols-2 gap-1.5 px-5 pt-3">
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
        </div>}

        {/* Scrollable Content */}
        <div key={workbenchPen?.id ?? tab} className="min-h-0 flex-1 touch-pan-y overflow-y-auto px-5 pt-4 pb-6 space-y-3 [scrollbar-width:thin] [scrollbar-color:#475569_transparent]">
          {workbenchPen
            ? <Suspense fallback={<p role="status" className="py-6 text-center text-sm text-slate-300">Opening workbench…</p>}>
                <GarageWorkbench pen={workbenchPen} profile={profile}
                  onBack={() => setWorkbenchPenId(null)} onUpgrade={onUpgradePen} />
              </Suspense>
            : tab === 'pens'
            ? PENS.map((pen) => {
                const unlocked = profile.unlockedPens.includes(pen.id);
                const equipped = profile.equippedPenId === pen.id && !trialPenId;
                const isTrial = trialPenId === pen.id;
                const gripLevel = getPenUpgradeLevel(profile, pen.id, 'grip');
                const nibLevel = getPenUpgradeLevel(profile, pen.id, 'nib');
                const canPurchase = isPenPurchaseUnlocked(profile, pen);
                const requirement = getPenRequirement(pen.requiredTournamentWins, profile.defeatedRivals);
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
                      <StatBar label="Stability" value={pen.grip * (pen.impactGrip ?? 1)} color="bg-emerald-400" />
                    </div>
                    {unlocked ? (
                      <p className="mt-2 text-xs font-medium text-slate-400">
                        Grip Lv. {gripLevel} · Nib Lv. {nibLevel}
                      </p>
                    ) : (
                      <div className="mt-2 space-y-1 text-xs font-medium">
                        <div className="flex items-start justify-between gap-2 text-amber-200">
                          <span>{requirement.label}</span>
                          <span className="shrink-0">{requirement.progress}/{pen.requiredTournamentWins}</span>
                        </div>
                        <p className="text-slate-400">
                          {canPurchase
                            ? canAfford ? 'Ready to buy' : `${(pen.unlockCoins - profile.coins).toLocaleString()} more Aura Points needed`
                            : 'Win against new rivals to unlock this pen.'}
                        </p>
                      </div>
                    )}

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

                          <button
                            type="button"
                            onClick={() => setWorkbenchPenId(pen.id)}
                            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-cyan-700/70 bg-cyan-950 px-3 text-xs font-bold text-cyan-100 hover:bg-cyan-900 transition"
                            aria-label={`Upgrade ${pen.name}`}
                          >
                            <Wrench className="w-3.5 h-3.5" /> Upgrade
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={!canAfford || !canPurchase}
                            onClick={() => onUnlockPen(pen)}
                            aria-label={`Unlock ${pen.name} for ${pen.unlockCoins} Aura Points`}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-yellow-400 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-yellow-300 disabled:bg-slate-800 disabled:text-slate-500 active:scale-[0.98] transition whitespace-nowrap"
                          >
                            <Gem className="w-3.5 h-3.5" aria-hidden="true" />
                            Buy · {pen.unlockCoins.toLocaleString()}
                          </button>

                          {/* High-Converting Rewarded Ad: Try Locked Pen for 1 Match */}
                          {supportsAds && <button
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
                          </button>}
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
