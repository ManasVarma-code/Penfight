import { useEffect, useRef, useState } from 'react';
import { AdMobOverlay } from './components/AdMobOverlay';
import { HudOverlay } from './components/HudOverlay';
import {
  MatchOverModal,
  PassHandoffModal,
  PauseModal,
  SecondChanceModal,
} from './components/MatchModals';
import { PenLockerModal } from './components/PenLockerModal';
import { PublisherConsoleModal } from './components/PublisherConsoleModal';
import { OfflineIndicator } from './components/PWAComponents';
import { TitleScreen } from './components/TitleScreen';
import { ActivePreviewAd, adService } from './game/ads/adService';
import { soundSynth } from './game/audio';
import { getDeskById, getOpponentByIndex, getPenById } from './game/content';
import { gameEngine } from './game/engine';
import { getLocalDayKey, profileRepo } from './game/persistence';
import { useOnlineDuel } from './game/useOnlineDuel';
import { HudSnapshot, MatchMode, PenSpec, ProfileV1 } from './game/types';

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
  const [publisherOpen, setPublisherOpen] = useState(false);
  const [previewAd, setPreviewAd] = useState<ActivePreviewAd | null>(null);
  const [adBusy, setAdBusy] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [trialPenId, setTrialPenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const online = useOnlineDuel();
  const [confirmOnlineLeave, setConfirmOnlineLeave] = useState(false);
  const findingMatch = hud.shellState === 'TITLE_MENU' && (
    online.phase === 'searching' || online.phase === 'reconnecting' || online.phase === 'error'
  );

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((cur) => (cur === msg ? null : cur));
    }, 2800);
  };

  useEffect(() => {
    soundSynth.setMuted(profileRepo.get().muted);
    void profileRepo.hydrate().then((p) => {
      setProfile(p);
      soundSynth.setMuted(p.muted);
    });
    if (profileRepo.recoveryWarning) {
      showToast(profileRepo.recoveryWarning);
    }

    const unsubProfile = profileRepo.subscribe((next) => {
      setProfile(next);
      soundSynth.setMuted(next.muted);
    });
    const unsubAdPreview = adService.subscribePreview((ad) => setPreviewAd(ad));
    const unsubBanner = adService.subscribeBanner((vis) => setBannerVisible(vis));

    void adService.initialize();

    return () => {
      unsubProfile();
      unsubAdPreview();
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
        !lockerOpen &&
        !publisherOpen &&
        !previewAd &&
        !findingMatch &&
        !(e.target instanceof HTMLElement && e.target.closest('button, input, a')) &&
        (e.key === 'Enter' || e.key === ' ')
      ) {
        e.preventDefault();
        gameEngine.startMatch('tournament', profile.selectedOpponentIndex);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hud.shellState, lockerOpen, publisherOpen, previewAd, findingMatch, profile.selectedOpponentIndex]);

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
      showToast('Ad unavailable right now.');
    }
  };

  // --- REWARDED AD PLACEMENT 2: Double Match Aura Points ---
  const handleWatchDoubleCoins = async () => {
    if (adBusy || !hud.ledger || hud.ledger.doubled) return;
    setAdBusy(true);
    const bonus = hud.ledger.totalCoins;
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
      const granted = profileRepo.grantCoinsAtomic(txId, bonus);
      if (granted) {
        soundSynth.playCoinBurst();
        gameEngine.markLedgerDoubled(bonus);
        showToast(`+${bonus} bonus Aura Points!`);
      }
    } else if (outcome === 'unearned') {
      showToast('Watch the full ad to double your Aura Points.');
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
      showToast('Ad unavailable right now.');
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
      showToast('Ad unavailable right now.');
    }
  };

  // --- SMART INTERSTITIAL AT NATURAL BETWEEN-MATCH TRANSITION ---
  const handleNextOrReplay = async (nextOpponentIndex?: number) => {
    if (adBusy) return;
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
    if (profile.coins < pen.unlockCoins || profile.unlockedPens.includes(pen.id)) return;
    soundSynth.playCoinBurst();
    gameEngine.setTrialPen(null);
    setTrialPenId(null);
    profileRepo.commit((d) => {
      if (d.coins >= pen.unlockCoins && !d.unlockedPens.includes(pen.id)) {
        d.coins -= pen.unlockCoins;
        d.unlockedPens.push(pen.id);
        d.equippedPenId = pen.id;
      }
    });
    showToast(`Unlocked & equipped ${pen.name}!`);
    if (hud.shellState === 'TITLE_MENU') {
      gameEngine.startAttractMode();
    }
  };

  const handleUpgradeMastery = (penId: string) => {
    const cur = profile.penMastery[penId] || 0;
    const cost = 120 + cur * 90;
    if (cur >= 5 || profile.coins < cost) return;
    soundSynth.playCoinBurst();
    profileRepo.commit((d) => {
      const c = d.penMastery[penId] || 0;
      const price = 120 + c * 90;
      if (c < 5 && d.coins >= price) {
        d.coins -= price;
        d.penMastery[penId] = c + 1;
      }
    });
    showToast(`Mastery +${cur + 1}% applied (Tournament)!`);
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
        {hud.shellState === 'TITLE_MENU' && (
          <TitleScreen
            profile={profile}
            trialPenId={trialPenId}
            bannerVisible={bannerVisible}
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
            onToggleMute={handleToggleMute}
            onSelectOpponent={handleSelectOpponent}
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
                  ? online.phase === 'searching' ? 'Finding an opponent…' : 'Play Online'
                  : hud.shellState === 'MATCH_OVER' ? hud.statusBanner : 'Leave this match?'}
              </h2>
              <p role="status" className="mt-2 text-sm text-slate-300">
                {findingMatch
                  ? online.message || 'Looking for another player.'
                  : hud.shellState === 'MATCH_OVER'
                    ? `Final score ${hud.scoreP1}–${hud.scoreP2}`
                    : 'Leaving gives your opponent the win.'}
              </p>
              <div className="mt-5 flex justify-center gap-2">
                {(online.phase === 'error' || hud.shellState === 'MATCH_OVER') && (
                  <button type="button" className="rounded-xl bg-yellow-400 px-4 py-2 font-bold text-slate-950"
                    onClick={() => {
                      setConfirmOnlineLeave(false);
                      online.leave();
                      online.findMatch();
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
                  onClick={() => {
                    setConfirmOnlineLeave(false);
                    online.leave();
                  }}>
                  {findingMatch ? 'Back' : 'Main Menu'}
                </button>
              </div>
            </section>
          </div>
        )}
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
            onRestart={() => gameEngine.startMatch(hud.mode, hud.opponent.index)}
            onQuit={() => gameEngine.startAttractMode()}
            onToggleMute={handleToggleMute}
            onToggleReducedMotion={handleToggleReducedMotion}
          />
        )}

        {/* Subtle Non-Intrusive Feedback Toast */}
        {toast && (
          <div
            role="status"
            className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 z-40 rounded-xl border border-slate-700 bg-[#0F172A]/95 px-4 py-2 text-xs font-semibold text-white shadow-xl whitespace-nowrap"
          >
            {toast}
          </div>
        )}
      </div>

      {/* Pen Locker & Desk Arenas Modal */}
      {lockerOpen && (
        <PenLockerModal
          profile={profile}
          trialPenId={trialPenId}
          adBusy={adBusy}
          onClose={() => setLockerOpen(false)}
          onEquipPen={handleEquipPen}
          onUnlockPen={handleUnlockPen}
          onUpgradeMastery={handleUpgradeMastery}
          onWatchPenTrialAd={(pen) => void handleWatchPenTrialAd(pen)}
          onWatchCoinChestAd={() => void handleWatchCoinChestAd()}
          onEquipDesk={handleEquipDesk}
        />
      )}

      {/* AdMob Revenue & Google Play Store Console */}
      {publisherOpen && (
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

      {/* Interactive Web AdMob QA Preview Overlay */}
      <AdMobOverlay ad={previewAd} />
    </main>
  );
}
