import { DESK_RECT, DOUBLE_KO_WINDOW_MS, FIXED_DT, REST_HOLD_SECONDS } from '../content';
import { MatterPhysicsAdapter } from '../physics/matterAdapter';
import type { DeskSpec, FlickCommand, PenBodyState, PhysicsSnapshot } from '../types';

// Rivals all use the same ordered list. A ladder win adds one option without
// taking away any shot the earlier rival could see from the same position.
const SHOT_OPTIONS = [
  // [aim along target pen, grip along own pen, power]
  [0, 0, 0.45], [0, 0, 0.57], [-0.36, 0, 0.53], [0.36, 0, 0.53],
  [0, 0, 0.69], [-0.58, 0.46, 0.65], [0.58, -0.46, 0.65],
  [0, 0, 0.81], [-0.7, 0.62, 0.74], [0.7, -0.62, 0.74],
  [0, 0, 0.93], [-0.3, -0.7, 0.76], [0.3, 0.7, 0.76],
  [-0.7, 0.7, 0.86], [0.7, -0.7, 0.86], [0, 0, 1],
  [-0.36, -0.68, 0.92], [0.36, 0.68, 0.92], [-0.78, 0.78, 1],
  [0.78, -0.78, 1], [-0.53, 0, 0.98], [0.53, 0, 0.98],
  [0, 0.85, 0.96], [0, -0.85, 0.96], [-0.91, -0.28, 0.95],
  [0.9, 0.94, 1], [0.55, 0.94, 1],
] as const;

const PREVIEW_STEPS = Math.ceil(4 / FIXED_DT);
const DOUBLE_KO_STEPS = Math.ceil(DOUBLE_KO_WINDOW_MS / (1000 * FIXED_DT));
const CENTER_X = (DESK_RECT.left + DESK_RECT.right) / 2;
const CENTER_Y = (DESK_RECT.top + DESK_RECT.bottom) / 2;

function pressure(pen: PenBodyState): number {
  const alongX = Math.abs(pen.x - CENTER_X) / (DESK_RECT.width / 2);
  const alongY = Math.abs(pen.y - CENTER_Y) / (DESK_RECT.height / 2);
  return Math.min(1.4, Math.max(alongX, alongY)) + pen.overhangRatio * 0.5;
}

export function* planAiFlick(
  snapshot: PhysicsSnapshot,
  desk: DeskSpec,
  rivalIndex: number,
  shotId: string,
  turboMultiplier: number,
  suddenDeathMultiplier: number
): Generator<void, { shot: FlickCommand; score: number }> {
  const preview = new MatterPhysicsAdapter();
  const { p1: target, p2: rival } = snapshot;
  const targetDirection = Math.atan2(target.y - rival.y, target.x - rival.x);
  const options: FlickCommand[] = [{
    shotId, playerId: 'ai', gripOffset01: 0, normalizedPower: 0.26,
    aimRadians: Math.atan2(CENTER_Y - rival.y, CENTER_X - rival.x),
  }];
  for (const [offset, gripOffset01, normalizedPower] of SHOT_OPTIONS.slice(0, 4 + rivalIndex)) {
    const offsetDistance = offset * target.spec.length / 2;
    const x = target.x + Math.cos(target.angle) * offsetDistance;
    const y = target.y + Math.sin(target.angle) * offsetDistance;
    const aim = Math.atan2(y - rival.y, x - rival.x);
    options.push({ shotId, playerId: 'ai', gripOffset01, normalizedPower, aimRadians: aim });
  }

  let best = { shot: options[0], score: -Infinity };
  for (const shot of options) {
    preview.initializeShotPreview(snapshot, desk);
    preview.submitFlick(shot, turboMultiplier, suddenDeathMultiplier);
    let firstRingOut: number | undefined;
    let impact = 0;
    for (let i = 0; i < PREVIEW_STEPS; i++) {
      for (const event of preview.stepFixed()) {
        if (event.type === 'ring_out') firstRingOut ??= i;
        else impact = Math.max(impact, event.impulse);
      }
      if (firstRingOut === undefined ? preview.getRestDuration() >= REST_HOLD_SECONDS
        : i - firstRingOut >= DOUBLE_KO_STEPS) break;
      // The live engine resumes this work across animation frames.
      if (i % 24 === 23) yield;
    }

    const { p1, p2 } = preview.snapshot();
    let score: number;
    if (p1.outOfBounds && p2.outOfBounds) score = -100;
    else if (p2.outOfBounds) score = -1000;
    else if (p1.outOfBounds) score = 1000;
    else {
      const targetProgress = pressure(p1) - pressure(target);
      const safety = pressure(rival) - pressure(p2);
      const directness = Math.cos(shot.aimRadians - targetDirection);
      score = targetProgress * 36 + safety * 18 + Math.min(impact, 12) * 1.5
        + directness * 2;
    }
    if (score > best.score) best = { shot, score };
    yield;
  }
  return best;
}
