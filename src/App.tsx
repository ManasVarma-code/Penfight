import { useEffect, useRef, useState } from 'react';
import { AdMobOverlay } from './components/AdMobOverlay';
import { HudOverlay } from './components/HudOverlay';
import { GameSettings } from './components/GameSettings';
import { OpeningScreen } from './components/OpeningScreen';
import {
  MatchOverModal,
  PassHandoffModal,
  PauseModal,
  SecondChanceModal,
} from './components/MatchModals';
import { PenLockerModal } from './components/PenLockerModal';
import { ProgressModal } from './components/ProgressModal';
import { RankedResult, RankedSignIn, RankedVersus } from './components/RankedViews';
import { PenPreviewSvg } from './components/GameLogo';
import { PublisherConsoleModal } from './components/PublisherConsoleModal';
import { OfflineIndicator } from './components/PWAComponents';
import { TitleScreen } from './components/TitleScreen';
import { WeeklyTournament } from './components/WeeklyTournament';
import { ActivePreviewAd, adService } from './game/ads/adService';
import { AD_QA_ENABLED } from './game/ads/adQa';
import { soundSynth } from './game/audio';
import { getDeskById, getOpponentByIndex, getPenById } from './game/content';
import { gameEngine } from './game/engine';
import { currentOfflineSlot, getLocalDayKey, profileRepo, switchOfflineSlot } from './game/persistence';
import { GOLD_PEN_ID } from './game/progression';
import { useOnlineDuel } from './game/useOnlineDuel';
import { useRankedAccount } from './game/useRankedAccount';
import { useOfflineBackup } from './game/useOfflineBackup';
import type { RankedHistoryEntry } from './game/ranking';
import { HudSnapshot, MatchMode, PenSpec, PenUpgradePart, ProfileV1 } from './game/types';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [profile, setProfile] = useState<ProfileV1>(() => profileRepo.get());
  const [hud, setHud] = useState<HudSnapshot>(() => ({
    shellState: 'TITLE_MENU',
    mode: 'tournament',
    turn: 'p1',
    turnPhase: 'AIMING',
    roundNumber: 1,
    scoreP1: 0,
    scoreP2: 0,
    surgeP1: 0,
    surgeP2: 0,
    shotsInRound: 0,
    suddenDeath: false,
    suddenDeathBonusPct: 0,
    canRevive: true,
    opponent: getOpponentByIndex(profileRepo.get().selectedOpponentIndex),
    p1PenName: getPenById(profileRepo.get().equippedPenId).name,
    p2PenName: getPenById('classic_ballpoint').name,
    deskName: getDeskById(profileRepo.get().equippedDeskId).name,
    trialPenName: null,
    statusBanner: null,
    ledger: null,
    lastRoundDraw: false,
  }));

  const [lockerOpen, setLockerOpen] = useState(false);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [splash, setSplash] = useState(true);
  const [guest, setGuest] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [publisherOpen, setPublisherOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressInitialView, setProgressInitialView] = useState<'overview' | 'rank'>('overview');
  const [rankedSignIn, setRankedSignIn] = useState<'queue' | 'account' | null>(null);
  const [exitRankedResult, setExitRankedResult] = useState<RankedHistoryEntry>();
  const [goldCelebration, setGoldCelebration] = useState(false);
  const [previewAd, setPreviewAd] = useState<ActivePreviewAd | null>(null);
  const [adBusy, setAdBusy] = useState(false);
  const [bannerInset, setBannerInset] = useState(0);
  const [trialPenId, setTrialPenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const online = useOnlineDuel();
  const account = useRankedAccount();
  const initialToken = useRef(account.token);
  const [profileReady, setProfileReady] = useState(false);
  const backup = useOfflineBackup(account.token, profileReady, hud.shellState === 'TITLE_MENU');
  const offlineCachedAccount = backup.status === 'offline' && account.token === initialToken.current &&
    currentOfflineSlot() !== 'guest';
  const restoring = !!account.token && !backup.ready && !offlineCachedAccount;
  const startupSignIn = !account.token && !guest && !splash && profileReady;
  const showOpening = splash || !profileReady || restoring;
  const [confirmOnlineLeave, setConfirmOnlineLeave] = useState(false);
  const findingMatch = hud.shellState === 'TITLE_MENU' && (
    online.phase === 'searching' || online.phase === 'reconnecting' || online.phase === 'error'
  );
  const menuCovered = showOpening || startupSignIn || settingsOpen || lockerOpen || weeklyOpen || publisherOpen || progressOpen || goldCelebration || findingMatch || !!previewAd
    || !!rankedSignIn || !!exitRankedResult;
  const showMenuBanner = hud.shellState === 'TITLE_MENU' && !menuCovered;

  useEffect(() => {
    const timeout = window.setTimeout(() => setSplash(false), 1050);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    gameEngine.setMenuCovered(menuCovered);
    return () => gameEngine.setMenuCovered(false);
  }, [menuCovered]);

  useEffect(() => {
    let active = true;
    const syncBanner = () => { void adService.setMenuBannerVisible(showMenuBanner); };
    const onVisible = () => { if (document.visibilityState === 'visible') syncBanner(); };
    const onOnline = () => {
      if (showMenuBanner) void adService.initialize(true).then(() => { if (active) syncBanner(); });
    };
    syncBanner();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [showMenuBanner]);

  useEffect(() => {
    if (!rankedSignIn || !account.token || !backup.ready) return;
    if (rankedSignIn === 'queue') online.findMatch('ranked', account.token);
    setRankedSignIn(null);
  }, [account.token, backup.ready, rankedSignIn]);

  const latestRankedResult = online.result?.id ?? exitRankedResult?.id;
  useEffect(() => {
    if (latestRankedResult) void account.refresh();
  }, [latestRankedResult, account.refresh]);
  useEffect(() => {
    if (online.phase === 'error' && online.mode === 'ranked') void account.refresh();
  }, [online.phase, online.mode, account.refresh]);

  function openProgress(view: 'overview' | 'rank') {
    setProgressInitialView(view);
    setProgressOpen(true);
  }

  function queueRanked() {
    if (account.token) online.findMatch('ranked', account.token);
    else setRankedSignIn('queue');
  }

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((cur) => (cur === msg ? null : cur));
    }, 2800);
  };

  function continueAsGuest() {
    if (!switchOfflineSlot('guest', null)) {
      showToast('Could not open the guest save. Your progress is still on this device.');
      return;
    }
    account.cancel();
    account.signOut();
    setRankedSignIn(null);
    setGuest(true);
    gameEngine.startAttractMode();
  }

  async function saveAndSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await backup.saveNow();
      if (!switchOfflineSlot('guest', null)) {
        showToast('Could not set aside your local save. You’re still signed in.');
        return;
      }
      account.signOut();
      setRankedSignIn(null);
      setSettingsOpen(false);
      setProgressOpen(false);
      setGuest(false);
      gameEngine.startAttractMode();
    } finally { setSigningOut(false); }
  }

  useEffect(() => {
    soundSynth.setMuted(profileRepo.get().muted);
    void profileRepo.hydrate().then((p) => {
      setProfile(p);
      soundSynth.setMuted(p.muted);
    }).finally(() => setProfileReady(true));
    if (profileRepo.recoveryWarning) {
      showToast(profileRepo.recoveryWarning);
    }

    const unsubProfile = profileRepo.subscribe((next) => {
      setProfile(next);
      soundSynth.setMuted(next.muted);
    });
    const unsubAdPreview = AD_QA_ENABLED ? adService.subscribePreview(setPreviewAd) : undefined;
    const unsubBanner = adService.subscribeBanner(setBannerInset);

    void adService.initialize();

    return () => {
      unsubProfile();
      unsubAdPreview?.();
      unsubBanner();
    };
  }, []);

  // Mount isolated 60fps canvas engine once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return gameEngine.attach(canvas, (snap) => {
      setHud(snap);
      if (snap.shellState === 'MATCH_OVER') {
        setTrialPenId(gameEngine.getTrialPenId());
      }
    });
  }, []);

  // Keyboard quick-start on Title Menu (Enter / Space)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        hud.shellState === 'TITLE_MENU' &&
        !menuCovered &&
        !(e.target instanceof HTMLElement && e.target.closest('button, input, a')) &&
        (e.key === 'Enter' || e.key === ' ')
      ) {
        e.preventDefault();
        gameEngine.startMatch('tournament', profile.selectedOpponentIndex);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hud.shellState, menuCovered, profile.selectedOpponentIndex]);

  const handleToggleMute = () => {
    soundSynth.unlock();
    profileRepo.commit((d) => {
      d.muted = !d.muted;
    });
  };

  const handleToggleReducedMotion = () => {
    profileRepo.commit((d) => {
      d.reducedMotion = !d.reducedMotion;
    });
  };

  const handleStartMatch = (mode: MatchMode, opponentIndex: number) => {
    setLockerOpen(false);
    setPublisherOpen(false);
    gameEngine.startMatch(mode, opponentIndex);
  };

  const handleSelectOpponent = (idx: number) => {
    soundSynth.playUiTap();
    profileRepo.commit((d) => {
      d.selectedOpponentIndex = Math.max(0, Math.min(d.highestTournamentOpponent, idx));
    });
  };

  // --- REWARDED AD PLACEMENT 1: Second Chance Edge Save ---
  const handleWatchReviveAd = async () => {
    if (adBusy) return;
    setAdBusy(true);
    const reqId = `revive_${hud.ledger?.matchId ?? Date.now()}`;
    const outcome = await adService.showRewarded({
      rewardRequestId: reqId,
      placement: 'edge_save',
      contextId: `round_${hud.roundNumber}`,
      label: 'Second Chance Edge Save',
      rewardSummary: 'Replay lost round symmetrically & stay in match',
    });
    setAdBusy(false);

    if (outcome === 'earned') {
      gameEngine.applySecondChanceRevive();
      showToast('Second Chance activated — fight back!');
    } else if (outcome === 'unearned') {
      showToast('Ad closed early — reward not granted.');
    } else {
      showToast(adService.getRewardedFailureMessage());
    }
  };

  // --- REWARDED AD PLACEMENT 2: Double Match Aura Points ---
  const handleWatchDoubleCoins = async () => {
    if (adBusy || !hud.ledger || hud.ledger.doubled || !hud.ledger.doubleCoinsBonus) return;
    setAdBusy(true);
    const bonus = hud.ledger.doubleCoinsBonus;
    const txId = `double_coins_${hud.ledger.matchId}`;
    const outcome = await adService.showRewarded({
      rewardRequestId: txId,
      placement: 'double_coins',
      contextId: hud.ledger.matchId,
      label: 'Double Aura Points',
      rewardSummary: `+${bonus} Aura Points added to your balance`,
    });
    setAdBusy(false);

    if (outcome === 'earned') {
      const granted = profileRepo.claimTournamentDouble(hud.ledger.matchId, bonus);
      if (granted) {
        soundSynth.playCoinBurst();
        gameEngine.markLedgerDoubled(bonus);
        showToast(`+${bonus} bonus Aura Points!`);
      }
    } else if (outcome === 'unearned') {
      showToast('Watch the full ad to double your battle payout.');
    } else {
      showToast('Ad could not load. Your Aura Points are saved.');
    }
  };

  // --- REWARDED AD PLACEMENT 3: Try Locked Pen Free for 1 Match ---
  const handleWatchPenTrialAd = async (pen: PenSpec) => {
    if (adBusy) return;
    setAdBusy(true);
    const reqId = `pen_trial_${pen.id}_${Date.now()}`;
    const outcome = await adService.showRewarded({
      rewardRequestId: reqId,
      placement: 'pen_trial',
      contextId: pen.id,
      label: `Free Trial: ${pen.name}`,
      rewardSummary: `Equip ${pen.name} for your next Tournament match`,
    });
    setAdBusy(false);

    if (outcome === 'earned') {
      soundSynth.playCoinBurst();
      gameEngine.setTrialPen(pen.id);
      setTrialPenId(pen.id);
      showToast(`${pen.name} equipped for your next match!`);
    } else if (outcome === 'unearned') {
      showToast('Ad closed early — trial not activated.');
    } else {
      showToast(adService.getRewardedFailureMessage());
    }
  };

  // --- REWARDED AD PLACEMENT 4: Lucky Pencil Box (+100 Aura Points, max 2/day) ---
  const handleWatchCoinChestAd = async () => {
    if (adBusy) return;
    const today = getLocalDayKey();
    const usedToday = profile.localChestDay === today ? profile.localChestCount : 0;
    if (usedToday >= 2) {
      showToast('Daily Lucky Pencil Box limit reached (2/2).');
      return;
    }

    setAdBusy(true);
    const txId = `coin_chest_${today}_${usedToday + 1}`;
    const outcome = await adService.showRewarded({
      rewardRequestId: txId,
      placement: 'coin_chest',
      contextId: today,
      label: 'Lucky Pencil Box',
      rewardSummary: '+100 guaranteed Aura Points',
    });
    setAdBusy(false);

    if (outcome === 'earned') {
      const granted = profileRepo.grantCoinsAtomic(txId, 100);
      if (granted) {
        profileRepo.commit((d) => {
          const curDay = getLocalDayKey();
          d.localChestDay = curDay;
          d.localChestCount = (d.localChestDay === curDay ? d.localChestCount : 0) + 1;
        });
        soundSynth.playCoinBurst();
        showToast('+100 Aura Points from Lucky Pencil Box!');
      }
    } else if (outcome === 'unearned') {
      showToast('Ad closed early. No Aura Points earned.');
    } else {
      showToast(adService.getRewardedFailureMessage());
    }
  };

  // --- SMART INTERSTITIAL AT NATURAL BETWEEN-MATCH TRANSITION ---
  const handleNextOrReplay = async (nextOpponentIndex?: number) => {
    if (adBusy) return;
    if (hud.ledger?.weekly) {
      if (hud.ledger.weekly.complete || hud.ledger.weekly.expired || !gameEngine.startWeeklyMatch()) {
        gameEngine.startAttractMode();
        setWeeklyOpen(true);
      }
      return;
    }
    setAdBusy(true);
    await adService.maybeShowInterstitial(gameEngine.didWatchRewardedThisMatch());
    setAdBusy(false);
    gameEngine.startMatch(hud.mode, nextOpponentIndex);
  };

  const handleEquipPen = (penId: string) => {
    soundSynth.playUiTap();
    gameEngine.setTrialPen(null);
    setTrialPenId(null);
    profileRepo.commit((d) => {
      if (d.unlockedPens.includes(penId)) {
        d.equippedPenId = penId;
      }
    });
    if (hud.shellState === 'TITLE_MENU') {
      gameEngine.startAttractMode();
    }
  };

  const handleUnlockPen = (pen: PenSpec) => {
    if (!profileRepo.buyPen(pen.id)) return;
    soundSynth.playCoinBurst();
    gameEngine.setTrialPen(null);
    setTrialPenId(null);
    if (pen.id === GOLD_PEN_ID) {
      setLockerOpen(false);
      setGoldCelebration(true);
    } else {
      showToast(`Unlocked & equipped ${pen.name}!`);
    }
    if (hud.shellState === 'TITLE_MENU') {
      gameEngine.startAttractMode();
    }
  };

  const handleUpgradePen = (penId: string, part: PenUpgradePart, level: number): boolean => {
    if (!profileRepo.upgradePen(penId, part, level)) return false;
    soundSynth.playCoinBurst();
    return true;
  };

  const handleEquipDesk = (deskId: string) => {
    soundSynth.playUiTap();
    profileRepo.commit((d) => {
      if (d.unlockedDeskIds.includes(deskId)) {
        d.equippedDeskId = deskId;
      }
    });
    if (hud.shellState === 'TITLE_MENU') {
      gameEngine.startAttractMode();
    }
  };

  const handleTestRewardedQa = async () => {
    setPublisherOpen(false);
    setAdBusy(true);
    const res = await adService.showRewarded({
      rewardRequestId: `qa_test_${Date.now()}`,
      placement: 'coin_chest',
      contextId: 'qa_console',
      label: 'Publisher QA Rewarded Test',
      rewardSummary: 'Verifies the reward callback without granting Aura Points',
    });
    setAdBusy(false);
    showToast(`QA Rewarded Result: ${res.toUpperCase()}`);
  };

  const handleTestInterstitialQa = async () => {
    setPublisherOpen(false);
    setAdBusy(true);
    const res = await adService.maybeShowInterstitial(false, true);
    setAdBusy(false);
    showToast(`QA Interstitial Result: ${res.toUpperCase()}`);
  };

  return (
    <main className="relative flex h-[100dvh] w-full items-center justify-center bg-[#060911] overflow-hidden">
      <OfflineIndicator />

      {/* Centered Portrait Arcade Viewport (Full-bleed on Mobile, Sleek Portrait Frame on Desktop) */}
      <div className="relative h-full w-full max-w-[460px] sm:my-2 sm:h-[min(100dvh-16px,860px)] sm:rounded-[28px] sm:border sm:border-slate-800/90 sm:shadow-[0_24px_80px_rgba(0,0,0,0.85)] overflow-hidden bg-[#070B14]">
        {/* Isolated 60fps Canvas Container */}
        <canvas
          ref={canvasRef}
          className="block h-full w-full touch-none"
          aria-label="Pen Fight Aura Wars Physics Arena"
        />

        {/* Active Gameplay HUD */}
        {hud.shellState !== 'TITLE_MENU' && (
          <HudOverlay
            hud={hud}
            auraPoints={profile.coins}
            muted={profile.muted}
            onToggleMute={handleToggleMute}
            onPause={() => hud.mode === 'online' ? setConfirmOnlineLeave(true) : gameEngine.pauseGame()}
          />
        )}

        {/* Title Screen over Live Desk Attract Mode */}
        {hud.shellState === 'TITLE_MENU' && !showOpening && !startupSignIn && (
          <TitleScreen
            profile={profile}
            rankedProfile={account.profile}
            onOpenRank={() => openProgress('rank')}
            onFindRankedMatch={queueRanked}
            onOpenWeekly={() => setWeeklyOpen(true)}
            trialPenId={trialPenId}
            bannerInset={bannerInset}
            onStartMatch={handleStartMatch}
            onFindOnlineMatch={() => {
              soundSynth.unlock();
              soundSynth.playUiTap();
              online.findMatch();
            }}
            onOpenLocker={() => {
              soundSynth.unlock();
              soundSynth.playUiTap();
              setLockerOpen(true);
            }}
            onOpenPublisher={() => {
              soundSynth.unlock();
              soundSynth.playUiTap();
              setPublisherOpen(true);
            }}
            onOpenSettings={() => setSettingsOpen(true)}
            onSelectOpponent={handleSelectOpponent}
            onOpenProgress={() => openProgress('overview')}
          />
        )}

        {/* Pass & Play Turn Handoff Overlay */}
        {hud.shellState === 'PASS_HANDOFF' && (
          <PassHandoffModal
            turn={hud.turn}
            roundNumber={hud.roundNumber}
            onReady={() => gameEngine.confirmPassHandoff()}
          />
        )}

        {/* Tournament Second Chance Rewarded Ad Offer */}
        {hud.shellState === 'SECOND_CHANCE' && (
          <SecondChanceModal
            opponentName={hud.opponent.name}
            adBusy={adBusy}
            onWatchReviveAd={() => void handleWatchReviveAd()}
            onDecline={() => gameEngine.declineSecondChance()}
          />
        )}

        {/* Match summary and Aura Points breakdown */}
        {hud.shellState === 'MATCH_OVER' && hud.mode !== 'online' && (
          <MatchOverModal
            hud={hud}
            adBusy={adBusy}
            onWatchDoubleCoins={() => void handleWatchDoubleCoins()}
            onNextOrReplay={(idx) => void handleNextOrReplay(idx)}
            onOpenLocker={() => {
              soundSynth.playUiTap();
              setLockerOpen(true);
            }}
            onReturnMenu={() => {
              soundSynth.playUiTap();
              gameEngine.startAttractMode();
            }}
          />
        )}

        {(findingMatch || (hud.mode === 'online' && (confirmOnlineLeave || hud.shellState === 'MATCH_OVER'))) && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#070B14]/90 p-5">
            <section role="dialog" aria-modal="true" aria-labelledby="online-title"
              className="w-full max-w-sm rounded-3xl border border-slate-700 bg-[#111827] p-6 text-center">
              <h2 id="online-title" className="font-display text-2xl font-extrabold text-white">
                {findingMatch
                  ? online.phase === 'searching' ? 'Finding an opponent…' : online.mode === 'ranked' ? 'Ranked 1v1' : 'Guest 1v1'
                  : hud.shellState === 'MATCH_OVER' ? hud.statusBanner : 'Leave this match?'}
              </h2>
              <p role="status" className="mt-2 text-sm text-slate-300">
                {findingMatch
                  ? online.message || (online.mode === 'ranked' ? 'Searching for players near your Aura Rating.' : 'Looking for another player.')
                  : hud.shellState === 'MATCH_OVER'
                    ? `Final score ${hud.scoreP1}–${hud.scoreP2}`
                    : online.mode === 'ranked' ? 'Leaving an active ranked match can lower your rating.' : 'Leaving gives your opponent the win.'}
              </p>
              {online.result && hud.shellState === 'MATCH_OVER' && <RankedResult result={online.result} />}
              {online.mode === 'ranked' && hud.shellState === 'MATCH_OVER' && !online.result &&
                <p className="mt-3 text-xs text-slate-400">Rating unchanged. The match ended before both players took a turn.</p>}
              <div className="mt-5 flex justify-center gap-2">
                {(online.phase === 'error' || hud.shellState === 'MATCH_OVER') && (
                  <button type="button" className="rounded-xl bg-yellow-400 px-4 py-2 font-bold text-slate-950"
                    onClick={() => {
                      setConfirmOnlineLeave(false);
                      if (online.mode === 'ranked') queueRanked();
                      else online.findMatch();
                    }}>
                    Find Match
                  </button>
                )}
                {confirmOnlineLeave && hud.shellState !== 'MATCH_OVER' && (
                  <button type="button" className="rounded-xl bg-yellow-400 px-4 py-2 font-bold text-slate-950"
                    onClick={() => setConfirmOnlineLeave(false)}>
                    Keep Playing
                  </button>
                )}
                <button type="button" className="rounded-xl border border-slate-600 px-4 py-2 font-bold text-white"
                  onClick={async () => {
                    setConfirmOnlineLeave(false);
                    const leavingMidMatch = confirmOnlineLeave && hud.shellState !== 'MATCH_OVER';
                    const result = await online.leave();
                    if (leavingMidMatch && result) setExitRankedResult(result);
                  }}>
                  {findingMatch ? 'Back' : confirmOnlineLeave && hud.shellState !== 'MATCH_OVER' ? 'Leave Match' : 'Main Menu'}
                </button>
              </div>
            </section>
          </div>
        )}
        {online.versus && online.rankedPair && !confirmOnlineLeave && <RankedVersus match={online.rankedPair} />}
        {hud.mode === 'online' && online.phase === 'reconnecting' && hud.shellState === 'PLAYING' && (
          <p role="status" className="pointer-events-none absolute inset-x-0 top-24 z-20 text-center text-sm font-bold text-yellow-300">
            {online.message}
          </p>
        )}
        {hud.mode === 'online' && online.phase === 'playing' && hud.shellState === 'PLAYING'
          && hud.turnPhase === 'AIMING' && online.turnSeconds !== null && (
          <p className="pointer-events-none absolute inset-x-0 bottom-9 z-20 text-center text-xs font-bold text-slate-300">
            {hud.turn === 'p1' ? 'Your turn' : 'Opponent’s turn'} · {online.turnSeconds}s
          </p>
        )}

        {/* Pause Modal */}
        {hud.shellState === 'PAUSED' && (
          <PauseModal
            muted={profile.muted}
            reducedMotion={profile.reducedMotion}
            onResume={() => gameEngine.resumeGame()}
            onRestart={() => gameEngine.restartMatch()}
            onQuit={() => gameEngine.startAttractMode()}
            onToggleMute={handleToggleMute}
            onToggleReducedMotion={handleToggleReducedMotion}
          />
        )}

        {/* Subtle Non-Intrusive Feedback Toast */}
        {toast && (
          <div
            role="status"
            className="pointer-events-none absolute inset-x-5 bottom-16 z-[60] mx-auto w-fit max-w-full rounded-xl border border-slate-700 bg-[#0F172A]/95 px-4 py-2 text-center text-xs font-semibold text-white shadow-xl"
          >
            {toast}
          </div>
        )}
      </div>

      {weeklyOpen && <WeeklyTournament profile={profile} onClose={() => setWeeklyOpen(false)}
        onPlay={() => { if (gameEngine.startWeeklyMatch()) setWeeklyOpen(false); }} />}

      {/* Pen Garage and arenas */}
      {lockerOpen && (
        <PenLockerModal
          profile={profile}
          trialPenId={trialPenId}
          adBusy={adBusy}
          onClose={() => setLockerOpen(false)}
          onEquipPen={handleEquipPen}
          onUnlockPen={handleUnlockPen}
          onUpgradePen={handleUpgradePen}
          onWatchPenTrialAd={(pen) => void handleWatchPenTrialAd(pen)}
          onWatchCoinChestAd={() => void handleWatchCoinChestAd()}
          onEquipDesk={handleEquipDesk}
        />
      )}

      {/* AdMob Revenue & Google Play Store Console */}
      {AD_QA_ENABLED && publisherOpen && (
        <PublisherConsoleModal
          profile={profile}
          onClose={() => setPublisherOpen(false)}
          onTestRewarded={() => void handleTestRewardedQa()}
          onTestInterstitial={() => void handleTestInterstitialQa()}
          onResetProfile={() => {
            profileRepo.resetAll();
            setTrialPenId(null);
            gameEngine.setTrialPen(null);
            gameEngine.startAttractMode();
            showToast('Local profile reset to defaults.');
          }}
        />
      )}

      {progressOpen && <ProgressModal profile={profile} onClose={() => setProgressOpen(false)}
        initialView={progressInitialView} rankedProfile={account.profile} backup={backup}
        onSignIn={() => setRankedSignIn('account')} onSignOut={() => void saveAndSignOut()} />}
      {settingsOpen && <GameSettings profile={profile} account={account.profile} signedIn={!!account.token}
        backup={backup} signingOut={signingOut} onClose={() => setSettingsOpen(false)} onMute={handleToggleMute}
        onMotion={handleToggleReducedMotion} onSignIn={() => { setSettingsOpen(false); setRankedSignIn('account'); }}
        onSignOut={() => void saveAndSignOut()} />}
      {(startupSignIn || (rankedSignIn && !account.token)) &&
        <RankedSignIn account={account} startup={startupSignIn}
          onClose={startupSignIn ? continueAsGuest : () => setRankedSignIn(null)} />}
      {showOpening && <OpeningScreen restoring={!splash && restoring}
        unavailable={backup.status === 'offline'} onGuest={continueAsGuest} />}
      {exitRankedResult && <div className="fixed inset-0 z-40 grid place-items-center bg-black/80 p-5">
        <section role="dialog" aria-modal="true" aria-label="Ranked result" className="w-full max-w-sm rounded-3xl border border-sky-800 bg-[#101c2d] p-5 text-center">
          <h2 className="font-display text-xl font-bold">Ranked result</h2>
          <RankedResult result={exitRankedResult} />
          <button type="button" onClick={() => setExitRankedResult(undefined)}
            className="mt-4 min-h-11 rounded-xl bg-cyan-300 px-5 text-sm font-bold text-slate-950">Done</button>
        </section>
      </div>}
      {goldCelebration && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#070B14]/95 p-5">
          <section role="dialog" aria-modal="true" aria-label="Gold Fountain unlocked"
            className={`w-full max-w-sm rounded-3xl border border-amber-300/60 bg-gradient-to-b from-amber-950 to-slate-950 p-6 text-center ${profile.reducedMotion ? '' : 'gold-unlock-reveal'}`}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Golden Legacy</p>
            <PenPreviewSvg pen={getPenById(GOLD_PEN_ID)} className="my-4 h-24 w-full drop-shadow-[0_0_18px_rgba(251,191,36,0.55)]" />
            <h2 className="font-display text-3xl font-extrabold text-amber-100">Gold Fountain</h2>
            <p className="mt-2 text-sm text-amber-200">Unlocked and equipped. Your Golden Legacy badge is saved to your profile.</p>
            <button type="button" onClick={() => setGoldCelebration(false)}
              className="mt-5 w-full rounded-xl bg-amber-300 py-3 font-extrabold text-slate-950">Continue</button>
          </section>
        </div>
      )}

      {/* Interactive Web AdMob QA Preview Overlay */}
      {AD_QA_ENABLED && <AdMobOverlay ad={previewAd} />}
    </main>
  );
}
