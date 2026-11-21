# PEN FIGHT ROYALE
## Development-Ready Blueprint v2.0 — Android + Offline PWA

**Status:** Proposed engineering baseline / ready to implement in gated phases<br>
**Date:** 21 November 2026<br>
**Source:** Revised from the uploaded *implementation_plan (1).md*. This version retains requested features and explicitly replaces unspecified or risky behavior with testable proposed defaults. Numerical values are initial tuning targets, not measured or verified balance outcomes.

---

## 0. Executive decision and release boundary

Build a portrait-first, offline-capable, single-device 2D arcade pen-fight game for Android (Capacitor) and web/PWA. The experience revolves around a two-body desk fight, one-thumb pull-back and release, impulse at the exact grip point, rotation, tactical ring-outs, and satisfying feedback. A match should ideally take ~20–60 seconds; treat this as a playtest goal rather than a guarantee.

**Ship in v1:**
- One-thumb direct-touch aiming, exact contact-point linear/angular impulse, robust 2D rigid-body collisions, turn resolution, ring-outs, draw rules.
- Solo Tournament vs AI with rank ladder, distinct AI difficulty and boss opponents.
- Local 2-player Pass & Play on the same phone, best of three rounds.
- Six visibly and physically distinct pens, unlock currency, capped upgrades, persisted player profile.
- Two desk arenas: School Oak Desk and Exam Slate Table. No arena hazards in v1 (a deliberate scope change).
- Impact SFX, sparks, hitstop, safe camera shake, ring-out slow motion, mute and reduced-motion support.
- Power Surge / Turbo Flick with transparent meter logic and capped bonus.
- Four *opt-in* rewarded placements: Second Chance Edge Save, Double Coins, Locked Pen Trial, Lucky Pencil Box. Plus tightly gated interstitials at transitions.
- Real Android build, actual device ad SDK integration, offline PWA, QA and Play Store release preparation.

**Not in v1:** Survival Rush, daily quests, Art Studio and Championship Mahogany arenas, dynamic eraser/ruler hazards, leaderboards, accounts/cloud sync, remote multiplayer, ads-in-game settings for ordinary players, and untested retention claims. These move to the post-launch roadmap. Any online advertising requires network access: offline gameplay remains accessible, but ads are unavailable offline.

**Non-goals:** Real money purchases, account login, online PvP, pay-to-win tuning, arbitrary forced ad views, global score synchronization, or client-side promises of cryptographically secure ad transactions.

## 1. Product goals and measurable release gates

| Goal | Proposed exit criterion | Measurement |
|---|---|---|
| Fun core loop | ≥70% of 15 external playtesters choose to play 3+ voluntary matches | Observed sessions, not ad-incentivized |
| Learnable controls | ≥80% execute aimed ram and angled spin independently after tutorial | 10-minute usability test |
| Fair physics | No tunneling, stuck bodies, NaNs or double KO rewards in 10,000 seeded simulations | Automated test harness |
| Performance | Typical frame target 60 FPS on test mid-range Android; no persistent frame budget violations | Real device trace; define device matrix |
| Persistence | 100/100 kill/restart cycles preserve valid wallet and inventory | Automated Android instrumentation |
| Rewards | No duplicate earned grants in repeated callback/restart tests | Ad state-machine tests |
| Offline | App launches and matches work after install with airplane mode on | Android + PWA regression |
| Stability | No release-blocking crashes, irreversible economy defects or control loss | Closed beta test |

Treat these as suggested engineering thresholds; adjust only with documented measurements. No unsupported projections of ad revenue or retention.

## 2. Game rules — authoritative specification

### 2.1 Match formats

- **Tournament:** 1 player vs AI. Best-of-three rounds: first to 2 round wins. A win advances to the next ladder opponent; a loss permits replay. Save the highest unlocked opponent, not just the currently selected one. Suggested 12 regular opponents across 4 ranks, followed by a boss in each rank; exact ladder count is configurable.
- **Pass & Play:** 2 humans share one device. Best-of-three rounds. First to 2 wins. Show a neutral **Pass phone to Player 2 / Ready** overlay between turns to prevent accidental shots; the active pen is visibly cyan (P1) or coral (P2). No online sync or ranked coins from farming this mode.
- **Round setup:** Two pens spawn at mirrored stable locations, with deterministic seed and no overlap. Starting shooter alternates by round and between rematches where possible.
- **Legal turn:** Only the active player may shoot, once. During AIMING, pointer-down on active pen or close hitbox, drag, release. No shot if pull magnitude below threshold; release below threshold cancels without consuming turn.
- **Simulation phase:** Ignore additional touches while physics bodies move. When both pens remain under linear/angular rest thresholds continuously for 0.5 seconds, hand turn over. Hard turn simulation timeout (proposed 10 seconds): damp residual velocities and resolve to rest, then switch turn. Log timeout for physics tuning.
- **KO:** A pen is knocked out only when its *entire physical footprint* has cleared a playable desk edge (capsule support test), not merely when its center crosses the edge. Freeze its competitive physics state and run a separate visual fall animation. The physically remaining pen wins the round.
- **Double KO:** If both become out within the same simulation resolution window (proposed 150 ms), **round draw**; replay that round with starting shooter swapped. No KO coins, crit farming or progress for a drawn round.
- **No KO:** Turns continue. To avoid endless loops, after 12 legal shots without a KO show **Sudden Death**: increase legal shot power cap gradually up to +15%, not a forced arbitrary victory. If 20 shots elapse, restart the round as a draw. These are configurable and must be playtested.
- **Pause, background and ad interruption:** Suspend physics consistently; no simulation elapsed time while app backgrounds or ad overlays are visible. Do not charge a lost turn.

### 2.2 Aim and impulse

Screen coordinates must be transformed to game world coordinates before calculating impulse. Touch hit area may exceed pen geometry for accessibility; physical grip location is clamped to the nearest point on the pen's longitudinal axis.

Definitions:
- `p_down`: touch-down world position; `p_up`: release position.
- `d = clampMagnitude(p_down - p_up, D_max)` slingshot vector.
- `g`: grip point projected onto the pen's spine; `r = g - centerOfMass`.
- `J = normalize(d) * J_max * ease(|d|/D_max) * pen.powerMult * turboMult` where `ease(t)=t^1.3` initially.
- `Δv = J / m`, `Δω = cross2D(r, J) / I`, with explicit spin caps to prevent numerical instability.
- Center grip: `r≈0` gives straight ram. Tip grip: `|r|` increases and rotates pen. Indicator previews **direction and approximate spin sign**, not guaranteed collision outcome.
- Suggested activation: minimum 8 device-independent pixels after viewport transform, maximum drag 120 pixels on reference viewport; always tune in **world units** for fair handling across devices.
- Keep physical impulse independent of render framerate and phone DPI.
- Add optional keyboard controls (desktop PWA): Left/Right aim; Up/Down power; Q/E grip offset; Space shoot; Escape pause.

### 2.3 Turbo Flick / Power Surge

- All pens begin a match with `surge=0`; meter is **per player**, not per pen inventory.
- Each legal collision created by the active player's shot can contribute at most **one** surge award. An eligible `WHIP CRIT!` requires a tip-region hit (outer 25% of target length), impulse above threshold, and angular velocity gain above threshold. Award **+35 surge points** to shooter; regular forceful hit +10. A legal shot may gain at most 35, preventing collision-jitter farming.
- At 100, meter shows **TURBO READY**. The player's next valid flick automatically consumes 100 and applies an initially proposed **+20% impulse**, rather than the original +35% knockback. This is an explicit balance revision; restore +35% only if competitive tests show fair outcomes. Gold trail and sound are cosmetic.
- Turbo is available equally to P1/P2 and AI with the same rules. AI does not receive free meter charges. In Pass & Play, display surge per side.
- An unspent meter carries between rounds of a match, resets on a new match. No ads can grant surge.
- Count once per shot and once per tagged collision event; never reward from passive settling, spawned animation or repeated physics contacts.

## 3. Physics engine and architecture decision

**Recommendation:** Prototype with a maintained, tested 2D rigid-body solver (e.g., Matter.js) using convex capsule approximation (rectangle plus rounded ends or an appropriate compound body). Do not commit to a fully bespoke 8-substep engine until automated tests reveal a blocker. Exact capsule/collision fidelity can be upgraded behind `PhysicsAdapter` without rewriting the game.

- Simulation: fixed time step **1/120 s**; render via requestAnimationFrame and interpolation. Max 6 physics steps per render tick, with clamped accumulated time on app resume. Baseline 120 Hz is a proposed tuning target; lower devices may use 60 Hz if collision tests still pass.
- Game-space desk, pen transforms and impulses are independent of canvas resolution. `devicePixelRatio` changes drawing only.
- Continuous/high-speed safety: test swept or speculative collision handling; cap peak velocities, use additional substeps on strong shots or shape-casts if solver cannot prevent tunneling.
- Body properties: mass, inertia, restitution, dynamic friction, linear damping, angular damping, collider length/width. Avoid modifying mass mid-match.
- Every collision event carries a unique `shotId`, pair ids, contact point, normal and magnitude; aggregate critical-hit logic per shot.
- Desk edge is a gameplay boundary predicate, **not a wall**. Outer void simply allows bodies to exit. Ring-out tested against body footprint.
- Collision solver must never read UI/ads/persistence or frame-dependent visual hitstop values.
- Use deterministic seeded randomness for spawn, AI error, decorative particle randomness; physics determinism across machines is desirable but not guaranteed by a JS engine: enforce repeatability on pinned build/device simulation, and use tolerance-based assertions.

### 3.1 Required physics automated tests

| ID | Setup | Expected result |
|---|---|---|
| PHY-01 | Center impulse on isolated pen | Linear motion; angular gain near zero |
| PHY-02 | Equal tip impulses mirrored | Opposite spin direction; comparable magnitude |
| PHY-03 | Head-on pair collision | Finite velocity/rotation; no lasting overlap |
| PHY-04 | Tip-to-body glancing hit | Visible torque transfer, stable separation |
| PHY-05 | Max power turbo hit | No tunneling, no NaN, no infinite speed |
| PHY-06 | 10k seeded randomized shots | Zero missing body removals, double score, or permanent overlap |
| PHY-07 | 30/60/90/120 FPS rendering | Equivalent match outcome and close motion tolerances |
| PHY-08 | Pause/resume and 10s background | No physics time warp or free shot |
| PHY-09 | Entire capsule clears edge | Exactly one ring-out; correct player awarded |
| PHY-10 | Center across edge; tail still on desk | No premature KO |
| PHY-11 | Both exit within draw window | Replay round, no currency and no win counted |
| PHY-12 | Contact jitter across 40 simulation ticks | At most one crit/surge gain per legal shot |
| PHY-13 | Pen at corner, spinning in place | Eventually sleeps or resolves with timeout |
| PHY-14 | Different body mass & inertia | Qualitatively expected knockback and rotation; stable |
| PHY-15 | Resize viewport during aim | No changed impulse due solely to DPI/size |

Acceptance: all deterministic test fixtures green on every PR; 10,000-seed test on nightly CI. Record seed and inputs for any failed test and make replayable.

## 4. Playable arenas and geometry

**School Oak Desk** (starter): warm oak `#7C4D2B` / `#5C361C`, predictable friction baseline `1.00`, no obstacle. **Exam Slate Table** (unlock after Rank 2): slate `#1E293B`, relative friction `0.90` (initial tune; arena changes apply to both players equally). Uniform normalized active play rectangle so screen geometry cannot grant an advantage. Keep visual desk perspective optional; physics top-down 2D.

Use a centered logical coordinate system independent of portrait aspect ratio. On taller/wider screens letterbox the outer margins or expose decorative area without modifying desk dimensions. ≥85% unobstructed area is a design aspiration measured on reference device, not a guarantee for all accessibility font sizes.

No eraser or ruler bumpers in v1: they were in the original design and are explicitly deferred as untested complexity.

## 5. Six pen specifications and balance model

All pens must be visibly different **in arena**, not only named differently in Locker. Shared pivot and collider alignment is mandatory. Initial physics are normalized relative factors; numbers are prototypes to tune in automated self-play and human tests.

| Pen | Unlock coins | Mass | Power | Spin | Grip (damping) | Identity |
|---|---:|---:|---:|---:|---:|---|
| Classic Ballpoint | Free | 1.00 | 1.00 | 1.00 | 1.00 | All-rounder, blue transparent barrel |
| Hyper Gel Pro | 300 | 0.85 | 1.07 | 1.08 | 0.95 | Sleek speed striker |
| Neon Highlighter | 550 | 1.12 | 0.90 | 0.88 | 1.14 | Wide defensive body |
| Chunky Marker | 850 | 1.30 | 0.93 | 0.83 | 1.08 | Heavy sweeper |
| Vortex Spinner | 1,200 | 0.90 | 0.97 | 1.30 | 0.91 | Whip-turn specialist |
| Gold Fountain | 1,800 | 1.22 | 1.04 | 0.95 | 1.07 | Heavy premium collector pen |

`Grip` indicates relative slide/angular damping, not adhesion to desk or immunity to being knocked out. `Power` scales applied impulse; `Spin` scales grip torque within capped bounds. Render all with distinguishable silhouette, barrel color, clipping, metal nib, shading and shadow.

**Upgrades:** To avoid pay-to-win and runaway mass advantage, ship **cosmetic-only coin unlocks** and at most **one small physics upgrade track** in Tournament, capped at +5% per pen and disabled in Pass & Play. The original plan proposed Weight/Power/Grip upgrades; those are deferred to balancing follow-up or may instead be cosmetic mastery badges. If preserving multi-stat upgrades is mandatory later, simulate matchups and enforce an overall stat budget. Winning should remain skill-dependent.

**Balance gates:** Each pen vs each pen in 1,000 seeded AI mirror matches, with first-player alternation. Aim for 45–55% win rates for matched-skill AI; investigate any pair outside 40–60%. Human testers should rate each pen as distinct without consistently feeling predetermined results. These are investigation thresholds, not statistical proof of perfect balance.

## 6. Tournament and opponent AI

AI uses the same public shot API and physics limits as a person; no teleports, secret impulses or nonphysical collision overrides. Seeded decision process:
1. Enumerate 15–40 candidate grip offsets/powers/angles toward opponent's predicted position and nearest desk edge.
2. Run cheap short-horizon simulations or heuristic ranking, choosing max expected ring-out pressure and minimizing self-ring-out risk.
3. Add difficulty-specific aim error and power variance; higher ranks evaluate more candidates, not inherently stronger shots.
4. Commit one legal shot via `submitFlick` after a visible 0.4–1.0s think animation; cap AI work so UI remains responsive.

Difficulty initial settings: Rookie: 15 candidates, angle ±12°, power ±15%; Intermediate: 25 candidates ±7°/±9%; Expert: 40 candidates ±3°/±5%; Boss: 40 candidates with better edge heuristics, not higher physical stats. Calibrate simulation cost before accepting these values. Difficulty rank and boss pen appearance are content-driven configuration rather than hardcoded branches.

AI must obey Turbo rules and full rest requirements. Tournament progression saves after award transaction commits.

## 7. Economy, progression and persistence

### 7.1 Initial economy assumptions

Proposed match payouts (Tournament only): win **60 coins**, loss **20 coins**, +10 one-shot KO bonus, +5 for first qualifying crit per match (one-time). No coins for match abort, draw, or Pass & Play. All rewards shown as a deterministic pre-ad ledger. `2x Coins` doubles only the base payout and bonuses **once** after a rewarded event is verified locally; never stack multiple multipliers. Example: 60 base + 10 KO + 5 crit = 75, rewarded -> 150.

Starting balance: 0. Prices above yield 5 wins for Gel Pro, then additional progression. Testing should validate that the sixth pen doesn't require a tedious grind; if necessary lower prices or introduce rank milestone grants (not unearned scarcity). Rewarded coin chest: **+100**, max **2 per calendar day** based on a locally recorded day with clock-change safeguards; since purely offline currency is not tamper-proof, avoid treating this as a secure economy.

### 7.2 Persistence model

Keep a **versioned profile** (`schemaVersion=1`) via IndexedDB with a `localStorage` fallback for lightweight preferences; use transaction-like writes and retain a last-known-good snapshot. Capacitor Android should consider appropriate app data storage/backups. Do not promise cloud recovery or security from tampering. Schema:

```ts
type ProfileV1 = {
  schemaVersion: 1;
  revision: number;
  coins: number;
  unlockedPens: string[];
  equippedPenId: string;
  penMastery: Record<string, number>;
  unlockedDeskIds: string[];
  equippedDeskId: string;
  highestTournamentOpponent: number;
  tournamentWins: number;
  totalKOs: number;
  bestWinStreak: number;
  claimedRewardIds: string[]; // bounded rolling history, persist atomic grants
  pendingReward?: { id: string; kind: string; contextId: string };
  matchesSinceInterstitial: number;
  muted: boolean;
  reducedMotion: boolean;
  localChestDay: string;
  localChestCount: number;
};
```

- Every currency grant has `transactionId`; mutate wallet and claimed ids atomically and prevent re-grant on retry.
- Validate loaded data: reject negative/NaN coins, unknown pen IDs, invalid inventory; recover last good snapshot and show a nontechnical warning.
- Initialize only missing defaults, never reset progression on minor updates.
- Reopen app after process kill after any award, during save, at an ad return, and after an upgrade/migration.
- Reset data is explicit and requires confirmation. Explain saves are device-local; uninstall or browser storage clearing may erase progress.

## 8. AdMob architecture, optional rewards and fair monetization

### 8.1 Product principles

All rewarded placements are **user-initiated**; if unavailable or offline, label them unavailable without blocking normal play. Never simulate a real ad completion as a granted production reward. The browser ad preview is a **developer/test-only simulator**, not a real advertiser impression and not a substitute for native SDK QA.

| Placement | Location & offer | Caps / safeguards |
|---|---|---|
| Edge Save | On Tournament KO, show `Watch Ad · Second Chance` or `Accept Defeat` | Once per match; disabled Pass & Play; reset into a fair neutral state, not a damaging shockwave |
| Double Coins | Post-match rewards: `Watch Ad · Double Match Coins` | Once per completed Tournament match; double only finalized reward ledger |
| Legendary Pen Trial | Locker on a locked pen: `Watch Ad · Try for 1 Match` | One next Tournament match; grant trial after confirmed reward; no permanent ownership |
| Lucky Pencil Box | Locker: `Watch Ad · +100 Coins` | Max 2 per local day; no deceptive random-chance framing |
| Interstitial | Natural between-match transition only | Earliest after 3 completed matches, skip if rewarded watched in same match; cool down ≥5 minutes, never first session's first match or during aim |

**Revised Edge Save:** When player is KO'd, freeze the final round state; user may opt for reward. On successful reward, replay the round from a symmetric starting setup, retaining score but **not** preserving damaging changes to opponent. Mark `revivedThisMatch=true`. If reward fails or is declined, resolve original KO. This replaces the originally proposed unfair radial pushback wave.

### 8.2 Rewarded state machine

`IDLE → LOADING → READY → SHOWING → {EARNED, DISMISSED_UNEARNED, FAILED}`. Treat `EARNED` as an event independent of `DISMISSED`, because mediation event ordering can vary. Generate `rewardRequestId` when button pressed; persist pending intent before showing; reconcile callback exactly once on resume. Only the SDK's earned-reward event/result may grant a reward, never mere dismissal. A missed event must not be guessed as a success. Log recoverable failures and offer normal gameplay.

For a no-backend offline game, reward checks and wallet integrity are **best effort**; they are not anti-fraud secure. If economy abuse becomes consequential, add a server and AdMob server-side verification in a later release. No claim that local persistence provides verified advertiser payouts.

Use test ad units and register test devices before production. Avoid real ads during development and automated tests. Native plugin compatibility must be pinned to the chosen Capacitor major version and confirmed before implementation. Require privacy consent flows and accurate data disclosures appropriate to configured SDKs and region.

### 8.3 Interstitial behavior

Eligible only when: `completedMatchesSinceInterstitial >= 3`, ≥5min since prior interstitial, ad preloaded, no rewarded ad in the just-completed match, and user clicked **Next Match**. Never interrupt an ongoing round; always allow gameplay if ad fails. This is an initial fatigue-limiting heuristic and should be adapted to user feedback and current ad policies.

## 9. Game shell, render/audio/UI

State machine:

```
BOOT -> MENU -> MODE_SELECT -> MATCH_SETUP -> AIMING
AIMING -> SIMULATING -> (KO_VISUAL -> ROUND_RESULT | TURN_HANDOFF -> AIMING)
ROUND_RESULT -> (SECOND_CHANCE? -> AIMING/ROUND_RESULT | MATCH_RESULT | MATCH_SETUP)
MATCH_RESULT -> REWARD_SETTLEMENT -> MENU / NEXT_MATCH
MENU -> LOCKER -> MENU
ANY_ACTIVE_STATE -> PAUSED -> PREVIOUS_STATE
```

Implement guard conditions on transitions. `SECOND_CHANCE` only on eligible Tournament loss. AI `THINKING` phase only when it is AI's turn. Every state change logged in dev builds.

Rendering: HTML Canvas 2D for active desk and pens, UI overlay in accessible HTML; no `backdrop-filter` above active canvas. Retina drawing via DPR; scale world transforms independently. Portrait 9:16 ideal with safe-area insets, varied aspect ratios and minimum touch target. Keep menu attractive but prioritize arena readability.

Visual theme from original: Deep Slate `#0B1120`, oak `#7C4D2B`/`#5C361C`, slate panel `#1E293B`, cyan `#38BDF8` (P1), coral `#F43F5E` (P2/AI), gold `#FACC15` (turbo/coins), emerald `#10B981` (win/reward). Fonts: Outfit, Plus Jakarta Sans and JetBrains Mono with fallbacks and license-compliant assets.

Audio: synthesize or bundle short licensed plastic clacks, scrapes, crit chime, KO whistle, gold coin sound; unlock Web Audio on user gesture and handle mute and interrupted audio context. Heavy collisions may use **40–60ms visual hitstop only** (do not skip physics steps) and capped camera shake. KO cinematic at 0.25x *presentation* speed; authoritative simulation has already resolved. Reduced-motion replaces shake and prolonged slow motion with brief fades. Avoid bright flashes with rapid repetition.

## 10. Proposed repository structure

```
pen-fight-royale/
  apps/
    game/                    # Vite, TypeScript, web/PWA shell
      src/
        app/                 # navigation, game state machine, config
        game/
          physics/           # PhysicsAdapter, shapes, fixed clock
          controls/          # TouchFlickController, keyboard
          match/             # RoundRules, TurnController, KO detection
          ai/                # deterministic candidate selection
          content/           # pen catalog, desk catalog, ladder
          economy/           # reward ledger, unlocks, balance checks
          ads/               # AdService interface, native adapter, mock
          persistence/       # versioned profile store, migrations
          audio/             # clacks, synth, mute
          render/            # Canvas renderer, camera, VFX
          ui/                # accessible HUD, menu, locker, modals
        public/              # icons, manifest, audio/assets
      capacitor.config.ts
      vite.config.ts
      package.json
    android/                 # generated/native Gradle project, under version control
  packages/
    core/                    # pure game rules/types and replayable simulation
  tests/
    physics/                 # seeded collision, golden fixtures
    game/                    # turns, tournament, turbo, AI
    economy/                 # grants, restores, migrations
    e2e/                     # Android tests, PWA offline tests
  scripts/
    generate-test-replays.ts
    run-seeded-physics.ts
  docs/
    DESIGN.md
    BALANCE.md
    QA_MATRIX.md
    RELEASE_CHECKLIST.md
    ADRs/
  .github/workflows/ci.yml
```

Dependencies to evaluate/pin: TypeScript + Vite + Canvas 2D, a supported physics engine (candidate Matter.js), finite-state-machine library or typed reducer, IndexedDB wrapper, Vitest, Playwright, Capacitor, `@capacitor-community/admob`, `vite-plugin-pwa`. Check version compatibility and supported Android Gradle/SDK matrix before locking the dependency versions; avoid blindly adopting `latest`.

### 10.1 Module contracts

```ts
interface FlickCommand {
  shotId: string; playerId: 'p1' | 'p2' | 'ai';
  gripOffset01: number; // -1 back tip, 0 center, +1 front tip
  aimRadians: number;
  normalizedPower: number; // 0..1
}
interface PhysicsAdapter {
  initializeRound(seed: number, penA: PenSpec, penB: PenSpec, desk: DeskSpec): void;
  submitFlick(command: FlickCommand, turboMult: number): void;
  stepFixed(dtSeconds: number): PhysicsEvent[];
  snapshot(): PhysicsSnapshot;
}
interface AdService {
  isAvailable(kind: RewardPlacement): Promise<boolean>;
  showRewarded(request: RewardIntent): Promise<'earned'|'unearned'|'failed'>;
  showInterstitial(): Promise<'shown'|'skipped'|'failed'>;
}
interface ProfileRepository {
  load(): Promise<ProfileV1>;
  commit(expectedRevision: number, mutation: ProfileMutation): Promise<ProfileV1>;
}
```

No UI component may directly mutate coins, score, or physics state. Commands go through services and authoritative reducers.

## 11. QA plan and release testing matrix

**Automated each PR:** TypeScript typecheck, lint, unit tests for rules and economy, 30 deterministic physics fixtures, smoke PWA bundle build. **Nightly:** 10k seeded collision fuzz, 500 AI self-play games, Android debug installation/e2e smoke, screenshot smoke across portrait device widths. **Weekly on devices:** real touch latency, suspend/resume, audio interruption, memory, and battery/performance checks.

Device plan: one Android low-end device (4 GB RAM), one mid-range device (6–8 GB), one high-end reference; Android versions representing minimum supported SDK through current SDK; 60/90/120Hz display where available. Also desktop Chrome/Firefox for PWA and a modern Android browser. Confirm minimum Android version after selecting compatible Capacitor/SDK versions.

| QA area | Essential cases |
|---|---|
| Controls | Touch outside pen, two-finger input, lost pointer capture, canceled touch, rotating device, tapping modal, safe areas |
| Tournament | Win/loss, boss, rematch, offline, score reset, relaunch between rounds |
| Pass & Play | Turn handoff, P1/P2 visual clarity, accidental double taps, tied round, no rewarded revive |
| AI | Same limits as player, collision with edge, thinks without freezing, no impossible shots |
| Turbo | Single award per shot, meter carries rounds only, consumed once, same rules both sides |
| Economy | Negative balance prevented, insufficient funds, duplicate purchase, concurrent save, corrupted save |
| Ads | No-fill, cancel, network loss, pause/resume, duplicate earned event, earned vs dismissed order, app killed after callback |
| Audio/VFX | Mute after relaunch, autoplay restrictions, reduced motion, shake does not displace input |
| Offline | Fresh installed assets cached, turn off network, coins persist, no ad blocks gameplay |
| Android | Min/target SDK, app back button, AAB, permission prompts, screen densities, app signing, Play prelaunch |

**Blocker thresholds:** Any infinite/frozen match, physically impossible overlap/tunneling in normal max-power matches, coin duplication from one rewarded event, destroyed save, false KO, unresponsive controls, or missing consent/data disclosures blocks release.

## 12. Phased execution plan and milestones

### Phase 0 — Repository, compatibility and design freeze
- Set up TypeScript/Vite, CI, world-coordinate units, content config and data schemas.
- Select physics adapter based on small benchmark; verify Capacitor and AdMob plugin majors can work together.
- Define Android minimum SDK, target SDK, app identifier and asset licenses.
- **Gate:** builds and tests run; preview renders one pen and desk; architecture decisions recorded.

### Phase 1 — Core physics vertical slice
- 2 pens, School Oak Desk, direct touch flick, aim/torque preview, authoritative KO, pause/turns, fixed timestep.
- Physics fixtures PHY-01–15 and seeded replay tool.
- **Gate:** stable 10k shots with no blocker; 10-minute human controls validation.

### Phase 2 — Real playable match and AI
- Best-of-three round state machine, Pass & Play handoff, AI difficulty and Tournament ladder.
- Multi-rank content config, CPU budget measurements.
- **Gate:** 20 complete AI matches + 20 Pass & Play matches on actual devices, zero soft-locks.

### Phase 3 — Collection, economy and two arenas
- Six unique pen visuals/colliders, two desk skins and friction configurations, coin ledger, unlocks, profile migrations, backups.
- Matchup self-play matrix and save-kill recovery tests.
- **Gate:** all progression paths reachable and no exploit yielding negative/multiple grant balances.

### Phase 4 — Turbo and audiovisual polish
- Surge meter, crit arbitration, turbo consumption, sparks, clacks, KO slowmo, accessibility toggle.
- Compare turbo 1.00/1.15/1.20/1.35 in tournament and PVP tests before final multiplier.
- **Gate:** Turbo counters do not double count; players perceive both modes as fair.

### Phase 5 — AdMob native and PWA/offline
- Native AdService and test-unit integration, opt-in reward UI, full 4-placement test, interstitial gate, consent UX; PWA precache and install UI.
- Use web mock only in development. Test all native error callbacks and resume cases.
- **Gate:** no duplicate rewards in 100 repeated callback scenarios; offline game works without ad calls.

### Phase 6 — Beta and production
- Signed Android AAB, Play Console listing and declarations, QA pass, closed test as required by account, final APK/AAB prelaunch checks.
- Build release with real IDs only after test-unit verification; verify real ads in permitted production or approved test setup.
- **Gate:** publishing checklist complete, production access permitted, tester feedback addressed, no blockers.

## 13. Android/PWA publishing checklist — verified policy snapshot (Nov 2026)

**Current official requirements to recheck immediately before submission:**
- Google Play **new Android phone/tablet apps and updates target API 36 or higher** (Android 16) at time of this blueprint. Official: https://support.google.com/googleplay/android-developer/answer/11926878
- Eligible new **personal developer accounts created after Nov 13, 2023** need a closed test with **at least 12 opted-in testers continuously for at least 14 days** before applying for production access. Official: https://support.google.com/googleplay/android-developer/answer/14151465
- Google AdMob reward policies require affirmative opt-in for standard rewarded ads and accurate up-front representation of reward. https://support.google.com/admob/answer/7313578
- Capacitor community AdMob plugin must match Capacitor major/version and native SDK; verify current docs before install: https://github.com/capacitor-community/admob
- Grant rewards only from the SDK earned reward event/result, not dismissed callback: https://github.com/capacitor-community/admob/blob/main/docs/rewarded.md

**Publishing steps:**
1. Choose unique application ID (the original proposed `com.penfightroyale.app` is a placeholder until package availability/ownership checks), version code and display name; check trademark and Play listing conflicts.
2. Pin supported Capacitor, Android Gradle, JDK and SDK tooling; set target 36 or newer, test full edge-to-edge and screen inset behavior.
3. Create release signing key securely and enroll Play App Signing; produce signed `.aab`; keep signing materials out of source control.
4. Use native test ads during QA, production IDs only for release; configure AdMob app ID metadata and applicable user messaging/privacy consent. Publish privacy policy and accurate Play Data Safety and ad declarations based on actual SDK behavior.
5. Supply compliant icon, screenshots, feature graphic, content rating, target audience questionnaire and store description without unsupported claims.
6. Create internal testing, then closed testing if applicable; recruit real opted-in testers. Collect device logs, feedback and crash reporting while respecting user privacy.
7. Run Play pre-launch reports and manual offline/online QA. Confirm release build—not just debug—launches, saves and handles all ad failure cases.
8. Request production access if applicable, review policy feedback and publish via staged rollout. Have a rollback/hotfix plan.
9. PWA: configure `vite-plugin-pwa`, installable manifest, 192/512/maskable icons, service worker offline assets and update lifecycle; warn that browser-cleared data may delete saves. Web version never promises native AdMob ads.

## 14. Launch metrics and ethical instrumentation

Optional, privacy-respecting analytics are **not** required to play. If included, collect minimal aggregate events with transparent disclosure: tutorial complete, shot type, shot outcome, match complete, pen equipped, voluntarily selected ad, reward earned, ad error, crash. Avoid collecting names, precise location, contacts, or persistent advertising identifiers unless genuinely needed and disclosed. Offline local counters can inform manual beta sessions without adding cloud accounts.

Watch: tutorial completion; matches/player; voluntary replay; time to first satisfying KO; win rates by pen/mode; frequency of false input/canceled drag; ad opt-in and failed reward attempts; stability by device. Do not optimize only for ad impressions or claim retention numbers until observed.

## 15. Post-launch roadmap (not prerequisites for v1)

- **v1.1:** Survival Rush with sequential opponent waves, personal bests; optional daily quests once reward economy is stable.
- **v1.2:** Art Studio and Championship Mahogany arenas; eraser/ruler obstacles behind independent physics tests and AI support.
- **v1.3:** Pen mastery cosmetics, new visual trails, optional ranked variants; re-evaluate Weight/Power/Grip multi-stat upgrade balance.
- **v2.0 candidate:** cloud backup, online multiplayer and fair competition only after auth, authoritative netcode, anti-cheat and privacy design; global leaderboard requires trustworthy scores, not client-local records.

## 16. Explicit decisions and open validation items

1. **Fixed physics adapter**: Matter.js is a recommended starting candidate, not a proven capsule solution. Benchmark compound shapes first.
2. **Turbo multiplier**: original +35% knockback is retained as a candidate to test, but provisional shipped default is +20% impulse for fairness.
3. **Upgrades**: original Weight/Power/Grip upgrades are not fully specified, so v1 substitutes cosmetic unlocks and only an optional tightly capped Tournament mastery boost; no stat advantages in Pass & Play.
4. **Revive**: replaces damaging pushback with replay of lost round from neutral initial conditions.
5. **Hazards**: moved out of first release to prioritize stability, while preserving both chosen arenas.
6. **Lucky chest**: original calls it a coin chest awarding +100, so present as a guaranteed +100; don't advertise randomness without actual probability disclosure.
7. **Game privacy and ads**: online ad delivery is optional; offline use stays playable; local rewards are not fraud-proof.
8. **Testing thresholds and economy numbers** are tunable hypotheses, never represented as proven business projections.

---

### Final definition of done

**Pen Fight Royale v1 is done when:** a new player can install on Android, learn flick mechanics within minutes, complete fair 1v1 matches against AI or a friend, see all six pens change visually and physically, unlock them with legitimately earned saved coins, use Turbo Flick under transparent rules, play completely offline without ads, optionally elect any of four working native rewarded placements when online, and finish 10,000 regression simulations plus real-device release QA without launch-blocking defects.
