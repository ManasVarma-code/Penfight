import { randomInt } from 'node:crypto';
import {
  DOUBLE_KO_WINDOW_MS, DRAW_SHOT_LIMIT, FIXED_DT, HARD_TURN_TIMEOUT_SECONDS,
  REST_HOLD_SECONDS, SUDDEN_DEATH_START_SHOT, TURBO_IMPULSE_MULT, getDeskById, getPenById,
} from '../src/game/content';
import {
  ONLINE_DESK, ONLINE_FRAME_MS, ONLINE_PEN,
  type OnlineFlick, type OnlineMatchState, type OnlineReplay, type OnlineSide,
} from '../src/game/onlineProtocol';
import { MatterPhysicsAdapter } from '../src/game/physics/matterAdapter';
import type { PhysicsEvent } from '../src/game/types';

const TURN_MS = 30_000;
const REPLAY_LEAD_MS = 450;
const KO_PRESENTATION_MS = 650;
export const otherSide = (side: OnlineSide): OnlineSide => side === 'p1' ? 'p2' : 'p1';

function recordFrame(physics: MatterPhysicsAdapter, events: PhysicsEvent[]) {
  const snapshot = physics.snapshot();
  // The adapter reuses its live trail arrays. Keep replay frames independent.
  return {
    snapshot: {
      ...snapshot,
      p1: { ...snapshot.p1, trail: snapshot.p1.trail.slice(-6) },
      p2: { ...snapshot.p2, trail: snapshot.p2.trail.slice(-6) },
    },
    events,
  };
}

export function parseFlick(value: unknown): OnlineFlick | null {
  if (typeof value !== 'object' || value === null) return null;
  const { aimRadians, gripOffset01, normalizedPower } = value as Partial<OnlineFlick>;
  if (typeof aimRadians !== 'number' || !Number.isFinite(aimRadians) || Math.abs(aimRadians) > 10_000
      || typeof gripOffset01 !== 'number' || !(gripOffset01 >= -1 && gripOffset01 <= 1)
      || typeof normalizedPower !== 'number' || !(normalizedPower >= 0.05 && normalizedPower <= 1)) return null;
  return { aimRadians, gripOffset01, normalizedPower };
}

export class OnlineMatch {
  private readonly physics = new MatterPhysicsAdapter();
  private readonly seed = randomInt(1, 1_000_000);
  private starter: OnlineSide = 'p1';
  private roundSeedOffset = 0;
  readonly state: OnlineMatchState;
  replay?: OnlineReplay;
  finishedAt?: number;

  constructor(now: number) {
    const pen = getPenById(ONLINE_PEN);
    this.physics.initializeRound(this.seed, pen, pen, 'p2', getDeskById(ONLINE_DESK));
    this.state = {
      revision: 0, snapshot: this.physics.snapshot(), score: { p1: 0, p2: 0 },
      surge: { p1: 0, p2: 0 }, turn: 'p1', round: 1, shots: 0, winner: null,
      deadline: now + TURN_MS,
    };
  }

  private resetRound() {
    this.starter = otherSide(this.starter);
    this.state.turn = this.starter;
    this.state.shots = 0;
    const pen = getPenById(ONLINE_PEN);
    this.physics.initializeRound(this.seed + ++this.roundSeedOffset, pen, pen, 'p2', getDeskById(ONLINE_DESK));
  }

  forfeit(side: OnlineSide, now: number) {
    if (this.state.winner) return;
    this.state.winner = otherSide(side);
    this.state.revision++;
    this.replay = undefined;
    this.finishedAt = now;
  }

  expireTurn(now: number) {
    if (now >= this.state.deadline) this.forfeit(this.state.turn, now);
  }

  play(side: OnlineSide, revision: number, flick: OnlineFlick, now: number): boolean {
    this.expireTurn(now);
    const state = this.state;
    if (state.winner || side !== state.turn || revision !== state.revision
        || (this.replay && now < this.replay.endAt)) return false;

    const turbo = state.surge[side] >= 100;
    if (turbo) state.surge[side] = 0;
    state.shots++;
    const suddenDeath = 1 + Math.max(0, Math.min(5, state.shots - SUDDEN_DEATH_START_SHOT + 1)) * 0.03;
    this.physics.submitFlick(
      { ...flick, playerId: side, shotId: String(state.revision + 1) },
      turbo ? TURBO_IMPULSE_MULT : 1,
      suddenDeath
    );

    const frames: OnlineReplay['frames'] = [recordFrame(this.physics, [])];
    let events: PhysicsEvent[] = [];
    let firstOut: OnlineSide | undefined;
    let firstOutStep = 0;
    let doubleKo = false;
    let surgeAwarded = false;
    const koWindowSteps = Math.ceil(DOUBLE_KO_WINDOW_MS / (FIXED_DT * 1000));
    const turnSteps = Math.ceil(HARD_TURN_TIMEOUT_SECONDS / FIXED_DT);
    const fallSteps = Math.ceil(KO_PRESENTATION_MS * 0.35 / (FIXED_DT * 1000));

    for (let step = 1; step <= turnSteps + koWindowSteps + fallSteps; step++) {
      for (const event of this.physics.stepFixed(FIXED_DT)) {
        events.push(event);
        if (!surgeAwarded && event.attackerOwner === side) {
          const gain = event.type === 'whip_crit' ? 35
            : event.type === 'collision' && event.impulse >= 3.5 ? 10 : 0;
          if (gain) {
            state.surge[side] = Math.min(100, state.surge[side] + gain);
            surgeAwarded = true;
          }
        }
        if (event.type === 'ring_out' && (event.targetOwner === 'p1' || event.targetOwner === 'p2')) {
          if (!firstOut) {
            firstOut = event.targetOwner;
            firstOutStep = step;
          } else if (step - firstOutStep <= koWindowSteps && event.targetOwner !== firstOut) {
            doubleKo = true;
          }
        }
      }
      const stop = firstOut
        ? step - firstOutStep >= koWindowSteps + fallSteps
        : step >= turnSteps || this.physics.getRestDuration() >= REST_HOLD_SECONDS;
      if (step % 4 === 0 || stop) {
        const frame = recordFrame(this.physics, events);
        frames.push(frame);
        if (firstOut && step - firstOutStep > koWindowSteps) {
          // Extend the already simulated fall in presentation, without extra physics.
          frames.push({ snapshot: frame.snapshot, events: [] }, { snapshot: frame.snapshot, events: [] });
        }
        events = [];
      }
      if (stop) break;
    }

    if (doubleKo || (!firstOut && state.shots >= DRAW_SHOT_LIMIT)) {
      this.resetRound();
    } else if (firstOut) {
      const pointWinner = otherSide(firstOut);
      if (++state.score[pointWinner] === 2) {
        state.winner = pointWinner;
      } else {
        state.round++;
        this.resetRound();
      }
    } else {
      this.physics.dampToRest();
      this.physics.clearTurboFlags();
      state.turn = otherSide(side);
    }

    const startAt = Date.now() + REPLAY_LEAD_MS;
    const endAt = startAt + frames.length * ONLINE_FRAME_MS;
    this.replay = { frames, startAt, endAt, power: flick.normalizedPower, turbo };
    state.deadline = endAt + TURN_MS;
    state.snapshot = this.physics.snapshot();
    state.revision++;
    if (state.winner) this.finishedAt = endAt;
    return true;
  }
}
