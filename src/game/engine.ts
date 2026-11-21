import { adService } from './ads/adService';
import { planAiFlick } from './ai/aiController';
import { soundSynth } from './audio';
import {
  DOUBLE_KO_WINDOW_MS,
  DRAW_SHOT_LIMIT,
  FIXED_DT,
  getDeskById,
  getOpponentByIndex,
  getPenById,
  getTournamentRivalPen,
  HARD_TURN_TIMEOUT_SECONDS,
  MAX_DRAG_WORLD,
  MAX_SUBSTEPS,
  MIN_DRAG_WORLD,
  PENS,
  REST_HOLD_SECONDS,
  SUDDEN_DEATH_START_SHOT,
  TOURNAMENT_LADDER,
  TURBO_IMPULSE_MULT,
  WORLD_H,
  WORLD_W,
} from './content';
import { profileRepo } from './persistence';
import {
  ONLINE_DESK, ONLINE_FRAME_MS, ONLINE_PEN,
  type OnlineFlick, type OnlineSide, type OnlineStatus,
} from './onlineProtocol';
import { MatterPhysicsAdapter } from './physics/matterAdapter';
import {
  CanvasRenderer,
  FloatingCallout,
  ShockwaveRing,
  SparkParticle,
} from './render/canvasRenderer';
import {
  AimPreviewState,
  DeskSpec,
  FlickCommand,
  GameShellState,
  HudSnapshot,
  MatchLedger,
  MatchMode,
  OpponentSpec,
  PenBodyState,
  PenSpec,
  PhysicsEvent,
  PhysicsSnapshot,
  TurnPhase,
} from './types';

interface DragState {
  pointerId: number;
  startWorldX: number;
  startWorldY: number;
  curWorldX: number;
  curWorldY: number;
  gripOffset01: number;
  gripX: number;
  gripY: number;
}

export class PenFightEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private physics = new MatterPhysicsAdapter();
  private renderer = new CanvasRenderer();
  private rafId: number | null = null;
  private lastFrameTs = 0;
  private accumulator = 0;
  private timeSec = 0;

  // Viewport transform cache for DPR-independent screen -> world conversion
  private viewScale = 1;
  private viewOffsetX = 0;
  private viewOffsetY = 0;

  // Match State Machine
  private shellState: GameShellState = 'TITLE_MENU';
  private prePauseState: GameShellState = 'PLAYING';
  private mode: MatchMode = 'tournament';
  private turn: 'p1' | 'p2' = 'p1';
  private turnPhase: TurnPhase = 'AIMING';
  private roundNumber = 1;
  private startingTurnThisRound: 'p1' | 'p2' = 'p1';
  private scoreP1 = 0;
  private scoreP2 = 0;
  private surgeP1 = 0;
  private surgeP2 = 0;
  private shotsInRound = 0;
  private revivedThisMatch = false;
  private watchedRewardedThisMatch = false;
  private matchId = '';
  private critAwardedThisMatch = false;
  private oneShotKoEarned = false;
  private awardedSurgeShotIds = new Set<string>();
  private lastRoundDraw = false;

  // Current match configuration
  private opponent: OpponentSpec = getOpponentByIndex(0);
  private desk: DeskSpec = getDeskById('school_oak');
  private p1Pen: PenSpec = getPenById('classic_ballpoint');
  private p2Pen: PenSpec = getPenById('classic_ballpoint');
  private trialPenId: string | null = null;
  private matchSeed = 1001;
  private shotCounter = 0;

  // Turn & KO timers
  private turnSimElapsed = 0;
  private aiThinkTimer = 0;
  private readonly aiThinkDuration = 0.65;
  private aiPlan: ReturnType<typeof planAiFlick> | null = null;
  private aiShot: FlickCommand | null = null;
  private firstRingOutOwner: 'p1' | 'p2' | null = null;
  private firstRingOutAtMs = 0;
  private bothRingOut = false;
  private koSlowMoTimer = 0;
  private visualHitstop = 0;
  private shakeMag = 0;

  // Attract mode timer
  private attractTimer = 0.8;
  private attractTurn: 'p1' | 'p2' = 'p1';

  // Input & keyboard aim state
  private drag: DragState | null = null;
  private kbAimAngle = -Math.PI / 2;
  private kbPower = 0.72;
  private kbGrip = 0;
  private kbActive = false;

  // VFX pools
  private sparks: SparkParticle[] = [];
  private rings: ShockwaveRing[] = [];
  private callouts: FloatingCallout[] = [];
  private statusBanner: string | null = null;
  private ledger: MatchLedger | null = null;

  private hudListener: ((snap: HudSnapshot) => void) | null = null;
  private online: {
    packet: Extract<OnlineStatus, { status: 'matched' }>;
    receivedAt: number;
    frameIndex: number;
    pending: boolean;
    snapshot: PhysicsSnapshot;
    submit: (revision: number, flick: OnlineFlick) => Promise<void>;
  } | null = null;

  setOnlineState(
    packet: Extract<OnlineStatus, { status: 'matched' }>,
    submit: (revision: number, flick: OnlineFlick) => Promise<void>
  ): void {
    if (this.online?.packet.state.revision === packet.state.revision) return;
    if (!this.online) {
      this.mode = 'online';
      this.desk = getDeskById(ONLINE_DESK);
      this.p1Pen = this.p2Pen = getPenById(ONLINE_PEN);
      this.opponent = { ...getOpponentByIndex(0), name: 'Opponent' };
      this.roundNumber = 1;
      this.scoreP1 = this.scoreP2 = this.surgeP1 = this.surgeP2 = this.shotsInRound = 0;
      this.sparks = [];
      this.rings = [];
      this.callouts = [];
      this.ledger = null;
      this.lastRoundDraw = false;
      this.statusBanner = null;
      void adService.setMenuBannerVisible(false);
    }
    this.shellState = 'PLAYING';
    this.drag = null;
    this.kbActive = false;
    this.online = {
      packet, receivedAt: performance.now(), frameIndex: -1, pending: false, submit,
      snapshot: this.localOnlineSnapshot(packet.replay?.frames[0].snapshot ?? packet.state.snapshot, packet.side),
    };
    if (packet.replay) {
      this.turnPhase = 'SIMULATING';
      this.emitHud();
    } else {
      this.finishOnlineReplay();
    }
  }

  private localOnlineSnapshot(snapshot: PhysicsSnapshot, side: OnlineSide): PhysicsSnapshot {
    if (side === 'p1') return snapshot;
    return {
      ...snapshot,
      p1: { ...snapshot.p2, owner: 'p1' },
      p2: { ...snapshot.p1, owner: 'p2' },
    };
  }

  private currentSnapshot(): PhysicsSnapshot {
    return this.online?.snapshot ?? this.physics.snapshot();
  }

  private finishOnlineReplay(): void {
    const online = this.online;
    if (!online) return;
    const { side, state } = online.packet;
    const opponent = side === 'p1' ? 'p2' : 'p1';
    online.snapshot = this.localOnlineSnapshot(state.snapshot, side);
    this.turn = state.turn === side ? 'p1' : 'p2';
    this.roundNumber = state.round;
    this.shotsInRound = state.shots;
    this.scoreP1 = state.score[side];
    this.scoreP2 = state.score[opponent];
    this.surgeP1 = state.surge[side];
    this.surgeP2 = state.surge[opponent];
    this.turnPhase = 'AIMING';
    this.statusBanner = state.winner ? (state.winner === side ? 'You won!' : 'Opponent won')
      : this.turn === 'p1' ? 'Your turn' : 'Opponent’s turn';
    this.shellState = state.winner ? 'MATCH_OVER' : 'PLAYING';
    this.emitHud();
  }

  private updateOnlineReplay(reducedMotion: boolean): void {
    const online = this.online;
    const replay = online?.packet.replay;
    if (!online || !replay || online.frameIndex >= replay.frames.length) return;
    const now = online.packet.now + performance.now() - online.receivedAt;
    if (now < replay.startAt) return;
    const index = Math.min(replay.frames.length - 1, Math.floor((now - replay.startAt) / ONLINE_FRAME_MS));
    if (online.frameIndex < 0) soundSynth.playFlick(replay.power, replay.turbo);
    for (let i = online.frameIndex + 1; i <= index; i++) {
      this.processPhysicsEvents(replay.frames[i].events, reducedMotion, true);
    }
    online.frameIndex = index;
    online.snapshot = this.localOnlineSnapshot(replay.frames[index].snapshot, online.packet.side);
    if (now >= replay.endAt) {
      online.frameIndex = replay.frames.length;
      this.finishOnlineReplay();
    }
  }

  attach(canvas: HTMLCanvasElement, onHud: (snap: HudSnapshot) => void): () => void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hudListener = onHud;

    const handleResize = () => this.resizeCanvas();
    const handlePointerDown = (e: PointerEvent) => this.onPointerDown(e);
    const handlePointerMove = (e: PointerEvent) => this.onPointerMove(e);
    const handlePointerUp = (e: PointerEvent) => this.onPointerUp(e);
    const handlePointerCancel = () => {
      this.drag = null;
    };
    const handleKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
    const handleBlur = () => {
      this.drag = null;
      this.kbActive = false;
      if (this.shellState === 'PLAYING') {
        this.pauseGame();
      }
    };
    const handleVisibility = () => {
      if (document.hidden && this.shellState === 'PLAYING') {
        this.pauseGame();
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);

    this.resizeCanvas();
    this.startAttractMode();
    this.emitHud();

    this.lastFrameTs = performance.now();
    const tick = (ts: number) => {
      this.rafId = requestAnimationFrame(tick);
      this.frame(ts);
    };
    this.rafId = requestAnimationFrame(tick);

    return () => {
      if (this.rafId !== null) cancelAnimationFrame(this.rafId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('keydown', handleKeyDown);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      this.canvas = null;
      this.ctx = null;
    };
  }

  private resizeCanvas(): void {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const rect = parent.getBoundingClientRect();
    const w = Math.max(300, Math.floor(rect.width));
    const h = Math.max(400, Math.floor(rect.height));
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  private screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    if (!this.canvas) return { x: WORLD_W / 2, y: WORLD_H / 2 };
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / Math.max(1, rect.width);
    const cx = (clientX - rect.left) * dpr;
    const cy = (clientY - rect.top) * dpr;
    return {
      x: (cx - this.viewOffsetX) / this.viewScale,
      y: (cy - this.viewOffsetY) / this.viewScale,
    };
  }

  setTrialPen(penId: string | null): void {
    this.trialPenId = penId;
    this.emitHud();
  }

  getTrialPenId(): string | null {
    return this.trialPenId;
  }

  startAttractMode(): void {
    this.aiPlan = null;
    this.aiShot = null;
    if (this.online) {
      this.online = null;
      this.mode = 'tournament';
    }
    this.shellState = 'TITLE_MENU';
    this.drag = null;
    this.kbActive = false;
    this.ledger = null;
    this.statusBanner = null;
    const profile = profileRepo.get();
    this.desk = getDeskById(profile.equippedDeskId);
    this.p1Pen = getPenById(this.trialPenId ?? profile.equippedPenId);
    this.p2Pen = getPenById('chunky_marker');
    this.opponent = getOpponentByIndex(profile.selectedOpponentIndex);
    this.physics.initializeRound(
      Date.now() & 0xffff,
      this.p1Pen,
      this.p2Pen,
      'ai',
      this.desk
    );
    this.attractTimer = 0.7;
    void adService.setMenuBannerVisible(true);
    this.emitHud();
  }

  startMatch(mode: MatchMode, opponentIndex?: number): void {
    if (mode === 'online') return;
    this.online = null;
    soundSynth.unlock();
    soundSynth.playUiTap();

    // Hide adaptive menu banner immediately during gameplay (AdMob click-safety policy)
    void adService.setMenuBannerVisible(false);

    const profile = profileRepo.get();
    this.mode = mode;
    const selectedIndex = opponentIndex ?? profile.selectedOpponentIndex;
    this.opponent = getOpponentByIndex(
      mode === 'tournament' ? Math.min(selectedIndex, profile.highestTournamentOpponent) : selectedIndex
    );

    if (mode === 'tournament') {
      profileRepo.commit((d) => {
        d.selectedOpponentIndex = this.opponent.index;
      });
      this.desk = getDeskById(
        profile.unlockedDeskIds.includes(profile.equippedDeskId)
          ? profile.equippedDeskId
          : this.opponent.deskId
      );
      this.p1Pen = getPenById(this.trialPenId ?? profile.equippedPenId);
      this.p2Pen = getTournamentRivalPen(this.opponent.penId);
    } else {
      // Pass & Play: fair neutral stats, player's equipped desk
      this.desk = getDeskById(profile.equippedDeskId);
      this.p1Pen = getPenById(profile.equippedPenId);
      const p2Choice = PENS.find((p) => p.id !== this.p1Pen.id) ?? PENS[1];
      this.p2Pen = p2Choice;
    }

    this.matchId = `match_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    this.matchSeed = (Date.now() & 0xffffff) + 17;
    this.roundNumber = 1;
    this.startingTurnThisRound = 'p1';
    this.scoreP1 = 0;
    this.scoreP2 = 0;
    this.surgeP1 = 0;
    this.surgeP2 = 0;
    this.revivedThisMatch = false;
    this.watchedRewardedThisMatch = false;
    this.critAwardedThisMatch = false;
    this.oneShotKoEarned = false;
    this.ledger = null;
    this.lastRoundDraw = false;
    this.sparks = [];
    this.rings = [];
    this.callouts = [];

    this.setupRound(this.startingTurnThisRound);
  }

  private setupRound(starter: 'p1' | 'p2'): void {
    this.aiPlan = null;
    this.aiShot = null;
    const profile = profileRepo.get();
    const p1Mastery =
      this.mode === 'tournament'
        ? 1 + (profile.penMastery[this.p1Pen.id] || 0) * 0.01
        : 1.0;

    this.physics.initializeRound(
      this.matchSeed + this.roundNumber * 97 + this.shotCounter,
      this.p1Pen,
      this.p2Pen,
      this.mode === 'tournament' ? 'ai' : 'p2',
      this.desk,
      p1Mastery,
      1.0
    );

    this.turn = starter;
    this.shotsInRound = 0;
    this.turnSimElapsed = 0;
    this.firstRingOutOwner = null;
    this.firstRingOutAtMs = 0;
    this.bothRingOut = false;
    this.koSlowMoTimer = 0;
    this.drag = null;
    this.kbActive = false;
    this.statusBanner = null;
    this.awardedSurgeShotIds.clear();

    if (this.mode === 'pass_and_play') {
      this.shellState = 'PASS_HANDOFF';
      this.turnPhase = 'AIMING';
    } else {
      this.shellState = 'PLAYING';
      if (this.turn === 'p2') {
        this.beginAiThink();
      } else {
        this.turnPhase = 'AIMING';
      }
    }
    this.emitHud();
  }

  confirmPassHandoff(): void {
    if (this.shellState !== 'PASS_HANDOFF') return;
    soundSynth.unlock();
    soundSynth.playUiTap();
    this.shellState = 'PLAYING';
    this.turnPhase = 'AIMING';
    this.emitHud();
  }

  pauseGame(): void {
    if (this.online) return;
    if (this.shellState === 'PLAYING' || this.shellState === 'PASS_HANDOFF') {
      this.prePauseState = this.shellState;
      this.shellState = 'PAUSED';
      this.drag = null;
      this.emitHud();
    }
  }

  resumeGame(): void {
    if (this.shellState === 'PAUSED') {
      soundSynth.playUiTap();
      this.shellState = this.prePauseState;
      this.lastFrameTs = performance.now();
      this.emitHud();
    }
  }

  /**
   * Revised Second Chance Edge Save (Blueprint §8.1):
   * On verified earned reward, replay the lost round from a fair symmetric starting setup
   * while preserving current match score.
   */
  applySecondChanceRevive(): void {
    if (this.shellState !== 'SECOND_CHANCE') return;
    this.revivedThisMatch = true;
    this.watchedRewardedThisMatch = true;
    soundSynth.playCoinBurst();
    this.addCallout('SECOND CHANCE!', 'SYMMETRIC REMATCH', WORLD_W / 2, WORLD_H * 0.44, '#10B981');
    this.setupRound('p1');
  }

  declineSecondChance(): void {
    if (this.shellState !== 'SECOND_CHANCE') return;
    this.finalizeMatch(false);
  }

  markRewardedWatchedInMatch(): void {
    this.watchedRewardedThisMatch = true;
  }

  markLedgerDoubled(extraCoins: number): void {
    if (!this.ledger || this.ledger.doubled) return;
    this.ledger = {
      ...this.ledger,
      doubled: true,
      totalCoins: this.ledger.totalCoins + extraCoins,
    };
    this.watchedRewardedThisMatch = true;
    this.emitHud();
  }

  didWatchRewardedThisMatch(): boolean {
    return this.watchedRewardedThisMatch;
  }

  private beginAiThink(): void {
    this.turnPhase = 'AI_THINKING';
    this.aiThinkTimer = 0;
    this.aiShot = null;
    this.aiPlan = planAiFlick(
      this.physics.snapshot(),
      this.desk,
      this.opponent.index,
      `shot_${this.matchId}_${this.shotCounter + 1}`,
      this.surgeP2 >= 100 ? TURBO_IMPULSE_MULT : 1,
      this.getSuddenDeathMult(this.shotsInRound + 1)
    );
    this.emitHud();
  }

  private getSuddenDeathMult(shots = this.shotsInRound): number {
    if (shots < SUDDEN_DEATH_START_SHOT) return 1.0;
    const steps = Math.min(5, shots - SUDDEN_DEATH_START_SHOT + 1);
    return 1 + steps * 0.03; // Caps at +15% (Blueprint §2.1)
  }

  private executeFlick(command: FlickCommand): void {
    const online = this.online;
    if (online) {
      if (online.pending || this.turn !== 'p1' || this.turnPhase !== 'AIMING') return;
      online.pending = true;
      this.drag = null;
      this.kbActive = false;
      const { aimRadians, gripOffset01, normalizedPower } = command;
      void online.submit(online.packet.state.revision, { aimRadians, gripOffset01, normalizedPower })
        .catch(() => { online.pending = false; });
      return;
    }
    this.shotCounter += 1;
    this.shotsInRound += 1;
    const isP1 = command.playerId === 'p1';
    const currentSurge = isP1 ? this.surgeP1 : this.surgeP2;
    const isTurbo = currentSurge >= 100;

    if (isTurbo) {
      if (isP1) this.surgeP1 = 0;
      else this.surgeP2 = 0;
      const pen = this.physics.getPen(command.playerId);
      this.addCallout(
        'TURBO FLICK!',
        '+20% IMPULSE',
        pen.body.position.x,
        pen.body.position.y - 26,
        '#FACC15'
      );
      this.spawnRing(pen.body.position.x, pen.body.position.y, 64, '#FACC15');
    }

    const turboMult = isTurbo ? TURBO_IMPULSE_MULT : 1.0;
    const sdMult = this.getSuddenDeathMult();

    this.physics.submitFlick(command, turboMult, sdMult);
    soundSynth.playFlick(command.normalizedPower, isTurbo);

    this.turnPhase = 'SIMULATING';
    this.turnSimElapsed = 0;
    this.drag = null;
    this.kbActive = false;

    if (this.shotsInRound === SUDDEN_DEATH_START_SHOT) {
      this.addCallout('SUDDEN DEATH', '+POWER ACTIVE', WORLD_W / 2, WORLD_H * 0.42, '#F43F5E');
    }

    this.emitHud();
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.shellState !== 'PLAYING' || this.turnPhase !== 'AIMING') return;
    if ((this.mode !== 'pass_and_play' && this.turn === 'p2') || this.online?.pending) return;
    soundSynth.unlock();

    const w = this.screenToWorld(e.clientX, e.clientY);
    const snap = this.currentSnapshot();
    const activePen = this.turn === 'p1' ? snap.p1 : snap.p2;
    if (activePen.outOfBounds) return;

    // Project pointer onto pen spine with generous mobile thumb hitbox
    const dx = w.x - activePen.x;
    const dy = w.y - activePen.y;
    const cosA = Math.cos(activePen.angle);
    const sinA = Math.sin(activePen.angle);
    const along = dx * cosA + dy * sinA;
    const perp = Math.abs(-dx * sinA + dy * cosA);
    const halfL = activePen.spec.length * 0.5;

    // Allow grabbing directly on pen OR within generous 52-unit radius around it
    const distFromSegment = Math.hypot(Math.max(0, Math.abs(along) - halfL), perp);
    if (distFromSegment > 58) return;

    const clampedAlong = Math.max(-halfL * 0.9, Math.min(halfL * 0.9, along));
    const gripOffset01 = clampedAlong / (halfL * 0.9);
    const gripX = activePen.x + cosA * clampedAlong;
    const gripY = activePen.y + sinA * clampedAlong;

    this.drag = {
      pointerId: e.pointerId,
      startWorldX: w.x,
      startWorldY: w.y,
      curWorldX: w.x,
      curWorldY: w.y,
      gripOffset01,
      gripX,
      gripY,
    };
    this.kbActive = false;
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    const w = this.screenToWorld(e.clientX, e.clientY);
    this.drag.curWorldX = w.x;
    this.drag.curWorldY = w.y;
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    const preview = this.buildAimPreview();
    this.drag = null;

    if (!preview || preview.cancelled) return;

    this.executeFlick({
      shotId: `shot_${this.matchId}_${this.shotCounter + 1}`,
      playerId: preview.owner,
      gripOffset01: preview.gripOffset01,
      aimRadians: preview.aimRadians,
      normalizedPower: preview.normalizedPower,
    });
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.shellState === 'PLAYING' || this.shellState === 'PASS_HANDOFF') {
        this.pauseGame();
      } else if (this.shellState === 'PAUSED') {
        this.resumeGame();
      }
      return;
    }

    if (this.shellState === 'PASS_HANDOFF' && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      this.confirmPassHandoff();
      return;
    }

    if (this.shellState !== 'PLAYING' || this.turnPhase !== 'AIMING') return;
    if ((this.mode !== 'pass_and_play' && this.turn === 'p2') || this.online?.pending) return;

    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      this.kbActive = true;
      this.kbAimAngle -= 0.1;
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      this.kbActive = true;
      this.kbAimAngle += 0.1;
    } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      this.kbActive = true;
      this.kbPower = Math.min(1, this.kbPower + 0.08);
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      this.kbActive = true;
      this.kbPower = Math.max(0.2, this.kbPower - 0.08);
    } else if (e.key === 'q' || e.key === 'Q') {
      this.kbActive = true;
      this.kbGrip = Math.max(-0.9, this.kbGrip - 0.25);
    } else if (e.key === 'e' || e.key === 'E') {
      this.kbActive = true;
      this.kbGrip = Math.min(0.9, this.kbGrip + 0.25);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      soundSynth.unlock();
      if (!this.kbActive) {
        // Aim automatically toward opponent on quick Space tap
        const snap = this.currentSnapshot();
        const me = this.turn === 'p1' ? snap.p1 : snap.p2;
        const foe = this.turn === 'p1' ? snap.p2 : snap.p1;
        this.kbAimAngle = Math.atan2(foe.y - me.y, foe.x - me.x);
      }
      this.executeFlick({
        shotId: `shot_${this.matchId}_${this.shotCounter + 1}`,
        playerId: this.turn === 'p1' ? 'p1' : 'p2',
        gripOffset01: this.kbGrip,
        aimRadians: this.kbAimAngle,
        normalizedPower: this.kbPower,
      });
    }
  }

  private buildAimPreview(): AimPreviewState | null {
    if (this.shellState !== 'PLAYING' || this.turnPhase !== 'AIMING') return null;
    const snap = this.currentSnapshot();
    const activePen: PenBodyState = this.turn === 'p1' ? snap.p1 : snap.p2;
    if (activePen.outOfBounds) return null;

    if (this.drag) {
      // Slingshot vector: pull back to launch forward (p_down - p_cur)
      const dx = this.drag.startWorldX - this.drag.curWorldX;
      const dy = this.drag.startWorldY - this.drag.curWorldY;
      const mag = Math.hypot(dx, dy);
      const cancelled = mag < MIN_DRAG_WORLD;
      const clampedMag = Math.min(MAX_DRAG_WORLD, mag);
      const aimRadians = mag > 0.001 ? Math.atan2(dy, dx) : -Math.PI / 2;
      const normalizedPower = clampedMag / MAX_DRAG_WORLD;

      const cosA = Math.cos(activePen.angle);
      const sinA = Math.sin(activePen.angle);
      const rx = cosA * this.drag.gripOffset01;
      const ry = sinA * this.drag.gripOffset01;
      const cross = rx * Math.sin(aimRadians) - ry * Math.cos(aimRadians);
      const spinSign: -1 | 0 | 1 =
        Math.abs(cross) < 0.22 ? 0 : cross > 0 ? 1 : -1;

      return {
        active: true,
        owner: activePen.owner,
        gripOffset01: this.drag.gripOffset01,
        gripX: this.drag.gripX,
        gripY: this.drag.gripY,
        aimRadians,
        normalizedPower,
        spinSign,
        shotKind: spinSign === 0 ? 'RAM' : spinSign > 0 ? 'RIGHT WHIP' : 'LEFT WHIP',
        cancelled,
      };
    }

    if (this.kbActive) {
      const halfL = activePen.spec.length * 0.45;
      const cosA = Math.cos(activePen.angle);
      const sinA = Math.sin(activePen.angle);
      const gripX = activePen.x + cosA * (this.kbGrip * halfL);
      const gripY = activePen.y + sinA * (this.kbGrip * halfL);
      const cross =
        cosA * this.kbGrip * Math.sin(this.kbAimAngle) -
        sinA * this.kbGrip * Math.cos(this.kbAimAngle);
      const spinSign: -1 | 0 | 1 =
        Math.abs(cross) < 0.22 ? 0 : cross > 0 ? 1 : -1;

      return {
        active: true,
        owner: activePen.owner,
        gripOffset01: this.kbGrip,
        gripX,
        gripY,
        aimRadians: this.kbAimAngle,
        normalizedPower: this.kbPower,
        spinSign,
        shotKind: spinSign === 0 ? 'RAM' : spinSign > 0 ? 'RIGHT WHIP' : 'LEFT WHIP',
        cancelled: false,
      };
    }

    return null;
  }

  private frame(ts: number): void {
    const rawDt = Math.max(0, (ts - this.lastFrameTs) / 1000);
    this.lastFrameTs = ts;
    const clampedDt = Math.min(rawDt, 0.05);
    this.timeSec += clampedDt;

    const reducedMotion = profileRepo.get().reducedMotion;

    // Update VFX particles & callouts
    this.updateVfx(clampedDt);

    if (this.shellState === 'TITLE_MENU') {
      this.updateAttractMode(clampedDt);
    } else if (this.online) {
      this.updateOnlineReplay(reducedMotion);
    } else if (this.shellState === 'PLAYING') {
      this.updateActivePlay(clampedDt, reducedMotion);
    }

    // Render frame
    if (this.ctx && this.canvas) {
      const snap = this.currentSnapshot();
      const shakeAmt = reducedMotion ? 0 : this.shakeMag;
      const shakeX = shakeAmt > 0.1 ? (Math.random() * 2 - 1) * shakeAmt : 0;
      const shakeY = shakeAmt > 0.1 ? (Math.random() * 2 - 1) * shakeAmt : 0;
      this.shakeMag *= Math.pow(0.001, clampedDt);

      const transform = this.renderer.render(
        this.ctx,
        this.canvas.width,
        this.canvas.height,
        {
          desk: this.desk,
          p1: snap.p1,
          p2: snap.p2,
          activeTurn: this.turn,
          isAiOpponent: this.mode === 'tournament',
          p1TurboReady: this.surgeP1 >= 100,
          p2TurboReady: this.surgeP2 >= 100,
          aimPreview: this.buildAimPreview(),
          aiThinkProgress:
            this.turnPhase === 'AI_THINKING'
              ? Math.min(1, this.aiThinkTimer / this.aiThinkDuration)
              : 0,
          shakeX,
          shakeY,
          sparks: this.sparks,
          rings: this.rings,
          callouts: this.callouts,
          reducedMotion,
          isAttractMode: this.shellState === 'TITLE_MENU',
          timeSec: this.timeSec,
        }
      );
      this.viewScale = transform.scale;
      this.viewOffsetX = transform.offsetX;
      this.viewOffsetY = transform.offsetY;
    }
  }

  private updateAttractMode(dt: number): void {
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
      const evs = this.physics.stepFixed(FIXED_DT);
      for (const ev of evs) {
        if (ev.type === 'collision' || ev.type === 'whip_crit') {
          this.spawnSparks(ev.x, ev.y, '#FACC15', 8);
        }
      }
      this.accumulator -= FIXED_DT;
      steps++;
    }

    const snap = this.physics.snapshot();
    if (snap.p1.outOfBounds || snap.p2.outOfBounds) {
      this.attractTimer -= dt;
      if (this.attractTimer <= 0) {
        this.physics.initializeRound(
          Date.now() & 0xffff,
          this.p1Pen,
          this.p2Pen,
          'ai',
          this.desk
        );
        this.attractTimer = 0.7;
      }
      return;
    }

    if (snap.isAtRest) {
      this.attractTimer -= dt;
      if (this.attractTimer <= 0) {
        const attacker = this.attractTurn === 'p1' ? snap.p1 : snap.p2;
        const target = this.attractTurn === 'p1' ? snap.p2 : snap.p1;
        const aim = Math.atan2(target.y - attacker.y, target.x - attacker.x) + (Math.random() - 0.5) * 0.25;
        this.physics.submitFlick(
          {
            shotId: `attract_${Date.now()}`,
            playerId: attacker.owner,
            gripOffset01: (Math.random() - 0.5) * 1.4,
            aimRadians: aim,
            normalizedPower: 0.62 + Math.random() * 0.28,
          },
          1.0
        );
        this.attractTurn = this.attractTurn === 'p1' ? 'p2' : 'p1';
        this.attractTimer = 0.9;
      }
    }
  }

  private updateActivePlay(dt: number, reducedMotion: boolean): void {
    // Visual-only hitstop freeze (physics never skips steps when resuming)
    if (this.visualHitstop > 0) {
      this.visualHitstop -= dt;
      return;
    }

    if (this.turnPhase === 'AI_THINKING') {
      this.aiThinkTimer += dt;
      const frameBudgetEnd = performance.now() + 3;
      while (this.aiPlan && performance.now() < frameBudgetEnd) {
        const next = this.aiPlan.next();
        if (next.done) {
          this.aiShot = next.value.shot;
          this.aiPlan = null;
        }
      }
      if (this.aiShot && this.aiThinkTimer >= this.aiThinkDuration) {
        const command = this.aiShot;
        this.aiShot = null;
        this.executeFlick(command);
      }
      return;
    }

    if (this.turnPhase === 'KO_SLOWMO') {
      // 0.25x presentation slow-motion fall animation
      const slowScale = reducedMotion ? 1.0 : 0.35;
      this.accumulator += dt * slowScale;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
        const evs = this.physics.stepFixed(FIXED_DT);
        this.processPhysicsEvents(evs, reducedMotion);
        this.accumulator -= FIXED_DT;
        steps++;
      }

      this.koSlowMoTimer -= dt;
      if (this.koSlowMoTimer <= 0) {
        this.resolveRoundAfterKo();
      }
      return;
    }

    if (this.turnPhase === 'SIMULATING') {
      this.turnSimElapsed += dt;
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
        const evs = this.physics.stepFixed(FIXED_DT);
        this.processPhysicsEvents(evs, reducedMotion);
        this.accumulator -= FIXED_DT;
        steps++;
      }

      // If a ring-out occurred, wait out the 150ms Double-KO window before entering KO slowmo
      if (this.firstRingOutOwner !== null) {
        if (this.bothRingOut || performance.now() - this.firstRingOutAtMs >= DOUBLE_KO_WINDOW_MS) {
          this.enterKoSlowMo();
        }
        return;
      }

      // Check continuous rest or hard turn timeout
      if (
        this.physics.getRestDuration() >= REST_HOLD_SECONDS ||
        this.turnSimElapsed >= HARD_TURN_TIMEOUT_SECONDS
      ) {
        this.physics.dampToRest();
        this.physics.clearTurboFlags();

        if (this.shotsInRound >= DRAW_SHOT_LIMIT) {
          this.triggerDrawReplay();
          return;
        }

        // Hand over turn
        this.turn = this.turn === 'p1' ? 'p2' : 'p1';
        if (this.mode === 'pass_and_play') {
          this.shellState = 'PASS_HANDOFF';
          this.turnPhase = 'AIMING';
        } else if (this.turn === 'p2') {
          this.beginAiThink();
        } else {
          this.turnPhase = 'AIMING';
        }
        this.emitHud();
      }
    }
  }

  private processPhysicsEvents(events: PhysicsEvent[], reducedMotion: boolean, presentationOnly = false): void {
    for (const ev of events) {
      if (ev.type === 'collision' || ev.type === 'whip_crit') {
        const isCrit = ev.type === 'whip_crit';
        const intensity = Math.min(1, ev.impulse / 16);
        soundSynth.playClack(intensity, isCrit);

        if (!reducedMotion) {
          this.shakeMag = Math.max(this.shakeMag, isCrit ? 8.5 : 3 + intensity * 4.5);
          if (isCrit || ev.impulse > 10) {
            this.visualHitstop = isCrit ? 0.055 : 0.032;
          }
        }

        this.spawnSparks(ev.x, ev.y, isCrit ? '#FACC15' : '#FFFFFF', isCrit ? 18 : 9);
        this.spawnRing(ev.x, ev.y, isCrit ? 52 : 28, isCrit ? '#FACC15' : '#38BDF8');
        if (presentationOnly) continue;

        // Strictly <= 1 surge award per shotId (Blueprint §2.3 & PHY-12)
        if (ev.shotId && !this.awardedSurgeShotIds.has(ev.shotId) && ev.attackerOwner) {
          const gain = isCrit ? 35 : ev.impulse >= 3.5 ? 10 : 0;
          if (gain > 0) {
            this.awardedSurgeShotIds.add(ev.shotId);
            if (ev.attackerOwner === 'p1') {
              this.surgeP1 = Math.min(100, this.surgeP1 + gain);
              if (isCrit) this.critAwardedThisMatch = true;
            } else {
              this.surgeP2 = Math.min(100, this.surgeP2 + gain);
            }
            if (isCrit) {
              this.addCallout('WHIP CRIT!', '+35 SURGE', ev.x, ev.y - 14, '#FACC15');
            }
            this.emitHud();
          }
        }
      } else if (ev.type === 'ring_out' && ev.targetOwner) {
        if (presentationOnly) {
          soundSynth.playRingOut(ev.targetOwner !== this.online?.packet.side);
          continue;
        }
        const outSide: 'p1' | 'p2' = ev.targetOwner === 'p1' ? 'p1' : 'p2';
        if (this.firstRingOutOwner === null) {
          this.firstRingOutOwner = outSide;
          this.firstRingOutAtMs = performance.now();
        } else if (this.firstRingOutOwner !== outSide) {
          this.bothRingOut = true;
        }
      }
    }
  }

  private enterKoSlowMo(): void {
    this.turnPhase = 'KO_SLOWMO';
    const reducedMotion = profileRepo.get().reducedMotion;
    this.koSlowMoTimer = reducedMotion ? 0.45 : 1.05;

    if (this.bothRingOut) {
      soundSynth.playRingOut(false);
      this.addCallout('DOUBLE KO!', 'ROUND DRAW · REPLAY', WORLD_W / 2, WORLD_H * 0.44, '#FACC15');
    } else {
      const p1WonRound = this.firstRingOutOwner === 'p2';
      soundSynth.playRingOut(p1WonRound);
      if (p1WonRound && this.shotsInRound === 1) {
        this.oneShotKoEarned = true;
        this.addCallout('1-SHOT KO!', '+10 AURA POINTS', WORLD_W / 2, WORLD_H * 0.42, '#FACC15');
      } else {
        this.addCallout(
          'RING OUT!',
          p1WonRound
            ? this.mode === 'pass_and_play'
              ? 'PLAYER 1 SCORES'
              : 'YOU WIN ROUND'
            : this.mode === 'pass_and_play'
              ? 'PLAYER 2 SCORES'
              : `${this.opponent.name.toUpperCase()} SCORES`,
          WORLD_W / 2,
          WORLD_H * 0.42,
          p1WonRound ? '#10B981' : '#F43F5E'
        );
      }
    }
    this.emitHud();
  }

  private triggerDrawReplay(): void {
    this.lastRoundDraw = true;
    this.startingTurnThisRound = this.startingTurnThisRound === 'p1' ? 'p2' : 'p1';
    this.addCallout('DRAW', '20-SHOT LIMIT · REPLAY', WORLD_W / 2, WORLD_H * 0.45, '#FACC15');
    this.setupRound(this.startingTurnThisRound);
  }

  private resolveRoundAfterKo(): void {
    if (this.bothRingOut) {
      // Double KO: replay round with starting shooter swapped, zero KO coins
      this.lastRoundDraw = true;
      this.startingTurnThisRound = this.startingTurnThisRound === 'p1' ? 'p2' : 'p1';
      this.setupRound(this.startingTurnThisRound);
      return;
    }

    this.lastRoundDraw = false;
    const p1WonRound = this.firstRingOutOwner === 'p2';

    if (p1WonRound) {
      this.scoreP1 += 1;
      if (this.mode === 'tournament') {
        profileRepo.commit((d) => {
          d.totalKOs += 1;
        });
      }
    } else {
      // Check Tournament Second Chance Edge Save opportunity before awarding match point loss!
      const isMatchPointLoss = this.scoreP2 + 1 >= 2;
      if (
        this.mode === 'tournament' &&
        isMatchPointLoss &&
        !this.revivedThisMatch &&
        adService.isOnline()
      ) {
        this.shellState = 'SECOND_CHANCE';
        this.emitHud();
        return;
      }
      this.scoreP2 += 1;
    }

    // Best-of-3 match completion check
    if (this.scoreP1 >= 2) {
      this.finalizeMatch(true);
      return;
    }
    if (this.scoreP2 >= 2) {
      this.finalizeMatch(false);
      return;
    }

    // Next round (alternate starting shooter)
    this.roundNumber += 1;
    this.startingTurnThisRound = this.startingTurnThisRound === 'p1' ? 'p2' : 'p1';
    this.setupRound(this.startingTurnThisRound);
  }

  private finalizeMatch(p1Won: boolean): void {
    this.shellState = 'MATCH_OVER';
    this.trialPenId = null; // 1-match pen trial completes

    if (this.mode === 'tournament') {
      const baseCoins = p1Won ? 60 : 20;
      const oneShotKoBonus = p1Won && this.oneShotKoEarned ? 10 : 0;
      const firstCritBonus = this.critAwardedThisMatch ? 5 : 0;
      const totalCoins = baseCoins + oneShotKoBonus + firstCritBonus;

      // Atomic deduplicated payout (Blueprint §7.1 & §7.2)
      profileRepo.grantCoinsAtomic(`match_payout_${this.matchId}`, totalCoins);

      let unlockedNewDesk: string | undefined;
      profileRepo.commit((d) => {
        d.matchesSinceInterstitial += 1;
        if (p1Won) {
          d.tournamentWins += 1;
          d.currentWinStreak += 1;
          d.bestWinStreak = Math.max(d.bestWinStreak, d.currentWinStreak);
          // Unlock next opponent on ladder
          if (this.opponent.index < TOURNAMENT_LADDER.length - 1) {
            const nextOpp = this.opponent.index + 1;
            d.highestTournamentOpponent = Math.max(d.highestTournamentOpponent, nextOpp);
            d.selectedOpponentIndex = nextOpp;
          }
          // Unlock Exam Slate Table after beating Rank 2 Boss (index >= 7)
          if (this.opponent.index >= 7 && !d.unlockedDeskIds.includes('exam_slate')) {
            d.unlockedDeskIds.push('exam_slate');
            unlockedNewDesk = 'Exam Slate Table';
          }
        } else {
          d.currentWinStreak = 0;
        }
      });

      this.ledger = {
        matchId: this.matchId,
        won: p1Won,
        baseCoins,
        oneShotKoBonus,
        firstCritBonus,
        totalCoins,
        doubled: false,
        opponentName: this.opponent.name,
        opponentRank: this.opponent.rankName,
        wasBoss: this.opponent.isBoss,
        unlockedNewDesk,
      };
      if (p1Won) soundSynth.playCoinBurst();
    } else {
      // Pass & Play: zero coin farming, clean local trophy result
      this.ledger = {
        matchId: this.matchId,
        won: p1Won,
        baseCoins: 0,
        oneShotKoBonus: 0,
        firstCritBonus: 0,
        totalCoins: 0,
        doubled: false,
        opponentName: 'Player 2',
        opponentRank: '2P Pass & Play',
        wasBoss: false,
      };
    }

    this.emitHud();
  }

  private spawnSparks(x: number, y: number, color: string, count: number): void {
    const cap = profileRepo.get().reducedMotion ? Math.ceil(count / 3) : count;
    for (let i = 0; i < cap; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 70 + Math.random() * 190;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: 0.25 + Math.random() * 0.25,
        maxLife: 0.5,
        size: 2.2 + Math.random() * 2.5,
        color,
      });
    }
    if (this.sparks.length > 90) {
      this.sparks.splice(0, this.sparks.length - 90);
    }
  }

  private spawnRing(x: number, y: number, maxRadius: number, color: string): void {
    this.rings.push({
      x,
      y,
      radius: 8,
      maxRadius,
      life: 0.32,
      maxLife: 0.32,
      color,
    });
  }

  private addCallout(
    text: string,
    subtext: string | undefined,
    x: number,
    y: number,
    color: string
  ): void {
    this.callouts.push({
      text,
      subtext,
      x: Math.max(84, Math.min(WORLD_W - 84, x)),
      y: Math.max(130, Math.min(WORLD_H - 130, y)),
      life: 1.25,
      maxLife: 1.25,
      color,
    });
  }

  private updateVfx(dt: number): void {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.91;
      s.vy *= 0.91;
      s.life -= dt;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const p = 1 - Math.max(0, r.life / r.maxLife);
      r.radius = 8 + (r.maxRadius - 8) * p;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.callouts.length - 1; i >= 0; i--) {
      this.callouts[i].life -= dt;
      if (this.callouts[i].life <= 0) this.callouts.splice(i, 1);
    }
  }

  emitHud(): void {
    if (!this.hudListener) return;
    const sdMult = this.getSuddenDeathMult();
    const trialSpec = this.trialPenId ? getPenById(this.trialPenId) : null;
    this.hudListener({
      shellState: this.shellState,
      mode: this.mode,
      turn: this.turn,
      turnPhase: this.turnPhase,
      roundNumber: this.roundNumber,
      scoreP1: this.scoreP1,
      scoreP2: this.scoreP2,
      surgeP1: this.surgeP1,
      surgeP2: this.surgeP2,
      shotsInRound: this.shotsInRound,
      suddenDeath: this.shotsInRound >= SUDDEN_DEATH_START_SHOT,
      suddenDeathBonusPct: Math.round((sdMult - 1) * 100),
      canRevive: this.mode === 'tournament' && !this.revivedThisMatch,
      opponent: this.opponent,
      p1PenName: this.p1Pen.name,
      p2PenName: this.p2Pen.name,
      deskName: this.desk.name,
      trialPenName: trialSpec ? trialSpec.name : null,
      statusBanner: this.statusBanner,
      ledger: this.ledger,
      lastRoundDraw: this.lastRoundDraw,
    });
  }
}

export const gameEngine = new PenFightEngine();
