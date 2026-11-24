import { DESK_RECT, WORLD_H, WORLD_W } from '../content';
import { AimPreviewState, DeskSpec, PenBodyState } from '../types';
import { PEN_DETAILS } from './penDetails';

export interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface ShockwaveRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface FloatingCallout {
  text: string;
  subtext?: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface RenderState {
  desk: DeskSpec;
  p1: PenBodyState;
  p2: PenBodyState;
  activeTurn: 'p1' | 'p2';
  isAiOpponent: boolean;
  p1TurboReady: boolean;
  p2TurboReady: boolean;
  aimPreview: AimPreviewState | null;
  aiThinkProgress: number; // 0..1 when AI is winding up
  shakeX: number;
  shakeY: number;
  sparks: SparkParticle[];
  rings: ShockwaveRing[];
  callouts: FloatingCallout[];
  reducedMotion: boolean;
  isAttractMode: boolean;
  timeSec: number;
}

export class CanvasRenderer {
  private deskCache = new Map<string, HTMLCanvasElement>();

  private getDeskCanvas(desk: DeskSpec): HTMLCanvasElement {
    const existing = this.deskCache.get(desk.id);
    if (existing) return existing;

    const c = document.createElement('canvas');
    c.width = WORLD_W * 2;
    c.height = WORLD_H * 2;
    const ctx = c.getContext('2d')!;
    ctx.scale(2, 2);

    // Outer ambient deep slate void
    const bgGrad = ctx.createRadialGradient(
      WORLD_W * 0.5,
      WORLD_H * 0.45,
      40,
      WORLD_W * 0.5,
      WORLD_H * 0.5,
      WORLD_H * 0.72
    );
    bgGrad.addColorStop(0, '#162033');
    bgGrad.addColorStop(1, '#070B14');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Subtle desk drop shadow into the void
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 16;
    this.roundRect(
      ctx,
      DESK_RECT.left - 6,
      DESK_RECT.top - 6,
      DESK_RECT.width + 12,
      DESK_RECT.height + 12,
      18
    );
    ctx.fillStyle = desk.borderColor;
    ctx.fill();
    ctx.restore();

    // Beveled outer desk edge frame
    this.roundRect(
      ctx,
      DESK_RECT.left - 6,
      DESK_RECT.top - 6,
      DESK_RECT.width + 12,
      DESK_RECT.height + 12,
      18
    );
    ctx.fillStyle = desk.borderColor;
    ctx.fill();

    // Inner playable surface clip
    ctx.save();
    this.roundRect(
      ctx,
      DESK_RECT.left,
      DESK_RECT.top,
      DESK_RECT.width,
      DESK_RECT.height,
      13
    );
    ctx.clip();

    const surfGrad = ctx.createLinearGradient(
      DESK_RECT.left,
      DESK_RECT.top,
      DESK_RECT.right,
      DESK_RECT.bottom
    );
    surfGrad.addColorStop(0, desk.surfacePrimary);
    surfGrad.addColorStop(1, desk.surfaceSecondary);
    ctx.fillStyle = surfGrad;
    ctx.fillRect(DESK_RECT.left, DESK_RECT.top, DESK_RECT.width, DESK_RECT.height);

    if (desk.id === 'school_oak') {
      // Layered warm oak wood planks & subtle grain streaks
      const planks = 6;
      const plankW = DESK_RECT.width / planks;
      for (let i = 0; i < planks; i++) {
        const px = DESK_RECT.left + i * plankW;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 224, 185, 0.045)' : 'rgba(20, 8, 2, 0.06)';
        ctx.fillRect(px, DESK_RECT.top, plankW, DESK_RECT.height);
        ctx.strokeStyle = 'rgba(35, 16, 6, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, DESK_RECT.top);
        ctx.lineTo(px, DESK_RECT.bottom);
        ctx.stroke();

        // Organic wood grain curves
        ctx.strokeStyle = 'rgba(255, 232, 200, 0.05)';
        for (let g = 0; g < 4; g++) {
          const gx = px + 8 + g * 13;
          ctx.beginPath();
          ctx.moveTo(gx, DESK_RECT.top);
          ctx.bezierCurveTo(
            gx + (g % 2 === 0 ? 5 : -5),
            DESK_RECT.top + 180,
            gx + (g % 2 === 0 ? -4 : 4),
            DESK_RECT.top + 380,
            gx,
            DESK_RECT.bottom
          );
          ctx.stroke();
        }
      }

      // Carved school desk pencil groove at top
      this.roundRect(ctx, DESK_RECT.left + 72, DESK_RECT.top + 14, DESK_RECT.width - 144, 7, 3.5);
      ctx.fillStyle = 'rgba(24, 11, 4, 0.28)';
      ctx.fill();
    } else {
      // Exam Slate Table: sleek drafting grid & crisp precision lines
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.075)';
      ctx.lineWidth = 1;
      const step = 32;
      for (let x = DESK_RECT.left + step; x < DESK_RECT.right; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, DESK_RECT.top);
        ctx.lineTo(x, DESK_RECT.bottom);
        ctx.stroke();
      }
      for (let y = DESK_RECT.top + step; y < DESK_RECT.bottom; y += step) {
        ctx.beginPath();
        ctx.moveTo(DESK_RECT.left, y);
        ctx.lineTo(DESK_RECT.right, y);
        ctx.stroke();
      }
    }

    // Center arena duel circle & divider line
    const cx = (DESK_RECT.left + DESK_RECT.right) * 0.5;
    const cy = (DESK_RECT.top + DESK_RECT.bottom) * 0.5;
    ctx.strokeStyle =
      desk.id === 'school_oak' ? 'rgba(255, 240, 215, 0.14)' : 'rgba(56, 189, 248, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(DESK_RECT.left + 18, cy);
    ctx.lineTo(DESK_RECT.right - 18, cy);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(cx, cy, 46, 0, Math.PI * 2);
    ctx.stroke();

    // Subtle overhead studio light sheen across the desk
    const gloss = ctx.createRadialGradient(cx, DESK_RECT.top + 110, 20, cx, cy, 340);
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    gloss.addColorStop(1, 'rgba(0, 0, 0, 0.12)');
    ctx.fillStyle = gloss;
    ctx.fillRect(DESK_RECT.left, DESK_RECT.top, DESK_RECT.width, DESK_RECT.height);

    ctx.restore();

    // Crisp rim highlight signaling the exact physical drop-off boundary!
    this.roundRect(
      ctx,
      DESK_RECT.left,
      DESK_RECT.top,
      DESK_RECT.width,
      DESK_RECT.height,
      13
    );
    ctx.strokeStyle = desk.trimAccent;
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Corner ruler tick marks on outer desk bezel
    ctx.fillStyle = 'rgba(248, 250, 252, 0.16)';
    for (let y = DESK_RECT.top + 28; y < DESK_RECT.bottom - 20; y += 26) {
      ctx.fillRect(DESK_RECT.left - 5, y, 3, 1.5);
      ctx.fillRect(DESK_RECT.right + 2, y, 3, 1.5);
    }

    this.deskCache.set(desk.id, c);
    return c;
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  render(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    state: RenderState
  ): { scale: number; offsetX: number; offsetY: number } {
    const scale = Math.min(canvasW / WORLD_W, canvasH / WORLD_H);
    const offsetX = (canvasW - WORLD_W * scale) * 0.5;
    const offsetY = (canvasH - WORLD_H * scale) * 0.5;

    ctx.save();
    ctx.fillStyle = '#070B14';
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.translate(offsetX + state.shakeX * scale, offsetY + state.shakeY * scale);
    ctx.scale(scale, scale);

    // 1. Pre-rendered tactile desk
    const deskImg = this.getDeskCanvas(state.desk);
    ctx.drawImage(deskImg, 0, 0, WORLD_W, WORLD_H);

    // 2. Danger ledge glow if either pen is hanging > 40% off the edge
    const maxOverhang = Math.max(
      state.p1.outOfBounds ? 0 : state.p1.overhangRatio,
      state.p2.outOfBounds ? 0 : state.p2.overhangRatio
    );
    if (maxOverhang > 0.35 && !state.isAttractMode) {
      const pulse = 0.35 + 0.35 * Math.sin(state.timeSec * 14);
      ctx.save();
      this.roundRect(
        ctx,
        DESK_RECT.left,
        DESK_RECT.top,
        DESK_RECT.width,
        DESK_RECT.height,
        13
      );
      ctx.strokeStyle = `rgba(244, 63, 94, ${Math.min(0.85, maxOverhang * pulse)})`;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }

    // 3. Draw motion trails behind fast-moving pens
    this.drawTrail(ctx, state.p1, '#38BDF8');
    this.drawTrail(ctx, state.p2, '#F43F5E');

    // 4. Draw falling pens first (below the desk rim visually), then active desk pens
    const pens = [state.p1, state.p2];
    for (const pen of pens) {
      if (pen.outOfBounds) {
        this.drawPen(
          ctx,
          pen,
          false,
          false,
          state.timeSec,
          state.isAttractMode
        );
      }
    }
    for (const pen of pens) {
      if (!pen.outOfBounds) {
        const isActive =
          !state.isAttractMode &&
          ((state.activeTurn === 'p1' && pen.owner === 'p1') ||
            (state.activeTurn === 'p2' && pen.owner !== 'p1'));
        const turboReady =
          pen.owner === 'p1' ? state.p1TurboReady : state.p2TurboReady;
        this.drawPen(
          ctx,
          pen,
          isActive,
          turboReady,
          state.timeSec,
          state.isAttractMode
        );
      }
    }

    // 5. AI Thinking telegraph ring
    if (state.aiThinkProgress > 0 && !state.p2.outOfBounds && !state.isAttractMode) {
      ctx.save();
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.7)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(
        state.p2.x,
        state.p2.y,
        24 + (1 - state.aiThinkProgress) * 18,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * state.aiThinkProgress
      );
      ctx.stroke();
      ctx.restore();
    }

    // 6. Direct-Touch Drag & Torque Aim Indicator
    if (state.aimPreview && state.aimPreview.active) {
      this.drawAimIndicator(ctx, state.aimPreview, state.p1TurboReady && state.aimPreview.owner === 'p1' || state.p2TurboReady && state.aimPreview.owner !== 'p1');
    }

    // 7. Shockwaves & Sparks
    for (const ring of state.rings) {
      const alpha = Math.max(0, ring.life / ring.maxLife);
      ctx.save();
      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = alpha * 0.85;
      ctx.lineWidth = 3 * alpha + 1;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const sp of state.sparks) {
      const alpha = Math.max(0, sp.life / sp.maxLife);
      ctx.save();
      ctx.fillStyle = sp.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.size * alpha + 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 8. Floating Arcade Callouts (WHIP CRIT!, TURBO FLICK!, RING OUT!)
    for (const c of state.callouts) {
      const progress = 1 - c.life / c.maxLife;
      const alpha = progress < 0.7 ? 1 : Math.max(0, (1 - progress) / 0.3);
      const popScale = progress < 0.15 ? 0.7 + (progress / 0.15) * 0.4 : 1.05;
      ctx.save();
      ctx.translate(c.x, c.y - progress * 34);
      ctx.scale(popScale, popScale);
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.font = '800 22px Outfit, system-ui, sans-serif';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(7, 11, 20, 0.92)';
      ctx.strokeText(c.text, 0, 0);
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, 0, 0);
      if (c.subtext) {
        ctx.font = '700 12px "JetBrains Mono", monospace';
        ctx.lineWidth = 3;
        ctx.strokeText(c.subtext, 0, 17);
        ctx.fillStyle = '#F8FAFC';
        ctx.fillText(c.subtext, 0, 17);
      }
      ctx.restore();
    }

    ctx.restore();
    return { scale, offsetX, offsetY };
  }

  private drawTrail(ctx: CanvasRenderingContext2D, pen: PenBodyState, defaultColor: string): void {
    if (pen.trail.length < 2) return;
    for (let i = 0; i < pen.trail.length; i++) {
      const t = pen.trail[i];
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.angle);
      ctx.globalAlpha = t.alpha * 0.25;
      ctx.fillStyle = t.turbo ? '#FACC15' : defaultColor;
      this.roundRect(
        ctx,
        -pen.spec.length * 0.45,
        -pen.spec.radius * 0.85,
        pen.spec.length * 0.9,
        pen.spec.radius * 1.7,
        pen.spec.radius
      );
      ctx.fill();
      ctx.restore();
    }
  }

  private drawPen(
    ctx: CanvasRenderingContext2D,
    pen: PenBodyState,
    isActiveTurn: boolean,
    turboReady: boolean,
    timeSec: number,
    isAttractMode: boolean
  ): void {
    const { spec } = pen;
    const fallScale = pen.outOfBounds ? Math.max(0.28, 1 - pen.fallProgress * 0.72) : 1;
    const fallAlpha = pen.outOfBounds ? Math.max(0, 1 - pen.fallProgress * 0.92) : 1;
    if (fallAlpha <= 0.02) return;

    const ownerColor = pen.owner === 'p1' ? '#38BDF8' : '#F43F5E';

    ctx.save();
    ctx.globalAlpha = fallAlpha;
    ctx.translate(pen.x, pen.y);
    ctx.scale(fallScale, fallScale);
    ctx.rotate(pen.angle);

    const halfL = spec.length * 0.5;
    const r = spec.radius;

    // Active turn halo or Turbo gold aura beneath pen
    if ((isActiveTurn || turboReady) && !pen.outOfBounds && !isAttractMode) {
      const pulse = 0.6 + 0.35 * Math.sin(timeSec * 6.5);
      ctx.save();
      this.roundRect(ctx, -halfL - 6, -r - 6, spec.length + 12, r * 2 + 12, r + 6);
      ctx.strokeStyle = turboReady ? '#FACC15' : ownerColor;
      ctx.globalAlpha = (turboReady ? 0.78 : 0.48) * pulse;
      ctx.lineWidth = turboReady ? 3 : 2;
      ctx.stroke();
      ctx.restore();
    }

    // Dynamic shadow (separates more when falling off edge)
    const shadowOffset = pen.outOfBounds ? 10 + pen.fallProgress * 26 : 5;
    ctx.save();
    ctx.translate(shadowOffset * 0.5, shadowOffset);
    this.roundRect(ctx, -halfL, -r, spec.length, r * 2, r);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fill();
    ctx.restore();

    // Render unmistakable silhouette per pen style (Blueprint §5)
    switch (spec.style) {
      case 'ballpoint':
        this.drawBallpoint(ctx, halfL, r, spec);
        break;
      case 'gel':
        this.drawGelPro(ctx, halfL, r, spec);
        break;
      case 'highlighter':
        this.drawHighlighter(ctx, halfL, r, spec);
        break;
      case 'marker':
        this.drawChunkyMarker(ctx, halfL, r, spec);
        break;
      case 'spinner':
        this.drawVortexSpinner(ctx, halfL, r, spec);
        break;
      case 'fountain':
        this.drawGoldFountain(ctx, halfL, r, spec);
        break;
    }

    // Owner color band near rear cap so P1 (Cyan) vs Rival/P2 (Coral) is ALWAYS unmistakable
    if (!isAttractMode) {
      ctx.fillStyle = ownerColor;
      ctx.fillRect(-halfL + 12, -r * 0.92, 5, r * 1.84);
    }

    // Crisp specular glossy highlight streak along top edge
    const shineGrad = ctx.createLinearGradient(0, -r, 0, -r * 0.15);
    shineGrad.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    shineGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = shineGrad;
    this.roundRect(ctx, -halfL + 10, -r * 0.78, spec.length - 34, r * 0.58, r * 0.3);
    ctx.fill();

    this.drawBarrelDetails(ctx, halfL, r, spec);

    // Impact white hit flash
    if (pen.hitFlash > 0.02) {
      ctx.save();
      ctx.globalAlpha = pen.hitFlash * 0.7;
      ctx.fillStyle = '#FFFFFF';
      this.roundRect(ctx, -halfL, -r, spec.length, r * 2, r);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  private drawBarrelDetails(ctx: CanvasRenderingContext2D, halfL: number, r: number, spec: PenBodyState['spec']): void {
    const detail = PEN_DETAILS[spec.style];
    ctx.save();
    ctx.fillStyle = detail.ink;
    ctx.font = '700 5.5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(detail.mark, -halfL + 43, r * 0.26, 34);
    ctx.strokeStyle = detail.ink;
    ctx.lineWidth = 0.85;
    ctx.globalAlpha *= 0.64;
    ctx.beginPath();
    const seam = halfL - 24;
    switch (spec.style) {
      case 'ballpoint':
        ctx.moveTo(-halfL + 18, r * 0.65);
        ctx.lineTo(seam - 4, r * 0.65);
        break;
      case 'gel':
        for (const offset of [0, 2, 5]) {
          ctx.moveTo(seam + offset, -r * 0.64);
          ctx.lineTo(seam + offset, r * 0.64);
        }
        break;
      case 'highlighter':
        ctx.moveTo(seam + 7, 0);
        ctx.lineTo(halfL - 4, -r * 0.22);
        break;
      case 'marker':
        for (const y of [-0.53, 0.57]) {
          ctx.moveTo(seam - 14, y * r);
          ctx.lineTo(seam + 3, y * r);
        }
        break;
      case 'spinner':
        for (const offset of [0, 7]) {
          ctx.moveTo(seam - 26 + offset, -r * 0.48);
          ctx.lineTo(seam - 21 + offset, 0);
          ctx.lineTo(seam - 26 + offset, r * 0.48);
        }
        break;
      case 'fountain':
        ctx.moveTo(seam + 6, 0);
        ctx.lineTo(halfL - 2, 0);
        ctx.moveTo(seam - 11, -4);
        ctx.lineTo(seam - 7, 0);
        ctx.lineTo(seam - 11, 4);
        ctx.lineTo(seam - 15, 0);
        ctx.closePath();
        break;
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawBallpoint(
    ctx: CanvasRenderingContext2D,
    halfL: number,
    r: number,
    spec: PenBodyState['spec']
  ): void {
    // Conical silver nib on right (+halfL)
    ctx.beginPath();
    ctx.moveTo(halfL - 26, -r * 0.92);
    ctx.lineTo(halfL, 0);
    ctx.lineTo(halfL - 26, r * 0.92);
    ctx.closePath();
    ctx.fillStyle = spec.nibColor;
    ctx.fill();
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(halfL - 2, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Translucent royal-blue cylindrical barrel
    const bodyGrad = ctx.createLinearGradient(0, -r, 0, r);
    bodyGrad.addColorStop(0, spec.secondaryColor);
    bodyGrad.addColorStop(0.55, spec.primaryColor);
    bodyGrad.addColorStop(1, '#075985');
    this.roundRect(ctx, -halfL, -r, spec.length - 22, r * 2, r * 0.7);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Inner ink refill tube visible through barrel
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fillRect(-halfL + 22, -2.3, spec.length - 56, 4.6);

    // Back plug & pocket clip
    this.roundRect(ctx, -halfL, -r * 0.9, 12, r * 1.8, 4);
    ctx.fillStyle = spec.clipColor;
    ctx.fill();
    this.roundRect(ctx, -halfL + 6, -r - 2.5, 42, 4, 2);
    ctx.fillStyle = spec.clipColor;
    ctx.fill();
  }

  private drawGelPro(
    ctx: CanvasRenderingContext2D,
    halfL: number,
    r: number,
    spec: PenBodyState['spec']
  ): void {
    // Needle tip
    ctx.beginPath();
    ctx.moveTo(halfL - 28, -r * 0.85);
    ctx.lineTo(halfL, 0);
    ctx.lineTo(halfL - 28, r * 0.85);
    ctx.closePath();
    ctx.fillStyle = spec.nibColor;
    ctx.fill();

    // Sleek dark obsidian & electric cyan body
    const bodyGrad = ctx.createLinearGradient(0, -r, 0, r);
    bodyGrad.addColorStop(0, '#334155');
    bodyGrad.addColorStop(0.5, '#0F172A');
    bodyGrad.addColorStop(1, '#020617');
    this.roundRect(ctx, -halfL, -r, spec.length - 24, r * 2, r * 0.85);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Ribbed cyan rubber comfort grip near front
    ctx.fillStyle = spec.primaryColor;
    this.roundRect(ctx, halfL - 62, -r * 1.03, 34, r * 2.06, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.5)';
    ctx.lineWidth = 1.6;
    for (let x = halfL - 57; x < halfL - 31; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, -r);
      ctx.lineTo(x, r);
      ctx.stroke();
    }

    // Metallic clicker & clip
    this.roundRect(ctx, -halfL - 3, -r * 0.55, 8, r * 1.1, 3);
    ctx.fillStyle = spec.accentColor;
    ctx.fill();
    this.roundRect(ctx, -halfL + 10, -r - 2.5, 40, 3.8, 2);
    ctx.fillStyle = spec.clipColor;
    ctx.fill();
  }

  private drawHighlighter(
    ctx: CanvasRenderingContext2D,
    halfL: number,
    r: number,
    spec: PenBodyState['spec']
  ): void {
    // Chisel fluorescent tip
    ctx.beginPath();
    ctx.moveTo(halfL - 18, -r * 0.55);
    ctx.lineTo(halfL, -r * 0.25);
    ctx.lineTo(halfL, r * 0.5);
    ctx.lineTo(halfL - 18, r * 0.55);
    ctx.closePath();
    ctx.fillStyle = '#BEF264';
    ctx.fill();

    // Wide flat-body highlighter shell
    const grad = ctx.createLinearGradient(0, -r, 0, r);
    grad.addColorStop(0, '#D9F99D');
    grad.addColorStop(0.45, spec.primaryColor);
    grad.addColorStop(1, spec.secondaryColor);
    this.roundRect(ctx, -halfL, -r, spec.length - 16, r * 2, 7);
    ctx.fillStyle = grad;
    ctx.fill();

    // Dark grip collar & label block
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(halfL - 34, -r, 18, r * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
    this.roundRect(ctx, -halfL + 22, -r * 0.45, 46, r * 0.9, 3);
    ctx.fill();
  }

  private drawChunkyMarker(
    ctx: CanvasRenderingContext2D,
    halfL: number,
    r: number,
    spec: PenBodyState['spec']
  ): void {
    // Broad bullet felt tip
    ctx.beginPath();
    ctx.moveTo(halfL - 18, -r * 0.52);
    ctx.quadraticCurveTo(halfL + 3, 0, halfL - 18, r * 0.52);
    ctx.closePath();
    ctx.fillStyle = '#1E293B';
    ctx.fill();

    // Thick heavy white-and-crimson whiteboard marker body
    const bodyGrad = ctx.createLinearGradient(0, -r, 0, r);
    bodyGrad.addColorStop(0, '#FFFFFF');
    bodyGrad.addColorStop(0.55, '#E2E8F0');
    bodyGrad.addColorStop(1, '#94A3B8');
    this.roundRect(ctx, -halfL, -r, spec.length - 16, r * 2, 9);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Bold crimson cap collar & stripe
    const capGrad = ctx.createLinearGradient(0, -r, 0, r);
    capGrad.addColorStop(0, '#FB7185');
    capGrad.addColorStop(0.6, spec.primaryColor);
    capGrad.addColorStop(1, spec.secondaryColor);
    this.roundRect(ctx, halfL - 44, -r, 28, r * 2, 5);
    ctx.fillStyle = capGrad;
    ctx.fill();
    this.roundRect(ctx, -halfL, -r, 18, r * 2, 6);
    ctx.fillStyle = capGrad;
    ctx.fill();
    ctx.fillStyle = spec.primaryColor;
    ctx.fillRect(-halfL + 28, -4.5, 40, 9);
  }

  private drawVortexSpinner(
    ctx: CanvasRenderingContext2D,
    halfL: number,
    r: number,
    spec: PenBodyState['spec']
  ): void {
    // Symmetrical double-weighted pen-spinning mod barrel
    const bodyGrad = ctx.createLinearGradient(0, -r, 0, r);
    bodyGrad.addColorStop(0, '#A78BFA');
    bodyGrad.addColorStop(0.5, spec.primaryColor);
    bodyGrad.addColorStop(1, spec.secondaryColor);
    this.roundRect(ctx, -halfL, -r, spec.length, r * 2, r);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Heavy chrome + cyan weighted end-caps on BOTH tips for whip torque look
    for (const side of [-1, 1]) {
      const capX = side === -1 ? -halfL : halfL - 22;
      this.roundRect(ctx, capX, -r * 1.12, 22, r * 2.24, 5);
      ctx.fillStyle = '#0F172A';
      ctx.fill();
      ctx.fillStyle = spec.accentColor;
      ctx.fillRect(side === -1 ? -halfL + 6 : halfL - 12, -r * 1.12, 5, r * 2.24);
      ctx.fillStyle = '#FACC15';
      ctx.fillRect(side === -1 ? -halfL + 15 : halfL - 20, -r * 1.12, 3, r * 2.24);
    }

    // Center vortex chevrons
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.lineTo(0, 0);
    ctx.lineTo(-6, 4);
    ctx.moveTo(6, -4);
    ctx.lineTo(0, 0);
    ctx.lineTo(6, 4);
    ctx.stroke();
  }

  private drawGoldFountain(
    ctx: CanvasRenderingContext2D,
    halfL: number,
    r: number,
    spec: PenBodyState['spec']
  ): void {
    // Engraved gold fountain nib
    ctx.beginPath();
    ctx.moveTo(halfL - 28, -r * 0.72);
    ctx.lineTo(halfL - 10, -r * 0.45);
    ctx.lineTo(halfL + 2, 0);
    ctx.lineTo(halfL - 10, r * 0.45);
    ctx.lineTo(halfL - 28, r * 0.72);
    ctx.closePath();
    const nibGrad = ctx.createLinearGradient(0, -r, 0, r);
    nibGrad.addColorStop(0, '#FEF08A');
    nibGrad.addColorStop(0.5, '#EAB308');
    nibGrad.addColorStop(1, '#A16207');
    ctx.fillStyle = nibGrad;
    ctx.fill();
    // Nib slit & breather hole
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(halfL - 12, 0);
    ctx.lineTo(halfL + 1, 0);
    ctx.stroke();

    // Lacquered obsidian & brushed gold luxury barrel
    const bodyGrad = ctx.createLinearGradient(0, -r, 0, r);
    bodyGrad.addColorStop(0, '#3F3F46');
    bodyGrad.addColorStop(0.5, '#18181B');
    bodyGrad.addColorStop(1, '#09090B');
    this.roundRect(ctx, -halfL, -r, spec.length - 25, r * 2, r * 0.9);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Brushed gold bands & crown clip
    ctx.fillStyle = nibGrad;
    ctx.fillRect(halfL - 36, -r, 9, r * 2);
    ctx.fillRect(-halfL + 28, -r, 6, r * 2);
    this.roundRect(ctx, -halfL, -r * 0.95, 11, r * 1.9, 5);
    ctx.fill();
    this.roundRect(ctx, -halfL + 10, -r - 3, 46, 4.5, 2.2);
    ctx.fill();
  }

  private drawAimIndicator(
    ctx: CanvasRenderingContext2D,
    aim: AimPreviewState,
    isTurbo: boolean
  ): void {
    const color = aim.cancelled
      ? '#94A3B8'
      : isTurbo
        ? '#FACC15'
        : aim.owner === 'p1'
          ? '#38BDF8'
          : '#F43F5E';

    ctx.save();

    // Grip anchor ring on pen spine
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(aim.gripX, aim.gripY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (aim.cancelled) {
      ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#CBD5E1';
      ctx.fillText('CANCEL', aim.gripX, aim.gripY - 14);
      ctx.restore();
      return;
    }

    const arrowLen = 36 + aim.normalizedPower * 110;
    const tipX = aim.gripX + Math.cos(aim.aimRadians) * arrowLen;
    const tipY = aim.gripY + Math.sin(aim.aimRadians) * arrowLen;

    // Dotted directional force trajectory
    ctx.strokeStyle = color;
    ctx.lineWidth = isTurbo ? 4.5 : 3.2;
    ctx.lineCap = 'round';
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.moveTo(aim.gripX, aim.gripY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrowhead
    const headLen = 12;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(
      tipX - headLen * Math.cos(aim.aimRadians - 0.45),
      tipY - headLen * Math.sin(aim.aimRadians - 0.45)
    );
    ctx.lineTo(
      tipX - headLen * Math.cos(aim.aimRadians + 0.45),
      tipY - headLen * Math.sin(aim.aimRadians + 0.45)
    );
    ctx.closePath();
    ctx.fill();

    // Curved spin direction arc if off-center grip creates torque
    if (aim.spinSign !== 0) {
      ctx.strokeStyle = isTurbo ? '#FEF08A' : '#FACC15';
      ctx.lineWidth = 2.5;
      const startA = aim.aimRadians - 0.6 * aim.spinSign;
      const endA = aim.aimRadians + 0.85 * aim.spinSign;
      ctx.beginPath();
      ctx.arc(aim.gripX, aim.gripY, 24, startA, endA, aim.spinSign < 0);
      ctx.stroke();
    }

    // Power % + shot type label positioned away from finger
    const pct = Math.round(aim.normalizedPower * 100);
    const labelX = aim.gripX - Math.cos(aim.aimRadians) * 30;
    const labelY = aim.gripY - Math.sin(aim.aimRadians) * 30;
    ctx.textAlign = 'center';
    ctx.font = '700 12px "JetBrains Mono", monospace';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(7, 11, 20, 0.9)';
    const tag = `${isTurbo ? 'TURBO ' : ''}${pct}% · ${aim.shotKind}`;
    ctx.strokeText(tag, labelX, labelY);
    ctx.fillStyle = color;
    ctx.fillText(tag, labelX, labelY);

    ctx.restore();
  }
}
