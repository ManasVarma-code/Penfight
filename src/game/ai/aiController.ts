import { DESK_RECT } from '../content';
import { mulberry32 } from '../physics/matterAdapter';
import { FlickCommand, OpponentSpec, PenBodyState } from '../types';

function distToNearestEdge(x: number, y: number): {
  dist: number;
  outX: number;
  outY: number;
} {
  const dLeft = x - DESK_RECT.left;
  const dRight = DESK_RECT.right - x;
  const dTop = y - DESK_RECT.top;
  const dBottom = DESK_RECT.bottom - y;

  const min = Math.min(dLeft, dRight, dTop, dBottom);
  if (min === dLeft) return { dist: dLeft, outX: -1, outY: 0 };
  if (min === dRight) return { dist: dRight, outX: 1, outY: 0 };
  if (min === dTop) return { dist: dTop, outX: 0, outY: -1 };
  return { dist: dBottom, outX: 0, outY: 1 };
}

/**
 * Fair Seeded AI Opponent (Blueprint §6):
 * Evaluates `opponent.candidates` legal FlickCommands and chooses the highest-value
 * ring-out shot while protecting against self-ring-out. Uses identical physics limits.
 */
export function chooseAiFlick(
  aiPen: PenBodyState,
  targetPen: PenBodyState,
  opponent: OpponentSpec,
  seed: number,
  shotId: string
): FlickCommand {
  const rng = mulberry32(seed);
  const edgeInfo = distToNearestEdge(targetPen.x, targetPen.y);
  const targetCos = Math.cos(targetPen.angle);
  const targetSin = Math.sin(targetPen.angle);

  let bestScore = -Infinity;
  let bestGrip = 0;
  let bestAim = Math.atan2(targetPen.y - aiPen.y, targetPen.x - aiPen.x);
  let bestPower = 0.72;

  const count = Math.max(12, Math.min(40, opponent.candidates));

  for (let i = 0; i < count; i++) {
    // Sample target point on player pen: center ram vs outer tips for whip crits
    const targetOffset =
      i % 3 === 0 ? 0 : i % 3 === 1 ? 0.65 : -0.65;
    const tx = targetPen.x + targetCos * (targetOffset * targetPen.spec.length * 0.45);
    const ty = targetPen.y + targetSin * (targetOffset * targetPen.spec.length * 0.45);

    const dx = tx - aiPen.x;
    const dy = ty - aiPen.y;
    const dist = Math.hypot(dx, dy) || 1;
    const baseAim = Math.atan2(dy, dx);

    // Slight aim sweep around direct vector
    const aimOffset = ((i / count) - 0.5) * 0.24;
    const aim = baseAim + aimOffset;
    const dirX = Math.cos(aim);
    const dirY = Math.sin(aim);

    // Sample grip offset (center ram or off-center spin whip)
    const gripOptions = [0, -0.55, 0.55, -0.82, 0.82];
    const grip = gripOptions[i % gripOptions.length];

    // Power scaled by distance & edge pressure
    const basePower = Math.min(1, Math.max(0.45, dist / 300 + (i % 4) * 0.1));

    // Score 1: alignment with target
    const directDot = (dirX * dx + dirY * dy) / dist;
    let score = directDot * 60;

    // Score 2: does the shot push the player toward their nearest desk edge?
    const edgePushDot = dirX * edgeInfo.outX + dirY * edgeInfo.outY;
    const edgeUrgency = Math.max(0.4, 1.8 - edgeInfo.dist / 130);
    score += edgePushDot * 45 * opponent.edgeBias * edgeUrgency;

    // Score 3: favor tip shots when aiming off-center for extra spin chaos
    if (Math.abs(targetOffset) > 0.4 && Math.abs(grip) > 0.3) {
      score += 12 * opponent.edgeBias;
    }

    // Score 4: penalize self-ring-out if AI is very close to edge in aim direction
    const projectedEndX = aiPen.x + dirX * (basePower * 220);
    const projectedEndY = aiPen.y + dirY * (basePower * 220);
    const margin = 22;
    const selfOutRisk =
      projectedEndX < DESK_RECT.left + margin ||
      projectedEndX > DESK_RECT.right - margin ||
      projectedEndY < DESK_RECT.top + margin ||
      projectedEndY > DESK_RECT.bottom - margin;

    if (selfOutRisk && dist > 165) {
      score -= 36;
    }

    // Slight preference for decisive hits over timid taps
    score += basePower * 16;

    if (score > bestScore) {
      bestScore = score;
      bestGrip = grip;
      bestAim = aim;
      bestPower = basePower;
    }
  }

  // Apply difficulty-specific humanlike aim error & power variance
  const spreadRad = (opponent.angleSpreadDeg * Math.PI) / 180;
  const noisyAim = bestAim + (rng() * 2 - 1) * spreadRad;
  const noisyPower = Math.max(
    0.35,
    Math.min(1, bestPower + (rng() * 2 - 1) * opponent.powerSpread)
  );

  return {
    shotId,
    playerId: 'ai',
    gripOffset01: bestGrip,
    aimRadians: noisyAim,
    normalizedPower: noisyPower,
  };
}
