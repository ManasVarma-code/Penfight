import fs from 'node:fs';
import { adService } from '../src/game/ads/adService.ts';
import { DESKS, FIXED_DT, PENS } from '../src/game/content.ts';
import { profileRepo } from '../src/game/persistence.ts';
import { MatterPhysicsAdapter } from '../src/game/physics/matterAdapter.ts';

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`PASS: ${label}`);
  } else {
    failed++;
    console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function run(): Promise<void> {
  // 1. Physics Tests (PHY-01, PHY-02, PHY-05/06, PHY-09)
  const physics = new MatterPhysicsAdapter();

  physics.initializeRound(42, PENS[0], PENS[0], 'ai', DESKS[0]);
  physics.submitFlick(
    { shotId: 's1', playerId: 'p1', gripOffset01: 0, aimRadians: -Math.PI / 2, normalizedPower: 0.8 },
    1.0
  );
  physics.stepFixed(FIXED_DT);
  const p1Center = physics.snapshot().p1;
  assert(
    p1Center.vy < -500 && Math.abs(p1Center.omega) < 0.05,
    'PHY-01 Center ram yields linear motion and near-zero spin',
    `vy=${p1Center.vy.toFixed(1)}, omega=${p1Center.omega.toFixed(3)}`
  );

  physics.initializeRound(42, PENS[0], PENS[0], 'ai', DESKS[0]);
  physics.submitFlick(
    { shotId: 's2', playerId: 'p1', gripOffset01: 0.9, aimRadians: -Math.PI / 2, normalizedPower: 0.8 },
    1.0
  );
  physics.stepFixed(FIXED_DT);
  const omegaPos = physics.snapshot().p1.omega;

  physics.initializeRound(42, PENS[0], PENS[0], 'ai', DESKS[0]);
  physics.submitFlick(
    { shotId: 's3', playerId: 'p1', gripOffset01: -0.9, aimRadians: -Math.PI / 2, normalizedPower: 0.8 },
    1.0
  );
  physics.stepFixed(FIXED_DT);
  const omegaNeg = physics.snapshot().p1.omega;
  assert(
    omegaPos * omegaNeg < 0 && Math.abs(Math.abs(omegaPos) - Math.abs(omegaNeg)) < 0.5,
    'PHY-02 Mirrored tip flicks produce equal and opposite spin',
    `omegaPos=${omegaPos.toFixed(2)}, omegaNeg=${omegaNeg.toFixed(2)}`
  );

  let nanCount = 0;
  let collisions = 0;
  let ringOuts = 0;
  for (let i = 0; i < 40; i++) {
    physics.initializeRound(
      200 + i,
      PENS[i % PENS.length],
      PENS[(i + 1) % PENS.length],
      'ai',
      DESKS[i % DESKS.length]
    );
    const s0 = physics.snapshot();
    const aim = Math.atan2(s0.p2.y - s0.p1.y, s0.p2.x - s0.p1.x) + ((i % 5) - 2) * 0.07;
    physics.submitFlick(
      { shotId: `stress_${i}`, playerId: 'p1', gripOffset01: ((i % 3) - 1) * 0.5, aimRadians: aim, normalizedPower: 0.96 },
      1.2
    );
    for (let step = 0; step < 240; step++) {
      const evs = physics.stepFixed(FIXED_DT);
      for (const e of evs) {
        if (e.type === 'collision' || e.type === 'whip_crit') collisions++;
        if (e.type === 'ring_out') ringOuts++;
      }
      const s = physics.snapshot();
      if (!Number.isFinite(s.p1.x) || !Number.isFinite(s.p2.x) || !Number.isFinite(s.p1.omega)) {
        nanCount++;
      }
    }
  }
  assert(
    nanCount === 0 && collisions > 20 && ringOuts > 0,
    'PHY-05/06/09 Stress test produces collisions and ring-outs with zero NaNs',
    `nanCount=${nanCount}, collisions=${collisions}, ringOuts=${ringOuts}`
  );

  // 2. Atomic Reward Deduplication & Economy Integrity
  profileRepo.resetAll();
  const txId = 'reward_tx_test_001';
  const firstGrant = profileRepo.grantCoinsAtomic(txId, 100);
  const dupGrant = profileRepo.grantCoinsAtomic(txId, 100);
  const invalidGrant = profileRepo.grantCoinsAtomic('neg_tx', -50);
  assert(
    firstGrant && !dupGrant && !invalidGrant && profileRepo.get().coins === 100,
    'Economy atomic transaction prevents duplicate and negative coin grants',
    `coins=${profileRepo.get().coins}`
  );

  // 3. AdMob Smart Interstitial Gating & Rewarded State Machine
  profileRepo.commit((d) => {
    d.matchesSinceInterstitial = 2;
    d.lastInterstitialAt = 0;
  });
  assert(
    !adService.canShowSmartInterstitial(false),
    'Interstitial blocked before 3 completed matches'
  );
  profileRepo.commit((d) => {
    d.matchesSinceInterstitial = 3;
  });
  assert(
    adService.canShowSmartInterstitial(false),
    'Interstitial allowed after 3 completed matches when no rewarded ad watched'
  );
  assert(
    !adService.canShowSmartInterstitial(true),
    'Interstitial skipped if player watched a rewarded ad in the same match'
  );

  // Verify web rewarded state machine honors earned vs early dismiss vs failure
  const previewHolder: { current: { resolve: (o: 'earned' | 'unearned' | 'shown' | 'failed') => void } | null } = {
    current: null,
  };
  const unsub = adService.subscribePreview((ad) => {
    previewHolder.current = ad;
  });

  const earnedPromise = adService.showRewarded({
    rewardRequestId: 'req_earned_1',
    placement: 'coin_chest',
    contextId: 'test',
    label: 'Test Earned',
    rewardSummary: '+100',
  });
  await new Promise((r) => setTimeout(r, 15));
  previewHolder.current?.resolve('earned');
  const earnedRes = await earnedPromise;
  assert(earnedRes === 'earned', 'Rewarded state machine resolves EARNED on verified callback');

  const unearnedPromise = adService.showRewarded({
    rewardRequestId: 'req_unearned_1',
    placement: 'edge_save',
    contextId: 'test',
    label: 'Test Early Dismiss',
    rewardSummary: 'Revive',
  });
  await new Promise((r) => setTimeout(r, 15));
  previewHolder.current?.resolve('unearned');
  const unearnedRes = await unearnedPromise;
  assert(
    unearnedRes === 'unearned',
    'Rewarded state machine resolves UNEARNED on early dismiss (no reward granted)'
  );
  unsub();

  // 4. Dev vs. Production Environment & Android Manifest Verification
  const devEnv = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
  const prodTemplate = fs.existsSync('.env.production.example')
    ? fs.readFileSync('.env.production.example', 'utf8')
    : '';
  assert(
    devEnv.includes('3940256099942544') && devEnv.includes('VITE_ADMOB_TEST_MODE="true"'),
    'Development .env uses official Google test IDs with VITE_ADMOB_TEST_MODE=true'
  );
  assert(
    prodTemplate.includes('VITE_ADMOB_TEST_MODE="false"') &&
      prodTemplate.includes('VITE_SHOW_PUBLISHER_CONSOLE="false"'),
    'Production env template disables test mode and publisher console'
  );

  const manifestPath = 'android/app/src/main/AndroidManifest.xml';
  if (fs.existsSync(manifestPath)) {
    const manifest = fs.readFileSync(manifestPath, 'utf8');
    assert(
      manifest.includes('com.google.android.gms.ads.APPLICATION_ID') &&
        manifest.includes('com.google.android.gms.permission.AD_ID') &&
        manifest.includes('android.permission.ACCESS_NETWORK_STATE'),
      'AndroidManifest.xml declares AdMob APPLICATION_ID meta-data and required permissions'
    );
  } else {
    assert(false, 'AndroidManifest.xml exists in generated android/ project');
  }

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void run();
