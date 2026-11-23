import { DESK_RECT, DOUBLE_KO_WINDOW_MS, FIXED_DT, REST_HOLD_SECONDS } from '../content';
import { MatterPhysicsAdapter, mulberry32 } from '../physics/matterAdapter';
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
export const AI_STYLES = ['Center striker', 'Angle specialist', 'Defender', 'Spin specialist', 'Edge hunter'] as const;
export type AiStyle = (typeof AI_STYLES)[number];

export function getRivalStyle(index: number): AiStyle {
  return AI_STYLES[index % AI_STYLES.length];
}

function shotRandom(shotId: string, salt: number) {
  let seed = salt;
  for (let i = 0; i < shotId.length; i++) seed = Math.imul(seed ^ shotId.charCodeAt(i), 16777619);
  return mulberry32(seed);
}

const rivalSkill = (index: number) => Math.max(0, Math.min(1, index / 23));

export function getTournamentReactionSeconds(rivalIndex: number, shotId: string): number {
  return 0.99 - 0.24 * rivalSkill(rivalIndex) + shotRandom(shotId, 41)() * 0.31;
}

export function* planTournamentFlick(
  snapshot: PhysicsSnapshot, desk: DeskSpec, rivalIndex: number, shotId: string,
  turboMultiplier: number, suddenDeathMultiplier: number, style = getRivalStyle(rivalIndex)
): ReturnType<typeof planAiFlick> {
  const precision = rivalSkill(rivalIndex);
  // The opening two leagues teach basic shots before rivals read the whole rally.
  const learning = rivalIndex < 8;
  const random = shotRandom(shotId, 17);
  const result = yield* planAiFlick(snapshot, desk, rivalIndex, shotId, turboMultiplier, suddenDeathMultiplier, style, {
    previewSteps: Math.ceil(((learning ? 2.15 : 3.0) + precision * 0.7) / FIXED_DT),
    options: 4 + Math.round(rivalIndex * (learning ? 0.65 : 0.92)),
    extraOptions: 4 + Math.floor(precision * 2),
    scoreNoise: (learning ? 9 : 5) - precision * 2,
    random,
  });

  // The planned shot is reasonable, but the rival cannot predict its own execution error.
  const aimError = (random() - random()) * ((learning ? 0.27 : 0.17) - precision * 0.085);
  const powerError = (random() - random()) * ((learning ? 0.19 : 0.12) - precision * 0.06)
    - (learning ? 0.03 : 0.014);
  const gripError = (random() - random()) * (0.08 - precision * 0.04);
  const { shot } = result;
  return { ...result, shot: {
    ...shot, aimRadians: shot.aimRadians + aimError,
    normalizedPower: Math.max(0.05, Math.min(1, shot.normalizedPower + powerError)),
    gripOffset01: Math.max(-1, Math.min(1, shot.gripOffset01 + gripError)),
  } };
}

interface PlanningLimits {
  previewSteps: number;
  options: number;
  extraOptions: number;
  scoreNoise: number;
  random: () => number;
}

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
  suddenDeathMultiplier: number,
  style?: AiStyle,
  limits?: PlanningLimits
): Generator<void, { shot: FlickCommand; score: number }> {
  const preview = new MatterPhysicsAdapter();
  const { p1: target, p2: rival } = snapshot;
  const targetDirection = Math.atan2(target.y - rival.y, target.x - rival.x);
  const startingDistance = Math.hypot(target.x - rival.x, target.y - rival.y);
  const skill = rivalSkill(rivalIndex);
  const inward = Math.atan2(CENTER_Y - rival.y, CENTER_X - rival.x);
  const error = Math.sin(rival.x * 0.09 + target.y * 0.11) * 0.13 * (1 - skill);
  const options: FlickCommand[] = [0.28, ...(rivalIndex >= 8 ? [0.48, 0.68] : [])].map(normalizedPower => ({
    shotId, playerId: 'ai', gripOffset01: 0, normalizedPower, aimRadians: inward,
  }));
  const attack = (offset: number, gripOffset01: number, normalizedPower: number) => {
    const offsetDistance = offset * target.spec.length / 2;
    const x = target.x + Math.cos(target.angle) * offsetDistance;
    const y = target.y + Math.sin(target.angle) * offsetDistance;
    const aim = Math.atan2(y - rival.y, x - rival.x) + error;
    options.push({ shotId, playerId: 'ai', gripOffset01, normalizedPower, aimRadians: aim });
  };
  for (const [offset, grip, power] of SHOT_OPTIONS.slice(0, limits?.options ?? 4 + rivalIndex)) {
    attack(offset, grip, power);
  }
  if (rivalIndex >= 16) {
    const offsets = [-0.96, 0.96, -0.55, 0.55, -0.25, 0.25];
    for (const offset of limits ? offsets.slice(0, limits.extraOptions) : [...offsets].sort((a, b) => a - b)) {
      attack(offset, 0, 0.86);
      if (!limits || Math.abs(offset) <= 0.55) attack(offset, 0, 1);
    }
  }

  let best = { shot: options[0], score: -Infinity };
  for (const shot of options) {
    preview.initializeShotPreview(snapshot, desk);
    preview.submitFlick(shot, turboMultiplier, suddenDeathMultiplier);
    let firstRingOut: number | undefined;
    let impact = 0;
    for (let i = 0; i < (limits?.previewSteps ?? PREVIEW_STEPS); i++) {
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
      const approach = impact < 0.8
        ? Math.max(0, Math.min(120, startingDistance - Math.hypot(p1.x - p2.x, p1.y - p2.y))) : 0;
      const exposure = Math.max(0, pressure(p2) - 0.63);
      score = targetProgress * (28 + 16 * skill) + safety * (10 + 14 * skill)
        + Math.min(impact, 12) * 1.5 + directness * 2 + approach * 0.18
        - exposure * (4 + 27 * skill);
      // Each rival favors a different kind of close call. Knockouts and
      // dangerous misses still score the same for the entire ladder.
      switch (style) {
        case 'Center striker': score += 1.5 * (1 - Math.abs(shot.gripOffset01)); break;
        case 'Angle specialist': score += 1.5 * Math.abs(Math.sin(shot.aimRadians - targetDirection)); break;
        case 'Defender': score += 1.5 * Math.max(0, Math.min(1, safety)); break;
        case 'Spin specialist': score += 1.5 * Math.abs(shot.gripOffset01); break;
        case 'Edge hunter': score += 1.5 * Math.max(0, Math.min(1, targetProgress)); break;
      }
    }
    if (limits) score += (limits.random() - 0.5) * limits.scoreNoise;
    if (score > best.score) best = { shot, score };
    yield;
  }
  return best;
}
