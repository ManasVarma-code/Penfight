import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  InterstitialAdPluginEvents,
  MaxAdContentRating,
  RewardAdPluginEvents,
  type AdMobRewardItem,
} from '@capacitor-community/admob';
import { profileRepo } from '../persistence';
import { AdLifecycleState, RewardIntent, RewardPlacement } from '../types';

export interface AdMobConfig {
  appId: string;
  rewardedUnitId: string;
  interstitialUnitId: string;
  bannerUnitId: string;
  isTestMode: boolean;
  testingDevices: string[];
  bannerBottomMarginDp: number;
  isNativeAndroid: boolean;
  showPublisherConsole: boolean;
}

export interface ActivePreviewAd {
  kind: 'rewarded' | 'interstitial';
  unitId: string;
  intent?: RewardIntent;
  durationSeconds: number;
  resolve: (outcome: 'earned' | 'unearned' | 'shown' | 'failed') => void;
}

declare const __ANDROID_RELEASE_ADS__: boolean;
declare const __ANDROID_ADMOB_CONFIG__: Pick<
  AdMobConfig, 'appId' | 'rewardedUnitId' | 'interstitialUnitId' | 'bannerUnitId'
>;

// Official Google AdMob Test IDs (safe for development & QA, never trigger invalid-traffic bans)
const DEFAULT_TEST_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const DEFAULT_TEST_REWARDED_ID = 'ca-app-pub-3940256099942544/5224354917';
const DEFAULT_TEST_INTERSTITIAL_ID = 'ca-app-pub-3940256099942544/1033173712';
const DEFAULT_TEST_BANNER_ID = 'ca-app-pub-3940256099942544/6300978111';

const INTERSTITIAL_MATCH_INTERVAL = 3;
const INTERSTITIAL_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes (Blueprint §8.3)
const PRELOAD_RETRY_COOLDOWN_MS = 15_000;
const DISMISS_WAIT_TIMEOUT_MS = 3_500;

function parseEnv(): Record<string, string | undefined> {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  if (metaEnv) return metaEnv;
  if (typeof process !== 'undefined' && process.env) return process.env;
  return {};
}

class AdMobService {
  public state: AdLifecycleState = 'IDLE';
  public bannerVisible = false;
  public qaInstantInterstitial = false; // Dev/QA switch inside Publisher Console
  public consentStatus: AdmobConsentStatus = AdmobConsentStatus.UNKNOWN;
  public canRequestAds = true;
  public privacyOptionsRequired = false;
  public rewardedPreloaded = false;
  public interstitialPreloaded = false;

  private initPromise: Promise<void> | null = null;
  private initialized = false;
  private bannerCreated = false;
  private bannerListenerAttached = false;
  private rewardedPreloadInFlight: Promise<boolean> | null = null;
  private interstitialPreloadInFlight: Promise<boolean> | null = null;
  private lastRewardedFailAt = 0;
  private lastInterstitialFailAt = 0;

  private activePreview: ActivePreviewAd | null = null;
  private previewListeners = new Set<(ad: ActivePreviewAd | null) => void>();
  private stateListeners = new Set<(state: AdLifecycleState) => void>();
  private bannerListeners = new Set<(visible: boolean) => void>();

  getConfig(): AdMobConfig {
    const isNativeAndroid = typeof window !== 'undefined' && Capacitor.isNativePlatform();
    if (typeof __ANDROID_RELEASE_ADS__ !== 'undefined' && __ANDROID_RELEASE_ADS__) {
      return {
        ...__ANDROID_ADMOB_CONFIG__,
        isTestMode: false,
        testingDevices: [],
        bannerBottomMarginDp: 18,
        isNativeAndroid,
        showPublisherConsole: false,
      };
    }

    const env = parseEnv();
    const androidDebug = env.MODE === 'android-debug';
    const rawDevices = env.VITE_ADMOB_TESTING_DEVICES || '';
    const testingDevices = rawDevices
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const parsedMargin = Number(env.VITE_ADMOB_BANNER_BOTTOM_MARGIN);
    // Default 18dp bottom clearance for Android 15/16 edge-to-edge gesture bar
    const bannerBottomMarginDp =
      Number.isFinite(parsedMargin) && parsedMargin >= 0 ? Math.round(parsedMargin) : 18;

    return {
      appId: (!androidDebug && env.VITE_ADMOB_APP_ID) || DEFAULT_TEST_APP_ID,
      rewardedUnitId: (!androidDebug && env.VITE_ADMOB_REWARDED_ID) || DEFAULT_TEST_REWARDED_ID,
      interstitialUnitId: (!androidDebug && env.VITE_ADMOB_INTERSTITIAL_ID) || DEFAULT_TEST_INTERSTITIAL_ID,
      bannerUnitId: (!androidDebug && env.VITE_ADMOB_BANNER_ID) || DEFAULT_TEST_BANNER_ID,
      isTestMode: androidDebug || env.VITE_ADMOB_TEST_MODE !== 'false',
      testingDevices,
      bannerBottomMarginDp,
      isNativeAndroid,
      showPublisherConsole: env.VITE_SHOW_PUBLISHER_CONSOLE !== 'false',
    };
  }

  private isNative(): boolean {
    return typeof window !== 'undefined' && Capacitor.isNativePlatform();
  }

  private setState(next: AdLifecycleState): void {
    this.state = next;
    for (const fn of this.stateListeners) fn(next);
  }

  subscribePreview(fn: (ad: ActivePreviewAd | null) => void): () => void {
    this.previewListeners.add(fn);
    fn(this.activePreview);
    return () => this.previewListeners.delete(fn);
  }

  subscribeState(fn: (state: AdLifecycleState) => void): () => void {
    this.stateListeners.add(fn);
    fn(this.state);
    return () => this.stateListeners.delete(fn);
  }

  subscribeBanner(fn: (visible: boolean) => void): () => void {
    this.bannerListeners.add(fn);
    fn(this.bannerVisible);
    return () => this.bannerListeners.delete(fn);
  }

  private emitPreview(ad: ActivePreviewAd | null): void {
    this.activePreview = ad;
    for (const fn of this.previewListeners) fn(ad);
  }

  isOnline(): boolean {
    if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true;
    return navigator.onLine;
  }

  /**
   * Initializes Google Mobile Ads SDK & UMP Privacy Consent (native Android),
   * then kicks off background preloading for Rewarded & Interstitial ads.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.performInitialize();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async performInitialize(): Promise<void> {
    const cfg = this.getConfig();
    if (!this.isNative()) {
      this.consentStatus = AdmobConsentStatus.OBTAINED;
      this.canRequestAds = true;
      this.initialized = true;
      return;
    }

    try {
      await AdMob.initialize({
        initializeForTesting: cfg.isTestMode,
        testingDevices: cfg.isTestMode && cfg.testingDevices.length > 0 ? cfg.testingDevices : undefined,
        maxAdContentRating: MaxAdContentRating.General,
      });

      // UMP Privacy Consent (Fix #3): only show form when status === REQUIRED
      try {
        let consentInfo = await AdMob.requestConsentInfo({
          testDeviceIdentifiers:
            cfg.isTestMode && cfg.testingDevices.length > 0
              ? cfg.testingDevices
              : undefined,
        });
        this.consentStatus = consentInfo.status;
        this.canRequestAds = consentInfo.canRequestAds;
        this.privacyOptionsRequired =
          consentInfo.privacyOptionsRequirementStatus === 'REQUIRED';

        if (
          consentInfo.isConsentFormAvailable &&
          consentInfo.status === AdmobConsentStatus.REQUIRED
        ) {
          consentInfo = await AdMob.showConsentForm();
          this.consentStatus = consentInfo.status;
          this.canRequestAds = consentInfo.canRequestAds;
          this.privacyOptionsRequired =
            consentInfo.privacyOptionsRequirementStatus === 'REQUIRED';
        }
      } catch {
        // Recoverable: allow gameplay to continue cleanly even if UMP network fails
        this.canRequestAds = this.isOnline();
      }

      if (!this.bannerListenerAttached) {
        this.bannerListenerAttached = true;
        // Count native banner impressions strictly on verified SDK impression events (Fix #4)
        void AdMob.addListener(BannerAdPluginEvents.AdImpression, () => {
          profileRepo.commit((d) => {
            d.adMetrics.bannerImpressions += 1;
          });
        });
        void AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => {
          this.bannerCreated = false;
        });
      }

      this.initialized = true;

      // Background preloading for instant show & higher fill rates (Fix #5)
      if (this.canRequestAds && this.isOnline()) {
        void this.preloadRewarded();
        void this.preloadInterstitial();
      }
    } catch {
      // Recoverable: gameplay continues normally without ads
      this.initialized = false;
    }
  }

  async openPrivacyOptions(): Promise<void> {
    if (!this.isNative()) return;
    try {
      await AdMob.showPrivacyOptionsForm();
      const updated = await AdMob.requestConsentInfo();
      this.consentStatus = updated.status;
      this.canRequestAds = updated.canRequestAds;
      this.privacyOptionsRequired =
        updated.privacyOptionsRequirementStatus === 'REQUIRED';
    } catch {
      // Non-fatal
    }
  }

  /**
   * Background preloader for Rewarded Video ads (Fix #5).
   */
  async preloadRewarded(force = false): Promise<boolean> {
    if (!this.isNative() || !this.isOnline() || !this.canRequestAds) return false;
    if (this.rewardedPreloaded) return true;
    if (!force && Date.now() - this.lastRewardedFailAt < PRELOAD_RETRY_COOLDOWN_MS) {
      return false;
    }
    if (this.rewardedPreloadInFlight) return this.rewardedPreloadInFlight;

    const cfg = this.getConfig();
    this.rewardedPreloadInFlight = (async () => {
      try {
        await AdMob.prepareRewardVideoAd({
          adId: cfg.rewardedUnitId,
          isTesting: cfg.isTestMode,
          immersiveMode: true,
        });
        this.rewardedPreloaded = true;
        return true;
      } catch {
        this.rewardedPreloaded = false;
        this.lastRewardedFailAt = Date.now();
        return false;
      } finally {
        this.rewardedPreloadInFlight = null;
      }
    })();

    return this.rewardedPreloadInFlight;
  }

  /**
   * Background preloader for Interstitial ads (Fix #5).
   */
  async preloadInterstitial(force = false): Promise<boolean> {
    if (!this.isNative() || !this.isOnline() || !this.canRequestAds) return false;
    if (this.interstitialPreloaded) return true;
    if (!force && Date.now() - this.lastInterstitialFailAt < PRELOAD_RETRY_COOLDOWN_MS) {
      return false;
    }
    if (this.interstitialPreloadInFlight) return this.interstitialPreloadInFlight;

    const cfg = this.getConfig();
    this.interstitialPreloadInFlight = (async () => {
      try {
        await AdMob.prepareInterstitial({
          adId: cfg.interstitialUnitId,
          isTesting: cfg.isTestMode,
          immersiveMode: true,
        });
        this.interstitialPreloaded = true;
        return true;
      } catch {
        this.interstitialPreloaded = false;
        this.lastInterstitialFailAt = Date.now();
        return false;
      } finally {
        this.interstitialPreloadInFlight = null;
      }
    })();

    return this.interstitialPreloadInFlight;
  }

  /**
   * Adaptive Bottom Banner — strictly shown ONLY on Menu & Pen Locker,
   * automatically hidden during active desk gameplay to prevent accidental clicks.
   * Uses showBanner() once, then hideBanner() / resumeBanner() lifecycle (Fix #4),
   * plus edge-to-edge bottom margin clearance for Android 15/16 gesture bars.
   */
  async setMenuBannerVisible(visible: boolean): Promise<void> {
    if ((!this.isOnline() || !this.canRequestAds) && visible) {
      visible = false;
    }
    if (this.bannerVisible === visible) return;
    this.bannerVisible = visible;
    for (const fn of this.bannerListeners) fn(visible);

    if (!this.isNative()) {
      // Web preview tracks simulated menu banner visibility cleanly
      if (visible) {
        profileRepo.commit((d) => {
          d.adMetrics.bannerImpressions += 1;
        });
      }
      return;
    }

    await this.initialize();
    const cfg = this.getConfig();

    try {
      if (visible) {
        if (!this.bannerCreated) {
          await AdMob.showBanner({
            adId: cfg.bannerUnitId,
            adSize: BannerAdSize.ADAPTIVE_BANNER,
            position: BannerAdPosition.BOTTOM_CENTER,
            margin: cfg.bannerBottomMarginDp,
            isTesting: cfg.isTestMode,
          });
          this.bannerCreated = true;
        } else {
          await AdMob.resumeBanner();
        }
      } else if (this.bannerCreated) {
        await AdMob.hideBanner();
      }
    } catch {
      // Reset bannerCreated if native banner errored so next Menu visit recovers cleanly
      if (visible) this.bannerCreated = false;
    }
  }

  async destroyBanner(): Promise<void> {
    this.bannerVisible = false;
    for (const fn of this.bannerListeners) fn(false);
    if (!this.isNative() || !this.bannerCreated) return;
    try {
      await AdMob.removeBanner();
    } catch {
      // Ignore cleanup errors
    } finally {
      this.bannerCreated = false;
    }
  }

  isAvailable(): boolean {
    return (
      this.isOnline() &&
      this.canRequestAds &&
      this.state !== 'SHOWING' &&
      this.state !== 'LOADING'
    );
  }

  /**
   * Rewarded Ad State Machine (Blueprint §8.2):
   * IDLE -> LOADING -> READY -> SHOWING -> { EARNED, DISMISSED_UNEARNED, FAILED }
   * Persists pendingReward before showing and ONLY grants on verified EARNED callback.
   * All native listeners are guaranteed to be removed in `finally` (Fix #2).
   */
  async showRewarded(
    intent: RewardIntent
  ): Promise<'earned' | 'unearned' | 'failed'> {
    if (!this.isOnline()) {
      this.setState('FAILED');
      profileRepo.commit((d) => {
        d.adMetrics.rewardedFailed += 1;
      });
      return 'failed';
    }

    await this.initialize();
    if (!this.canRequestAds) {
      return this.finalizeRewarded(intent.placement, 'failed');
    }

    this.setState('LOADING');

    // Persist pending intent before displaying ad (crash/resume auditability)
    profileRepo.commit((d) => {
      d.pendingReward = {
        id: intent.rewardRequestId,
        kind: intent.placement,
        contextId: intent.contextId,
        createdAt: Date.now(),
      };
    });

    const cfg = this.getConfig();

    if (this.isNative()) {
      const handles: PluginListenerHandle[] = [];
      try {
        let earnedFromEvent = false;
        let failedToShow = false;
        let dismissed = false;
        let resolveDismissed: (() => void) | null = null;
        const dismissedPromise = new Promise<void>((resolve) => {
          resolveDismissed = resolve;
        });

        handles.push(
          await AdMob.addListener(RewardAdPluginEvents.Rewarded, (item: AdMobRewardItem) => {
            if (!item || typeof item.amount !== 'number' || item.amount > 0) {
              earnedFromEvent = true;
            }
          }),
          await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
            dismissed = true;
            resolveDismissed?.();
          }),
          await AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => {
            failedToShow = true;
            dismissed = true;
            resolveDismissed?.();
          })
        );

        const ready = this.rewardedPreloaded || (await this.preloadRewarded(true));
        if (!ready) {
          return this.finalizeRewarded(intent.placement, 'failed');
        }

        this.setState('READY');
        this.setState('SHOWING');
        // Mark consumed before show so next preload fetches a fresh ad
        this.rewardedPreloaded = false;

        let rewardItem: AdMobRewardItem | undefined;
        try {
          rewardItem = await AdMob.showRewardVideoAd();
        } catch {
          return this.finalizeRewarded(intent.placement, 'failed');
        }

        // Wait cleanly for Dismissed if mediation fires Rewarded before Dismissed
        if (!dismissed) {
          await Promise.race([
            dismissedPromise,
            new Promise<void>((resolve) => setTimeout(resolve, DISMISS_WAIT_TIMEOUT_MS)),
          ]);
        }

        if (failedToShow && !earnedFromEvent) {
          return this.finalizeRewarded(intent.placement, 'failed');
        }

        // Grant strictly when SDK confirms earned reward (event OR valid reward payload)
        const earned =
          earnedFromEvent ||
          Boolean(rewardItem && typeof rewardItem.amount === 'number' && rewardItem.amount > 0);

        return this.finalizeRewarded(intent.placement, earned ? 'earned' : 'unearned');
      } catch {
        return this.finalizeRewarded(intent.placement, 'failed');
      } finally {
        await Promise.allSettled(handles.map((h) => h.remove()));
        // Background preload next rewarded ad after ad flow concludes
        void this.preloadRewarded();
      }
    }

    // Web Developer/Publisher Test Ad Preview Simulator
    this.setState('READY');
    this.setState('SHOWING');
    const outcome = await new Promise<'earned' | 'unearned' | 'failed'>((resolve) => {
      this.emitPreview({
        kind: 'rewarded',
        unitId: cfg.rewardedUnitId,
        intent,
        durationSeconds: 5,
        resolve: (res) => {
          this.emitPreview(null);
          resolve(res === 'earned' ? 'earned' : res === 'failed' ? 'failed' : 'unearned');
        },
      });
    });

    return this.finalizeRewarded(intent.placement, outcome);
  }

  private finalizeRewarded(
    placement: RewardPlacement,
    outcome: 'earned' | 'unearned' | 'failed'
  ): 'earned' | 'unearned' | 'failed' {
    if (outcome === 'earned') {
      this.setState('EARNED');
      profileRepo.commit((d) => {
        d.pendingReward = undefined;
        d.adMetrics.rewardedByPlacement[placement] =
          (d.adMetrics.rewardedByPlacement[placement] || 0) + 1;
      });
    } else if (outcome === 'unearned') {
      this.setState('DISMISSED_UNEARNED');
      profileRepo.commit((d) => {
        d.pendingReward = undefined;
        d.adMetrics.rewardedDismissedEarly += 1;
      });
    } else {
      this.setState('FAILED');
      profileRepo.commit((d) => {
        d.pendingReward = undefined;
        d.adMetrics.rewardedFailed += 1;
      });
    }
    setTimeout(() => {
      if (this.state !== 'SHOWING') this.setState('IDLE');
    }, 150);
    return outcome;
  }

  /**
   * Smart Interstitial Gate (Blueprint §8.3):
   * Fires only between matches when:
   * - Online & consent allows ad requests
   * - >= 3 completed matches since last interstitial
   * - >= 5 minutes since last interstitial (unless QA override enabled)
   * - No rewarded ad was watched during the just-completed match
   */
  canShowSmartInterstitial(watchedRewardedInMatch: boolean): boolean {
    if (!this.isOnline() || !this.canRequestAds) return false;
    if (watchedRewardedInMatch) return false;
    const p = profileRepo.get();
    if (this.qaInstantInterstitial) {
      return p.matchesSinceInterstitial >= 1;
    }
    const elapsed = Date.now() - p.lastInterstitialAt;
    return (
      p.matchesSinceInterstitial >= INTERSTITIAL_MATCH_INTERVAL &&
      (p.lastInterstitialAt === 0 || elapsed >= INTERSTITIAL_COOLDOWN_MS)
    );
  }

  async maybeShowInterstitial(
    watchedRewardedInMatch: boolean,
    forceForQa = false
  ): Promise<'shown' | 'skipped' | 'failed'> {
    if (!forceForQa && !this.canShowSmartInterstitial(watchedRewardedInMatch)) {
      profileRepo.commit((d) => {
        d.adMetrics.interstitialSkipped += 1;
      });
      return 'skipped';
    }
    if (!this.isOnline()) return 'failed';

    await this.initialize();
    if (!this.canRequestAds) return 'failed';

    this.setState('LOADING');
    const cfg = this.getConfig();

    if (this.isNative()) {
      const handles: PluginListenerHandle[] = [];
      try {
        let dismissed = false;
        let resolveDismissed: (() => void) | null = null;
        const dismissedPromise = new Promise<void>((resolve) => {
          resolveDismissed = resolve;
        });

        handles.push(
          await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
            dismissed = true;
            resolveDismissed?.();
          }),
          await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => {
            dismissed = true;
            resolveDismissed?.();
          })
        );

        // On normal transitions, prefer already-preloaded ad (with quick fallback)
        const ready = this.interstitialPreloaded || (await this.preloadInterstitial(forceForQa));
        if (!ready) {
          this.setState('IDLE');
          return 'failed';
        }

        this.setState('SHOWING');
        this.interstitialPreloaded = false;
        await AdMob.showInterstitial();

        if (!dismissed) {
          await Promise.race([
            dismissedPromise,
            new Promise<void>((resolve) => setTimeout(resolve, DISMISS_WAIT_TIMEOUT_MS)),
          ]);
        }

        profileRepo.commit((d) => {
          d.matchesSinceInterstitial = 0;
          d.lastInterstitialAt = Date.now();
          d.adMetrics.interstitialShown += 1;
        });
        this.setState('IDLE');
        return 'shown';
      } catch {
        this.setState('IDLE');
        return 'failed';
      } finally {
        await Promise.allSettled(handles.map((h) => h.remove()));
        void this.preloadInterstitial();
      }
    }

    this.setState('SHOWING');
    const res = await new Promise<'shown' | 'failed'>((resolve) => {
      this.emitPreview({
        kind: 'interstitial',
        unitId: cfg.interstitialUnitId,
        durationSeconds: 3,
        resolve: (outcome) => {
          this.emitPreview(null);
          resolve(outcome === 'failed' ? 'failed' : 'shown');
        },
      });
    });

    if (res === 'shown') {
      profileRepo.commit((d) => {
        d.matchesSinceInterstitial = 0;
        d.lastInterstitialAt = Date.now();
        d.adMetrics.interstitialShown += 1;
      });
    }
    this.setState('IDLE');
    return res;
  }
}

export const adService = new AdMobService();
