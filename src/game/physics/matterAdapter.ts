import Matter from 'matter-js';
import {
  DESK_RECT,
  FIXED_DT,
  REST_ANGULAR_THRESHOLD,
  REST_LINEAR_THRESHOLD,
} from '../content';
import {
  DeskSpec,
  FlickCommand,
  PenBodyState,
  PenSpec,
  PhysicsEvent,
  PhysicsSnapshot,
  PlayerId,
} from '../types';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Per 1/120s substep physics tuning constants (independent of render FPS & DPI)
const BASE_IMPULSE_MAG = 28.5; // Crisp full-desk travel with high-stakes edge risk
const MAX_SPEED_PER_STEP = 13.5; // < pen diameter to prevent tunneling at max Turbo
const MAX_OMEGA_PER_STEP = 0.25; // ~30 rad/s cap for numerical stability
const BASE_MASS_SCALE = 2.4;

interface ManagedPen {
  owner: PlayerId;
  spec: PenSpec;
  masteryMult: number; // 1.00 .. 1.05 (Tournament only)
  body: Matter.Body;
  outOfBounds: boolean;
  overhangRatio: number;
  hitFlash: number;
  fallProgress: number;
  fallDirX: number;
  fallDirY: number;
  fallSpin: number;
  trail: Array<{ x: number; y: number; angle: number; alpha: number; turbo: boolean }>;
  activeTurbo: boolean;
  preStepOmega: number;
}

export class MatterPhysicsAdapter {
  private engine: Matter.Engine;
  private desk!: DeskSpec;
  private pen1!: ManagedPen;
  private pen2!: ManagedPen;
  private activeShotId = '';
  private activeShooter: PlayerId = 'p1';
  private pendingEvents: PhysicsEvent[] = [];
  private restAccumulator = 0;

  constructor() {
    this.engine = Matter.Engine.create({
      gravity: { x: 0, y: 0, scale: 0 },
      positionIterations: 8,
      velocityIterations: 6,
    });
    this.engine.timing.lastDelta = FIXED_DT * 1000;

    Matter.Events.on(this.engine, 'collisionStart', (event) => {
      this.handleCollisions(event.pairs);
    });
  }

  private createPenBody(
    owner: PlayerId,
    spec: PenSpec,
    x: number,
    y: number,
    angle: number,
    masteryMult: number
  ): ManagedPen {
    const innerLen = Math.max(16, spec.length - spec.radius * 2);
    const r = spec.radius;
    const rect = Matter.Bodies.rectangle(0, 0, innerLen, r * 2, {
      label: `${owner}_core`,
    });
    const capLeft = Matter.Bodies.circle(-innerLen / 2, 0, r, {
      label: `${owner}_cap_l`,
    });
    const capRight = Matter.Bodies.circle(innerLen / 2, 0, r, {
      label: `${owner}_cap_r`,
    });

    const compound = Matter.Body.create({
      parts: [rect, capLeft, capRight],
      restitution: 0.82,
      friction: 0.08,
      frictionStatic: 0.12,
      frictionAir: 0,
      slop: 0.02,
      label: owner,
    });

    const targetMass = spec.mass * BASE_MASS_SCALE;
    const targetInertia =
      (1 / 12) * targetMass * (spec.length * spec.length + 4 * r * r) * 0.85;

    Matter.Body.setMass(compound, targetMass);
    Matter.Body.setInertia(compound, targetInertia);
    Matter.Body.setPosition(compound, { x, y });
    Matter.Body.setAngle(compound, angle);

    return {
      owner,
      spec,
      masteryMult,
      body: compound,
      outOfBounds: false,
      overhangRatio: 0,
      hitFlash: 0,
      fallProgress: 0,
      fallDirX: 0,
      fallDirY: 0,
      fallSpin: 0,
      trail: [],
      activeTurbo: false,
      preStepOmega: 0,
    };
  }

  initializeRound(
    seed: number,
    pen1Spec: PenSpec,
    pen2Spec: PenSpec,
    p2Owner: 'ai' | 'p2',
    desk: DeskSpec,
    p1MasteryMult = 1.0,
    p2MasteryMult = 1.0
  ): void {
    Matter.World.clear(this.engine.world, false);
    this.engine.timing.lastDelta = FIXED_DT * 1000;
    this.desk = desk;
    this.pendingEvents = [];
    this.activeShotId = '';
    this.restAccumulator = 0;

    const rng = mulberry32(seed);
    const cx = (DESK_RECT.left + DESK_RECT.right) / 2;
    const cy = (DESK_RECT.top + DESK_RECT.bottom) / 2;

    // Mirrored stable spawn positions with slight seeded organic angle variance
    const offsetX = (rng() - 0.5) * 40;
    const offsetY = 128 + (rng() - 0.5) * 16;
    const tilt = (rng() - 0.5) * 0.26;

    this.pen1 = this.createPenBody(
      'p1',
      pen1Spec,
      cx + offsetX,
      cy + offsetY,
      tilt,
      p1MasteryMult
    );
    this.pen2 = this.createPenBody(
      p2Owner,
      pen2Spec,
      cx - offsetX,
      cy - offsetY,
      Math.PI + tilt,
      p2MasteryMult
    );

    Matter.World.add(this.engine.world, [this.pen1.body, this.pen2.body]);
  }

  getPen(owner: PlayerId): ManagedPen {
    return owner === 'p1' ? this.pen1 : this.pen2;
  }

  submitFlick(command: FlickCommand, turboMult: number, suddenDeathMult = 1.0): void {
    const managed = this.getPen(command.playerId);
    if (managed.outOfBounds) return;

    this.activeShotId = command.shotId;
    this.activeShooter = command.playerId;
    this.restAccumulator = 0;
    managed.activeTurbo = turboMult > 1.01;

    const powerClamped = Math.max(0.05, Math.min(1, command.normalizedPower));
    const easedPower = Math.pow(powerClamped, 1.3);
    const gripClamped = Math.max(-1, Math.min(1, command.gripOffset01));

    const jMag =
      BASE_IMPULSE_MAG *
      easedPower *
      managed.spec.power *
      managed.masteryMult *
      turboMult *
      suddenDeathMult;

    const jx = Math.cos(command.aimRadians) * jMag;
    const jy = Math.sin(command.aimRadians) * jMag;

    // Linear velocity change: Δv = J / m
    const dvx = jx / managed.body.mass;
    const dvy = jy / managed.body.mass;

    // Grip lever arm along pen longitudinal axis: r = g - center
    const halfLever = managed.spec.length * 0.44;
    const cosA = Math.cos(managed.body.angle);
    const sinA = Math.sin(managed.body.angle);
    const rx = cosA * (gripClamped * halfLever);
    const ry = sinA * (gripClamped * halfLever);

    // 2D cross product r × J -> angular velocity change Δω = (r × J) / I * spinMult
    const torque = rx * jy - ry * jx;
    // Scale angular impulse cleanly so off-center flicks produce crisp, controllable whip spins
    const dOmega =
      (torque / managed.body.inertia) * managed.spec.spin * managed.masteryMult * 1.45;

    const nextVx = managed.body.velocity.x + dvx;
    const nextVy = managed.body.velocity.y + dvy;
    const speed = Math.hypot(nextVx, nextVy);
    const speedScale = speed > MAX_SPEED_PER_STEP ? MAX_SPEED_PER_STEP / speed : 1;

    const nextOmega = Math.max(
      -MAX_OMEGA_PER_STEP,
      Math.min(MAX_OMEGA_PER_STEP, managed.body.angularVelocity + dOmega)
    );

    Matter.Body.setVelocity(managed.body, {
      x: nextVx * speedScale,
      y: nextVy * speedScale,
    });
    Matter.Body.setAngularVelocity(managed.body, nextOmega);
  }

  private handleCollisions(pairs: Matter.Pair[]): void {
    for (const pair of pairs) {
      const parentA = pair.bodyA.parent;
      const parentB = pair.bodyB.parent;
      if (parentA.id === parentB.id) continue;

      const penA = parentA.id === this.pen1.body.id ? this.pen1 : this.pen2;
      const penB = parentB.id === this.pen1.body.id ? this.pen1 : this.pen2;
      if (penA.outOfBounds || penB.outOfBounds) continue;

      const relVx = penA.body.velocity.x - penB.body.velocity.x;
      const relVy = penA.body.velocity.y - penB.body.velocity.y;
      const relSpeed = Math.hypot(relVx, relVy);
      const impulse = relSpeed * Math.min(penA.body.mass, penB.body.mass);

      if (impulse < 0.8) continue;

      const contact = pair.collision.supports[0] ?? {
        x: (penA.body.position.x + penB.body.position.x) * 0.5,
        y: (penA.body.position.y + penB.body.position.y) * 0.5,
      };

      penA.hitFlash = Math.min(1, 0.45 + impulse * 0.05);
      penB.hitFlash = Math.min(1, 0.45 + impulse * 0.05);

      const attacker = this.activeShooter === 'p1' ? this.pen1 : this.pen2;
      const target = attacker === this.pen1 ? this.pen2 : this.pen1;

      // Determine whether contact landed in outer 25% tip region of the target pen
      const dx = contact.x - target.body.position.x;
      const dy = contact.y - target.body.position.y;
      const localLongitudinal =
        dx * Math.cos(target.body.angle) + dy * Math.sin(target.body.angle);
      const halfLen = target.spec.length * 0.5;
      const isOuterTip = Math.abs(localLongitudinal) >= halfLen * 0.5;

      // Estimate angular impulse gain from glancing tip impact
      const estimatedAngularGain =
        Math.abs(localLongitudinal * relSpeed) / Math.max(1, target.spec.length) +
        Math.abs(attacker.preStepOmega) * 14;

      const isWhipCrit = isOuterTip && impulse >= 4.2 && estimatedAngularGain >= 2.2;

      this.pendingEvents.push({
        type: isWhipCrit ? 'whip_crit' : 'collision',
        shotId: this.activeShotId,
        x: contact.x,
        y: contact.y,
        impulse,
        attackerOwner: attacker.owner,
        targetOwner: target.owner,
        angularGain: estimatedAngularGain,
      });
    }
  }

  /**
   * Authoritative full-capsule footprint support check (Blueprint §2.1 & PHY-09/10).
   * Returns { fullyOut, overhangRatio }. A pen is ONLY KO'd when ALL sample points
   * along its physical capsule clear the desk rectangle.
   */
  private evaluateDeskSupport(pen: ManagedPen): {
    fullyOut: boolean;
    overhangRatio: number;
  } {
    const samples = 7;
    const halfSpine = pen.spec.length * 0.5 - pen.spec.radius * 0.35;
    const cosA = Math.cos(pen.body.angle);
    const sinA = Math.sin(pen.body.angle);
    const rPad = pen.spec.radius * 0.45;

    let outCount = 0;
    for (let i = 0; i < samples; i++) {
      const t = -1 + (2 * i) / (samples - 1);
      const px = pen.body.position.x + cosA * (t * halfSpine);
      const py = pen.body.position.y + sinA * (t * halfSpine);
      const onDesk =
        px + rPad >= DESK_RECT.left &&
        px - rPad <= DESK_RECT.right &&
        py + rPad >= DESK_RECT.top &&
        py - rPad <= DESK_RECT.bottom;
      if (!onDesk) outCount += 1;
    }

    return {
      fullyOut: outCount === samples,
      overhangRatio: outCount / samples,
    };
  }

  private applyDeskFriction(pen: ManagedPen): void {
    if (pen.outOfBounds) return;
    const fMult = this.desk.frictionMult * pen.spec.grip;
    const vx = pen.body.velocity.x;
    const vy = pen.body.velocity.y;
    const speed = Math.hypot(vx, vy);

    if (speed > 0.0001) {
      // Viscous + Coulomb kinetic desk sliding friction
      const viscous = Math.max(0, 1 - 0.0085 * fMult);
      let nextSpeed = speed * viscous - 0.015 * fMult;
      if (nextSpeed < 0) nextSpeed = 0;
      if (nextSpeed > MAX_SPEED_PER_STEP) nextSpeed = MAX_SPEED_PER_STEP;
      const scale = nextSpeed / speed;
      Matter.Body.setVelocity(pen.body, {
        x: vx * scale,
        y: vy * scale,
      });
    }

    const w = pen.body.angularVelocity;
    if (Math.abs(w) > 0.00001) {
      const sign = Math.sign(w);
      let nextW = Math.abs(w) * Math.max(0, 1 - 0.0115 * fMult) - 0.0006 * fMult;
      if (nextW < 0) nextW = 0;
      if (nextW > MAX_OMEGA_PER_STEP) nextW = MAX_OMEGA_PER_STEP;
      Matter.Body.setAngularVelocity(pen.body, sign * nextW);
    }
  }

  stepFixed(dtSeconds = FIXED_DT): PhysicsEvent[] {
    this.pendingEvents = [];

    for (const pen of [this.pen1, this.pen2]) {
      pen.preStepOmega = pen.body.angularVelocity;
      this.applyDeskFriction(pen);
      if (pen.hitFlash > 0) {
        pen.hitFlash = Math.max(0, pen.hitFlash - dtSeconds * 4.5);
      }
    }

    Matter.Engine.update(this.engine, dtSeconds * 1000);

    // Clamp velocities post-collision for numerical safety (PHY-05)
    for (const pen of [this.pen1, this.pen2]) {
      if (pen.outOfBounds) {
        // Animate visual fall off desk edge cleanly outside physics competition
        pen.fallProgress = Math.min(1, pen.fallProgress + dtSeconds * 1.45);
        Matter.Body.setPosition(pen.body, {
          x: pen.body.position.x + pen.fallDirX * dtSeconds * 165,
          y: pen.body.position.y + pen.fallDirY * dtSeconds * 165,
        });
        Matter.Body.setAngle(pen.body, pen.body.angle + pen.fallSpin * dtSeconds);
        continue;
      }

      const vx = pen.body.velocity.x;
      const vy = pen.body.velocity.y;
      const spd = Math.hypot(vx, vy);
      if (!Number.isFinite(spd) || !Number.isFinite(pen.body.angularVelocity)) {
        Matter.Body.setVelocity(pen.body, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(pen.body, 0);
      } else if (spd > MAX_SPEED_PER_STEP) {
        const s = MAX_SPEED_PER_STEP / spd;
        Matter.Body.setVelocity(pen.body, { x: vx * s, y: vy * s });
      }

      // Record motion trail for fast-moving pens
      if (spd > 2.2) {
        pen.trail.push({
          x: pen.body.position.x,
          y: pen.body.position.y,
          angle: pen.body.angle,
          alpha: Math.min(0.65, spd / 12),
          turbo: pen.activeTurbo,
        });
        if (pen.trail.length > 10) pen.trail.shift();
      } else if (pen.trail.length > 0) {
        pen.trail.shift();
      }
      for (const t of pen.trail) t.alpha *= 0.92;

      // Authoritative footprint check
      const support = this.evaluateDeskSupport(pen);
      pen.overhangRatio = support.overhangRatio;
      if (support.fullyOut) {
        pen.outOfBounds = true;
        pen.fallProgress = 0.01;
        // Direction away from desk center
        const dcx = (DESK_RECT.left + DESK_RECT.right) * 0.5;
        const dcy = (DESK_RECT.top + DESK_RECT.bottom) * 0.5;
        const outDx = pen.body.position.x - dcx;
        const outDy = pen.body.position.y - dcy;
        const outLen = Math.hypot(outDx, outDy) || 1;
        pen.fallDirX = outDx / outLen + vx * 0.14;
        pen.fallDirY = outDy / outLen + vy * 0.14;
        pen.fallSpin =
          (Math.abs(pen.body.angularVelocity) > 0.02
            ? pen.body.angularVelocity * 60
            : (pen.owner === 'p1' ? 1 : -1) * 4.5);

        // Freeze competitive physics state immediately
        Matter.Body.setVelocity(pen.body, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(pen.body, 0);
        Matter.Body.setStatic(pen.body, true);

        this.pendingEvents.push({
          type: 'ring_out',
          shotId: this.activeShotId,
          x: pen.body.position.x,
          y: pen.body.position.y,
          impulse: 0,
          targetOwner: pen.owner,
        });
      }
    }

    // Track continuous rest state
    const linear1 = Math.hypot(this.pen1.body.velocity.x, this.pen1.body.velocity.y) * 120;
    const linear2 = Math.hypot(this.pen2.body.velocity.x, this.pen2.body.velocity.y) * 120;
    const ang1 = Math.abs(this.pen1.body.angularVelocity) * 120;
    const ang2 = Math.abs(this.pen2.body.angularVelocity) * 120;

    const belowRest =
      (this.pen1.outOfBounds || (linear1 < REST_LINEAR_THRESHOLD && ang1 < REST_ANGULAR_THRESHOLD)) &&
      (this.pen2.outOfBounds || (linear2 < REST_LINEAR_THRESHOLD && ang2 < REST_ANGULAR_THRESHOLD));

    if (belowRest) {
      this.restAccumulator += dtSeconds;
    } else {
      this.restAccumulator = 0;
    }

    return this.pendingEvents;
  }

  dampToRest(): void {
    for (const pen of [this.pen1, this.pen2]) {
      if (!pen.outOfBounds) {
        Matter.Body.setVelocity(pen.body, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(pen.body, 0);
        pen.activeTurbo = false;
        pen.trail = [];
      }
    }
    this.restAccumulator = 1;
  }

  getRestDuration(): number {
    return this.restAccumulator;
  }

  clearTurboFlags(): void {
    this.pen1.activeTurbo = false;
    this.pen2.activeTurbo = false;
  }

  private toState(pen: ManagedPen): PenBodyState {
    return {
      owner: pen.owner,
      spec: pen.spec,
      x: pen.body.position.x,
      y: pen.body.position.y,
      angle: pen.body.angle,
      vx: pen.body.velocity.x * 120,
      vy: pen.body.velocity.y * 120,
      omega: pen.body.angularVelocity * 120,
      outOfBounds: pen.outOfBounds,
      overhangRatio: pen.overhangRatio,
      hitFlash: pen.hitFlash,
      fallProgress: pen.fallProgress,
      fallDirX: pen.fallDirX,
      fallDirY: pen.fallDirY,
      fallSpin: pen.fallSpin,
      trail: pen.trail,
    };
  }

  snapshot(): PhysicsSnapshot {
    return {
      p1: this.toState(this.pen1),
      p2: this.toState(this.pen2),
      isAtRest: this.restAccumulator >= 0.45,
    };
  }
}
