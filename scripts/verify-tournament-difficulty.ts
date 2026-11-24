import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import * as ai from '../src/game/ai/aiController';
import {
  DESKS, DRAW_SHOT_LIMIT, DOUBLE_KO_WINDOW_MS, FIXED_DT, HARD_TURN_TIMEOUT_SECONDS, REST_HOLD_SECONDS,
  SUDDEN_DEATH_START_SHOT, TOURNAMENT_LADDER, TURBO_IMPULSE_MULT, getPenById,
} from '../src/game/content';
import { getTournamentPen } from '../src/game/garage';
import { createDefaultProfile } from '../src/game/persistence';
import { MatterPhysicsAdapter, mulberry32 } from '../src/game/physics/matterAdapter';
import type { DeskSpec, OpponentSpec, PenSpec, PhysicsSnapshot } from '../src/game/types';
import { OnlineMatch } from '../server/onlineMatch';

type Side = 'p1' | 'p2';
type Planner = typeof ai.planAiFlick;
const opposite = (side: Side) => side === 'p1' ? 'p2' : 'p1';
const maxSteps = Math.ceil(HARD_TURN_TIMEOUT_SECONDS / FIXED_DT);
const koSteps = Math.ceil(DOUBLE_KO_WINDOW_MS / (FIXED_DT * 1000));
const beginner = process.env.AI_BENCH_PLAYER === 'beginner';

function playMatch(rival: OpponentSpec, desk: DeskSpec, player: PenSpec, seed: number, rivalPlanner: Planner,
  contact: { shots: number; hits: number }) {
  const physics = new MatterPhysicsAdapter();
  const opponent = getPenById(rival.penId);
  const score = { p1: 0, p2: 0 };
  const surge = { p1: 0, p2: 0 };
  const random = mulberry32(seed + 110);
  let starter: Side = 'p1';
  for (let round = 0; round < 8; round++) {
    physics.initializeRound(seed + round * 97, player, opponent, 'p2', desk, true);
    let side = starter;
    for (let turn = 1; turn <= DRAW_SHOT_LIMIT; turn++) {
      const snapshot = physics.snapshot();
      const perspective: PhysicsSnapshot = {
        ...snapshot,
        p1: { ...snapshot[opposite(side)], owner: 'p1' },
        p2: { ...snapshot[side], owner: 'ai' },
      };
      const turbo = surge[side] >= 100 ? TURBO_IMPULSE_MULT : 1;
      if (turbo > 1) surge[side] = 0;
      const sudden = 1 + Math.max(0, Math.min(5, turn - SUDDEN_DEATH_START_SHOT + 1)) * 0.03;
      const shotId = `${seed}_${round}_${turn}`;
      let shot;
      if (side === 'p1' && beginner) {
        const dx = perspective.p1.x - perspective.p2.x;
        const dy = perspective.p1.y - perspective.p2.y;
        shot = { shotId, gripOffset01: (random() - 0.5) * 0.4,
          aimRadians: Math.atan2(dy, dx) + (random() - 0.5) * 0.22,
          normalizedPower: (Math.hypot(dx, dy) > 80 ? 0.70 : 0.58) + random() * 0.24 };
      } else {
        const plan = side === 'p1'
          ? ai.planAiFlick(perspective, desk, 15 + (seed % 2) * 3, shotId, turbo, sudden)
          : rivalPlanner(perspective, desk, rival.index, shotId, turbo, sudden, ai.getRivalStyle(rival.index));
        let next = plan.next();
        while (!next.done) next = plan.next();
        shot = next.value.shot;
        if (side === 'p1') shot.aimRadians += (random() - 0.5) * 0.10;
      }
      physics.submitFlick({ ...shot, playerId: side }, turbo, sudden);
      let firstOut: Side | undefined;
      let firstOutStep = 0;
      let doubleKo = false;
      let awarded = false;
      let hit = false;
      for (let step = 0; step < maxSteps + koSteps; step++) {
        for (const event of physics.stepFixed()) {
          if (side === 'p2' && event.attackerOwner === 'p2' && event.targetOwner === 'p1' &&
              (event.type === 'collision' || event.type === 'whip_crit')) hit = true;
          if (event.type === 'ring_out' && (event.targetOwner === 'p1' || event.targetOwner === 'p2')) {
            if (firstOut) doubleKo = true;
            else { firstOut = event.targetOwner; firstOutStep = step; }
          }
          if (!awarded && event.attackerOwner === side && event.impulse >= 3.5) {
            surge[side] = Math.min(100, surge[side] + (event.type === 'whip_crit' ? 35 : 10));
            awarded = true;
          }
        }
        if (doubleKo || (firstOut && step - firstOutStep >= koSteps)) break;
        if (!firstOut && (physics.getRestDuration() >= REST_HOLD_SECONDS || step >= maxSteps)) break;
      }
      if (side === 'p2') {
        contact.shots++;
        if (hit) contact.hits++;
      }
      if (firstOut) {
        if (!doubleKo && ++score[opposite(firstOut)] === 2) return opposite(firstOut);
        break;
      }
      physics.dampToRest();
      side = opposite(side);
    }
    starter = opposite(starter);
  }
  return undefined;
}

const count = Number(process.env.AI_BENCH_MATCHES ?? 16);
const firstSeed = Number(process.env.AI_BENCH_SEED ?? 0);
const mode = process.argv[2];
const output = process.argv[3];
assert.ok(Number.isSafeInteger(count) && count > 0 && output && (mode === 'before' || mode === 'after'));
const planner = mode === 'before' ? ai.planAiFlick : ai.planTournamentFlick;
for (const { index } of TOURNAMENT_LADDER) {
  const wait = ai.getTournamentReactionSeconds(index, 'fixture');
  assert.ok(wait >= 0.75 && wait <= 1.3);
  if (index) assert.ok(wait < ai.getTournamentReactionSeconds(index - 1, 'fixture'));
}
const now = Date.now();
const verified = new OnlineMatch(now, TOURNAMENT_LADDER[0]);
assert.ok(verified.play('p1', 0, { aimRadians: -Math.PI / 2, gripOffset01: 0, normalizedPower: 0.05 }, now));
assert.equal(verified.state.turn, 'p2');
const replayEnd = verified.replay!.endAt;
verified.playAi(replayEnd + 500);
assert.equal(verified.state.revision, 1);
verified.playAi(replayEnd + 1400);
assert.equal(verified.state.revision, 2);

const rows = (beginner ? TOURNAMENT_LADDER.slice(0, 8) : TOURNAMENT_LADDER).map(rival => {
  let aiWins = 0;
  let playerWins = 0;
  const contact = { shots: 0, hits: 0 };
  for (let sample = firstSeed; sample < firstSeed + count; sample++) {
    const seed = 57 + sample * 263 + rival.index * 659;
    const desk = DESKS[sample % DESKS.length];
    // Use pens a player could already own when facing this rival.
    const id = rival.index < 8 ? 'classic_ballpoint' : rival.index < 16
      ? (sample % 3 === 0 ? 'classic_ballpoint' : 'hyper_gel')
      : (sample % 3 === 0 ? 'hyper_gel' : sample % 3 === 1 ? 'neon_highlighter' : 'chunky_marker');
    const profile = createDefaultProfile();
    profile.penGripLevels[id] = sample % 2 === 0 ? Math.min(4, Math.floor(rival.index / 4)) : 0;
    profile.penMastery[id] = profile.penGripLevels[id];
    const winner = playMatch(rival, desk, getTournamentPen(profile, getPenById(id)), seed, planner, contact);
    if (winner === 'p2') aiWins++;
    if (winner === 'p1') playerWins++;
  }
  const row = { level: rival.index + 1, name: rival.name, aiWins, playerWins,
    unresolved: count - aiWins - playerWins, aiShots: contact.shots, aiHits: contact.hits };
  console.log(row.level, row.name, `${aiWins}/${count}`, 'AI wins', `${contact.hits}/${contact.shots}`, 'AI shots hit');
  return row;
});
writeFileSync(output, JSON.stringify({ count, firstSeed, rows }, null, 2) + '\n');
