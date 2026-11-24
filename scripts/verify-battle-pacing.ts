import assert from 'node:assert/strict';
import { planAiFlick, planTournamentFlick } from '../src/game/ai/aiController';
import { DESKS, DOUBLE_KO_WINDOW_MS, FIXED_DT, HARD_TURN_TIMEOUT_SECONDS, PENS, REST_HOLD_SECONDS, SUDDEN_DEATH_START_SHOT, TOURNAMENT_LADDER, TURBO_IMPULSE_MULT, getDeskById, getPenById } from '../src/game/content';
import { getTournamentPen } from '../src/game/garage';
import { createDefaultProfile } from '../src/game/persistence';
import { MatterPhysicsAdapter, mulberry32 } from '../src/game/physics/matterAdapter';
import { OnlineMatch, otherSide } from '../server/onlineMatch';
import { ONLINE_DESK, ONLINE_FRAME_MS, type OnlineSide } from '../src/game/onlineProtocol';
import type { DeskSpec, PenSpec, PhysicsSnapshot } from '../src/game/types';

function playRound(desk: DeskSpec, first: PenSpec, second: PenSpec, seed: number, rivalIndex?: number) {
  const physics = new MatterPhysicsAdapter();
  physics.initializeRound(seed, first, second, 'p2', desk, true);
  let side: OnlineSide = seed % 2 ? 'p1' : 'p2';
  const surge = { p1: 0, p2: 0 };
  const random = mulberry32(seed + 110);
  for (let turn = 1; turn <= 20; turn++) {
    const snapshot = physics.snapshot();
    const perspective: PhysicsSnapshot = {
      ...snapshot,
      p1: { ...snapshot[otherSide(side)], owner: 'p1' },
      p2: { ...snapshot[side], owner: 'ai' },
    };
    const suddenDeath = 1 + Math.max(0, Math.min(5, turn - SUDDEN_DEATH_START_SHOT + 1)) * 0.03;
    const turbo = surge[side] >= 100 ? TURBO_IMPULSE_MULT : 1;
    if (turbo > 1) surge[side] = 0;
    const rivalTurn = side === 'p2' && rivalIndex !== undefined;
    const playerSkill = rivalIndex === undefined ? 12 : 16;
    const plan = rivalTurn
      ? planTournamentFlick(perspective, desk, rivalIndex, `${seed}_${turn}`, turbo, suddenDeath)
      : planAiFlick(perspective, desk, playerSkill, String(turn), turbo, suddenDeath);
    let result = plan.next();
    while (!result.done) result = plan.next();
    const shot = result.value.shot;
    physics.submitFlick({ ...shot, playerId: side, aimRadians: shot.aimRadians + (rivalTurn ? 0 : (random() - 0.5) * 0.10) }, turbo, suddenDeath);
    let gained = false;
    let firstOut: OnlineSide | undefined;
    let firstOutStep = 0;
    const koSteps = Math.ceil(DOUBLE_KO_WINDOW_MS / (FIXED_DT * 1000));
    const maxSteps = Math.ceil(HARD_TURN_TIMEOUT_SECONDS / FIXED_DT);
    for (let step = 0; step < maxSteps + koSteps; step++) {
      for (const event of physics.stepFixed()) {
        if (event.type === 'ring_out' && (event.targetOwner === 'p1' || event.targetOwner === 'p2')) {
          if (firstOut) return { turns: turn, winner: undefined };
          firstOut = event.targetOwner;
          firstOutStep = step;
        }
        if (!gained && event.attackerOwner === side && event.impulse >= 3.5) {
          surge[side] = Math.min(100, surge[side] + (event.type === 'whip_crit' ? 35 : 10));
          gained = true;
        }
      }
      if (firstOut && step - firstOutStep >= koSteps) return { turns: turn, winner: otherSide(firstOut) };
      if (!firstOut && (step >= maxSteps || physics.getRestDuration() >= REST_HOLD_SECONDS)) break;
    }
    physics.dampToRest();
    side = otherSide(side);
  }
  return { turns: 0, winner: undefined };
}

const results: number[] = [];
for (const desk of DESKS) {
  const sample: number[] = [];
  for (const first of PENS) for (const second of PENS) {
    for (const seed of [13, 46]) sample.push(playRound(desk, first, second, seed).turns);
  }
  results.push(...sample);
  const sorted = sample.map(value => value || 21).sort((a, b) => a - b);
  console.log(desk.name, {
    rounds: sample.length, median: sorted[Math.floor(sorted.length / 2)],
    oneHit: sample.filter(value => value === 1).length,
    fourToEight: sample.filter(value => value >= 4 && value <= 8).length,
    noRingOutBy20: sample.filter(value => value === 0).length,
  });
}
const sorted = results.map(value => value || 21).sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
console.log({ median, openingRingOuts: results.filter(value => value === 1).length, noRingOutBy20: results.filter(value => value === 0).length });

const pen = getPenById('classic_ballpoint');
const upgraded = createDefaultProfile();
for (const model of PENS) {
  upgraded.penMastery[model.id] = 5;
  upgraded.penGripLevels[model.id] = 5;
}
const boss = getPenById('gold_fountain');
const calibration = new MatterPhysicsAdapter();
const maxStarter = getTournamentPen(upgraded, pen);
calibration.initializeRound(1, pen, pen, 'p2', DESKS[0], true);
const partTest = calibration.snapshot();
Object.assign(partTest.p1, { x: 95, y: 370, angle: Math.PI / 2 });
Object.assign(partTest.p2, { x: 230, y: 370, angle: Math.PI / 2 });
const demoFlick = { shotId: 'parts', playerId: 'p1' as const, gripOffset01: 0, aimRadians: 0, normalizedPower: 0.6 };
function testPart(shooter: PenSpec, receiver: PenSpec) {
  calibration.initializeShotPreview({
    ...partTest, p1: { ...partTest.p1, spec: shooter }, p2: { ...partTest.p2, spec: receiver },
  }, DESKS[0]);
  calibration.submitFlick(demoFlick, 1);
  const speed = calibration.snapshot().p1.vx;
  for (let i = 0; i < 100; i++) calibration.stepFixed();
  return { speed, distancePushed: calibration.snapshot().p2.x - partTest.p2.x };
}
const untuned = testPart(pen, pen);
assert.ok(testPart(maxStarter, pen).speed > untuned.speed * 1.15, 'Nib tuning should increase real flick speed');
assert.ok(untuned.distancePushed > 10 && testPart(pen, maxStarter).distancePushed < untuned.distancePushed * 0.91,
  'Grip tuning should reduce actual slide distance');
const seeds = Array.from({ length: 12 }, (_, index) => 19 + index * 137);
const countWins = (model: PenSpec, rival: PenSpec, skill: number, samples = seeds) =>
  DESKS.reduce((total, desk) => total + samples.filter(seed => playRound(desk, model, rival, seed, skill).winner === 'p1').length, 0);
const ladderWins = [0, 7, 23].map(skill => countWins(pen, getPenById(TOURNAMENT_LADDER[skill].penId), skill));
const bossWinsByPen = PENS.map(model => ({ pen: model.name, stock: countWins(model, boss, 23),
  upgraded: countWins(getTournamentPen(upgraded, model), boss, 23) }));
const starter = bossWinsByPen[0];
console.log('Starter round wins against rivals 1, 8 and 24', ladderWins, 'out of', seeds.length * DESKS.length);
console.table(bossWinsByPen);
assert.ok(median >= 4 && median <= 8, `Expected median 4–8 flicks, got ${median}`);
assert.ok(results.filter(value => value === 1).length <= results.length * 0.05, 'Opening KOs should be uncommon');
assert.ok(results.filter(value => value === 0).length <= results.length * 0.10, 'Too many stale rounds');
assert.ok(ladderWins[0] > ladderWins[1] && ladderWins[1] > ladderWins[2], 'Stronger AI should beat the same player more often');
assert.ok(starter.stock <= seeds.length * DESKS.length * 0.25, 'Stock starter should struggle against the final boss');
assert.ok(starter.upgraded > starter.stock, 'Upgrades should improve the starter against the final boss');
assert.ok(bossWinsByPen.slice(3).every(result => result.upgraded > starter.stock),
  'Advanced upgraded pens should outperform the stock starter against the final boss');

const edge = new MatterPhysicsAdapter();
edge.initializeRound(1, pen, pen, 'p2', DESKS[0], true);
const position = edge.snapshot();
Object.assign(position.p1, { x: 225, y: 370, angle: Math.PI / 2 });
Object.assign(position.p2, { x: 355, y: 370, angle: Math.PI / 2 });
edge.initializeShotPreview(position, DESKS[0]);
edge.submitFlick({ shotId: 'edge', playerId: 'p1', gripOffset01: 0, aimRadians: 0, normalizedPower: 1 }, 1);
for (let i = 0; i < 480 && !edge.snapshot().p2.outOfBounds; i++) edge.stepFixed();
assert.ok(edge.snapshot().p2.outOfBounds, 'A clean shot against a vulnerable pen still knocks it out');

const now = Date.now();
const match = new OnlineMatch(now);
assert.equal(match.state.snapshot.tournament, undefined);
assert.deepEqual([match.state.snapshot.p1.spec.id, match.state.snapshot.p2.spec.id], [pen.id, pen.id]);
const verifiedTournament = new OnlineMatch(now, TOURNAMENT_LADDER[23], 'chunky_marker');
assert.equal(verifiedTournament.state.snapshot.tournament, true);
assert.equal(verifiedTournament.state.snapshot.p2.spec.id, boss.id);
const flick = { aimRadians: -Math.PI / 2, gripOffset01: 0, normalizedPower: 0.8 };
const preview = new MatterPhysicsAdapter();
preview.initializeShotPreview(match.state.snapshot, getDeskById(ONLINE_DESK));
preview.submitFlick({ ...flick, playerId: 'p1', shotId: '1' }, 1);
assert.equal(match.play('p2', 0, flick, now), false);
assert.equal(match.play('p1', 0, flick, now), true);
assert.ok(match.replay && match.replay.frames.length > 1);
for (let step = 0; step < Math.round(ONLINE_FRAME_MS / (1000 * FIXED_DT)); step++) preview.stepFixed();
const replayed = match.replay.frames[1].snapshot;
for (const side of ['p1', 'p2'] as const) {
  const simulated = preview.snapshot()[side];
  for (const field of ['x', 'y', 'angle'] as const) {
    assert.ok(Math.abs(simulated[field] - replayed[side][field]) < 0.01, `Server/client replay drift in ${side} ${field}`);
  }
}
assert.equal(match.play('p1', 0, flick, now), false);
console.log('Clean edge KOs, shared physics replay, and rejection of off-turn or repeated commands verified.');
