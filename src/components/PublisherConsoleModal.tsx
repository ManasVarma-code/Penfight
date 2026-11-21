import React, { useState } from 'react';
import {
  Check,
  Copy,
  DollarSign,
  Film,
  Rocket,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { adService } from '../game/ads/adService';
import { ProfileV1 } from '../game/types';

interface PublisherConsoleModalProps {
  profile: ProfileV1;
  onClose: () => void;
  onTestRewarded: () => void;
  onTestInterstitial: () => void;
  onResetProfile: () => void;
}

export const PublisherConsoleModal: React.FC<PublisherConsoleModalProps> = ({
  profile,
  onClose,
  onTestRewarded,
  onTestInterstitial,
  onResetProfile,
}) => {
  const [tab, setTab] = useState<'revenue' | 'units' | 'playstore'>('revenue');
  const [dau, setDau] = useState(2500);
  const [rewardedEcpm, setRewardedEcpm] = useState(14);
  const [interstitialEcpm, setInterstitialEcpm] = useState(6);
  const [bannerEcpm, setBannerEcpm] = useState(0.8);
  const [qaInstant, setQaInstant] = useState(adService.qaInstantInterstitial);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const cfg = adService.getConfig();
  const m = profile.adMetrics;
  const totalRewarded =
    m.rewardedByPlacement.edge_save +
    m.rewardedByPlacement.double_coins +
    m.rewardedByPlacement.pen_trial +
    m.rewardedByPlacement.coin_chest;

  // Transparent publisher planning estimator (editable inputs, not guaranteed projections)
  const estRewardedImpsPerUser = 2.4;
  const estInterstitialImpsPerUser = 1.8;
  const estBannerImpsPerUser = 6.0;
  const dailyRev =
    (dau * estRewardedImpsPerUser * rewardedEcpm) / 1000 +
    (dau * estInterstitialImpsPerUser * interstitialEcpm) / 1000 +
    (dau * estBannerImpsPerUser * bannerEcpm) / 1000;
  const monthlyRev = dailyRev * 30;

  const buildCommands = `# 1. Copy .env.production.example -> .env.production with real AdMob Unit IDs
# 2. Set ADMOB_APP_ID in android/gradle.properties (or CI env)
npm run build
npx cap sync android
npx cap open android
# Or build signed AAB via Gradle:
# cd android && ./gradlew bundleRelease`;

  const copyCommands = () => {
    void navigator.clipboard?.writeText(buildCommands);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4">
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-3xl sm:rounded-3xl border border-slate-700 bg-[#111827] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-extrabold text-white">
              AdMob &amp; Play Store Console
            </h2>
            <p className="text-xs text-slate-400">
              {cfg.isNativeAndroid ? 'Native Android Runtime' : 'Web Preview Simulator'} ·{' '}
              {cfg.isTestMode ? 'Google Test Ad Units' : 'Production Ad Units'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition"
            aria-label="Close console"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 gap-1.5 border-b border-slate-800 px-5 py-3">
          <button
            type="button"
            onClick={() => setTab('revenue')}
            className={`rounded-xl py-2 text-xs font-bold transition ${
              tab === 'revenue'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800/80 text-slate-300 hover:text-white'
            }`}
          >
            AdMob Funnel
          </button>
          <button
            type="button"
            onClick={() => setTab('units')}
            className={`rounded-xl py-2 text-xs font-bold transition ${
              tab === 'units'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800/80 text-slate-300 hover:text-white'
            }`}
          >
            Units &amp; QA
          </button>
          <button
            type="button"
            onClick={() => setTab('playstore')}
            className={`rounded-xl py-2 text-xs font-bold transition ${
              tab === 'playstore'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800/80 text-slate-300 hover:text-white'
            }`}
          >
            Play Store
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-xs">
          {tab === 'revenue' && (
            <>
              {/* Live Session Funnel Metrics */}
              <div className="rounded-2xl border border-slate-800 bg-[#0B1120] p-4">
                <h3 className="font-display text-sm font-bold text-white">
                  Local Device Ad Events
                </h3>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-[#162033] p-2.5">
                    <div className="font-mono-num text-lg font-bold text-emerald-400">
                      {totalRewarded}
                    </div>
                    <div className="text-[11px] text-slate-400">Rewarded</div>
                  </div>
                  <div className="rounded-xl bg-[#162033] p-2.5">
                    <div className="font-mono-num text-lg font-bold text-sky-400">
                      {m.interstitialShown}
                    </div>
                    <div className="text-[11px] text-slate-400">Interstitial</div>
                  </div>
                  <div className="rounded-xl bg-[#162033] p-2.5">
                    <div className="font-mono-num text-lg font-bold text-yellow-300">
                      {m.bannerImpressions}
                    </div>
                    <div className="text-[11px] text-slate-400">Menu Banner</div>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 border-t border-slate-800 pt-3 text-slate-300">
                  <div className="flex justify-between">
                    <span>Second Chance Edge Save</span>
                    <span className="font-mono-num font-bold text-white">
                      {m.rewardedByPlacement.edge_save}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>2x Match Coins Multiplier</span>
                    <span className="font-mono-num font-bold text-white">
                      {m.rewardedByPlacement.double_coins}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Free Locked Pen Trial</span>
                    <span className="font-mono-num font-bold text-white">
                      {m.rewardedByPlacement.pen_trial}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Lucky Pencil Box (+100)</span>
                    <span className="font-mono-num font-bold text-white">
                      {m.rewardedByPlacement.coin_chest}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800/80">
                    <span>Early Skips (0 Reward Granted) · No-Fills</span>
                    <span className="font-mono-num">
                      {m.rewardedDismissedEarly} · {m.rewardedFailed}
                    </span>
                  </div>
                </div>
              </div>

              {/* Interactive eCPM & DAU Earnings Planner */}
              <div className="rounded-2xl border border-emerald-500/25 bg-[#0B1120] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold text-white flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    AdMob Earnings Planner
                  </h3>
                  <span className="text-[10px] text-slate-400">Model estimate only</span>
                </div>

                <div className="mt-3 space-y-3">
                  <div>
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span>Daily Active Users (DAU)</span>
                      <span className="font-mono-num font-bold text-white">
                        {dau.toLocaleString()}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={100}
                      max={50000}
                      step={100}
                      value={dau}
                      onChange={(e) => setDau(Number(e.target.value))}
                      className="w-full accent-emerald-400"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <label className="block">
                      <span className="text-[10px] text-slate-400">Rewarded eCPM ($)</span>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        step={1}
                        value={rewardedEcpm}
                        onChange={(e) => setRewardedEcpm(Math.max(0, Number(e.target.value)))}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono-num text-white"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-slate-400">Interstitial ($)</span>
                      <input
                        type="number"
                        min={0.5}
                        max={30}
                        step={0.5}
                        value={interstitialEcpm}
                        onChange={(e) => setInterstitialEcpm(Math.max(0, Number(e.target.value)))}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono-num text-white"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-slate-400">Banner ($)</span>
                      <input
                        type="number"
                        min={0.1}
                        max={5}
                        step={0.1}
                        value={bannerEcpm}
                        onChange={(e) => setBannerEcpm(Math.max(0, Number(e.target.value)))}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono-num text-white"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                    <div className="rounded-xl bg-[#162033] p-3">
                      <div className="text-[10px] text-slate-400">Est. Daily AdMob</div>
                      <div className="font-mono-num text-base font-bold text-emerald-400">
                        ${dailyRev.toFixed(2)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#162033] p-3">
                      <div className="text-[10px] text-slate-400">Est. Monthly (30d)</div>
                      <div className="font-mono-num text-base font-bold text-yellow-300">
                        ${monthlyRev.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'units' && (
            <>
              <div className="rounded-2xl border border-slate-800 bg-[#0B1120] p-4 space-y-2.5">
                <h3 className="font-display text-sm font-bold text-white">
                  Configured AdMob Units (.env)
                </h3>
                {[
                  ['Android App ID', cfg.appId],
                  ['Rewarded Unit', cfg.rewardedUnitId],
                  ['Interstitial Unit', cfg.interstitialUnitId],
                  ['Menu Adaptive Banner', cfg.bannerUnitId],
                ].map(([label, val]) => (
                  <div key={label} className="space-y-0.5">
                    <div className="text-[10px] text-slate-400">{label}</div>
                    <div className="rounded-lg bg-slate-900 px-2.5 py-1.5 font-mono-num text-[11px] text-sky-300 break-all">
                      {val}
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-[11px]">
                  <div className="rounded-lg bg-slate-900 px-2.5 py-2">
                    <div className="text-[10px] text-slate-400">UMP Consent</div>
                    <div className="font-mono-num font-bold text-emerald-400">
                      {adService.consentStatus} · {adService.canRequestAds ? 'Ads OK' : 'Blocked'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-900 px-2.5 py-2">
                    <div className="text-[10px] text-slate-400">Banner Margin / Test Devices</div>
                    <div className="font-mono-num font-bold text-slate-200">
                      {cfg.bannerBottomMarginDp}dp · {cfg.testingDevices.length} IDs
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 pt-1">
                  Dev builds use official Google Test IDs from <code className="text-slate-200">.env</code>. Production releases read <code className="text-slate-200">.env.production</code> and inject <code className="text-slate-200">ADMOB_APP_ID</code> into <code className="text-slate-200">AndroidManifest.xml</code> via Gradle.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-[#0B1120] p-4 space-y-3">
                <h3 className="font-display text-sm font-bold text-white">
                  Live QA Triggers &amp; Policy Safeguards
                </h3>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-200">
                      QA Fast Interstitial Override
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Bypass 3-match &amp; 5-min cooldown during QA testing
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !qaInstant;
                      adService.qaInstantInterstitial = next;
                      setQaInstant(next);
                    }}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                      qaInstant
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {qaInstant ? 'Active' : 'Off'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={onTestRewarded}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition"
                  >
                    <Film className="w-3.5 h-3.5" />
                    Test Rewarded
                  </button>
                  <button
                    type="button"
                    onClick={onTestInterstitial}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-sky-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-sky-400 transition"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Test Interstitial
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === 'playstore' && (
            <>
              <div className="rounded-2xl border border-slate-800 bg-[#0B1120] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold text-white flex items-center gap-1.5">
                    <Rocket className="w-4 h-4 text-yellow-400" />
                    Wrap for Android (.aab)
                  </h3>
                  <button
                    type="button"
                    onClick={copyCommands}
                    className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
                  >
                    {copiedCmd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedCmd ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="mt-2.5 overflow-x-auto rounded-xl bg-slate-950 p-3 font-mono-num text-[11px] leading-relaxed text-sky-300">
                  {buildCommands}
                </pre>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-[#0B1120] p-4 space-y-2 text-slate-300">
                <h3 className="font-display text-sm font-bold text-white">
                  Google Play &amp; AdMob Launch Checklist
                </h3>
                <ul className="space-y-1.5 list-disc pl-4 text-[11px] leading-relaxed">
                  <li>
                    <strong className="text-white">Target API 36+</strong> (Android 16) with edge-to-edge safe insets enabled.
                  </li>
                  <li>
                    <strong className="text-white">AndroidManifest.xml</strong>: Add your real <code className="text-sky-300">APPLICATION_ID</code> meta-data tag before exporting signed <code className="text-sky-300">.aab</code>.
                  </li>
                  <li>
                    <strong className="text-white">Closed Testing Gate</strong>: New personal Play accounts require ≥12 opted-in testers continuously for 14 days.
                  </li>
                  <li>
                    <strong className="text-white">AdMob Compliance</strong>: Publish <code className="text-sky-300">app-ads.txt</code> on your developer site, declare Advertising ID &amp; Data Safety accurately, and keep UMP privacy consent active.
                  </li>
                  <li>
                    <strong className="text-white">Production Toggle</strong>: Set <code className="text-sky-300">VITE_ADMOB_TEST_MODE=false</code> and <code className="text-sky-300">VITE_SHOW_PUBLISHER_CONSOLE=false</code> for release.
                  </li>
                </ul>
              </div>

              {/* Explicit Data Reset with Confirmation (Blueprint §7.2) */}
              <div className="rounded-2xl border border-rose-900/50 bg-rose-950/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-rose-300">Reset Local Save Data</div>
                    <div className="text-[11px] text-slate-400">
                      Clears local coins, unlocked pens, and tournament progress on this device.
                    </div>
                  </div>
                  {!confirmReset ? (
                    <button
                      type="button"
                      onClick={() => setConfirmReset(true)}
                      className="flex items-center gap-1 rounded-xl border border-rose-700/60 bg-rose-950 px-3 py-2 text-xs font-bold text-rose-200 hover:bg-rose-900 whitespace-nowrap shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Reset
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onResetProfile();
                        setConfirmReset(false);
                      }}
                      className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-rose-500 whitespace-nowrap shrink-0"
                    >
                      Confirm Reset
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
