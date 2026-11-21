import React, { useEffect, useState } from 'react';
import { CheckCircle2, Film, ShieldAlert, X } from 'lucide-react';
import { ActivePreviewAd } from '../game/ads/adService';

interface AdMobOverlayProps {
  ad: ActivePreviewAd | null;
}

/**
 * Developer / Web Preview AdMob Simulator (Blueprint §8.1 & §8.2).
 * On native Android (Capacitor), real Google Mobile Ads SDK screens take over instead.
 * Includes explicit early-dismiss and no-fill QA triggers to verify zero unearned rewards.
 */
export const AdMobOverlay: React.FC<AdMobOverlayProps> = ({ ad }) => {
  const [remaining, setRemaining] = useState(5);

  useEffect(() => {
    if (!ad) return;
    setRemaining(ad.durationSeconds);
    const id = window.setInterval(() => {
      setRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [ad]);

  if (!ad) return null;

  const isRewarded = ad.kind === 'rewarded';
  const completed = remaining === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AdMob Test Preview"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/95 p-5"
    >
      <div className="w-full max-w-sm rounded-3xl border border-slate-700 bg-[#0F172A] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="font-mono-num text-[11px] font-bold text-emerald-400">
            ADMOB TEST PREVIEW · {isRewarded ? 'REWARDED' : 'INTERSTITIAL'}
          </span>
          {!completed ? (
            <span className="font-mono-num text-xs font-bold text-slate-300">
              {remaining}s
            </span>
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          )}
        </div>

        {/* Simulated Ad Creative Frame */}
        <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-gradient-to-br from-[#1E293B] to-[#0B1120] px-5 py-9 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-400">
            <Film className="w-6 h-6" />
          </div>
          <h3 className="mt-3 font-display text-lg font-extrabold text-white">
            {isRewarded
              ? ad.intent?.label || 'Rewarded Video Ad'
              : 'Between-Match Interstitial Ad'}
          </h3>
          <p className="mt-1 text-xs text-slate-300">
            {isRewarded
              ? `Verified Reward: ${ad.intent?.rewardSummary}`
              : 'Smart interstitial triggered at natural match break.'}
          </p>
          <p className="mt-3 font-mono-num text-[10px] text-slate-500 break-all">
            Unit ID: {ad.unitId}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mt-4 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-emerald-400 transition-all duration-1000 ease-linear"
            style={{
              width: `${((ad.durationSeconds - remaining) / ad.durationSeconds) * 100}%`,
            }}
          />
        </div>

        {/* Primary Action once countdown completes */}
        <button
          type="button"
          disabled={!completed}
          onClick={() => ad.resolve(isRewarded ? 'earned' : 'shown')}
          className="mt-4 w-full rounded-2xl bg-emerald-500 py-3.5 font-display text-sm font-extrabold text-slate-950 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 transition"
        >
          {completed
            ? isRewarded
              ? 'Claim Verified Reward & Close'
              : 'Continue to Match'
            : `Reward Ready in ${remaining}s...`}
        </button>

        {/* Publisher QA Controls to test Unearned Dismiss & No-Fill safely */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => ad.resolve(isRewarded ? 'unearned' : 'shown')}
            className="flex items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-800/70 py-2 text-[11px] font-semibold text-slate-300 hover:bg-slate-700 transition"
          >
            <X className="w-3.5 h-3.5" />
            {isRewarded ? 'Skip (No Reward)' : 'Close Early'}
          </button>
          <button
            type="button"
            onClick={() => ad.resolve('failed')}
            className="flex items-center justify-center gap-1 rounded-xl border border-rose-900/60 bg-rose-950/40 py-2 text-[11px] font-semibold text-rose-300 hover:bg-rose-900/50 transition"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Simulate No-Fill
          </button>
        </div>
      </div>
    </div>
  );
};
