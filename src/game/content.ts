import { DeskSpec, OpponentSpec, PenSpec } from './types';

// Normalized logical world units (9:16 portrait baseline, independent of DPI)
export const WORLD_W = 420;
export const WORLD_H = 740;

export const DESK_RECT = {
  left: 34,
  right: 386,
  top: 96,
  bottom: 644,
  width: 352,
  height: 548,
} as const;

export const FIXED_DT = 1 / 120;
export const MAX_SUBSTEPS = 6;
export const MAX_DRAG_WORLD = 128;
export const MIN_DRAG_WORLD = 10;
export const REST_LINEAR_THRESHOLD = 7;
export const REST_ANGULAR_THRESHOLD = 0.14;
export const REST_HOLD_SECONDS = 0.45;
export const HARD_TURN_TIMEOUT_SECONDS = 9.5;
export const DOUBLE_KO_WINDOW_MS = 150;
export const SUDDEN_DEATH_START_SHOT = 12;
export const DRAW_SHOT_LIMIT = 20;
export const TURBO_IMPULSE_MULT = 1.20; // Blueprint §2.3 balanced +20% impulse

export const PENS: PenSpec[] = [
  {
    id: 'classic_ballpoint',
    name: 'Classic Ballpoint',
    tagline: 'Balanced schoolyard legend with crisp all-around control',
    unlockCoins: 0,
    style: 'ballpoint',
    mass: 1.0,
    power: 1.0,
    spin: 1.0,
    grip: 1.0,
    length: 128,
    radius: 9.5,
    primaryColor: '#0284C7',
    secondaryColor: '#38BDF8',
    accentColor: '#E0F2FE',
    nibColor: '#CBD5E1',
    clipColor: '#F8FAFC',
  },
  {
    id: 'hyper_gel',
    name: 'Hyper Gel Pro',
    tagline: 'Featherweight striker built for high-velocity whip angles',
    unlockCoins: 300,
    style: 'gel',
    mass: 0.85,
    power: 1.07,
    spin: 1.08,
    grip: 0.95,
    length: 132,
    radius: 9,
    primaryColor: '#06B6D4',
    secondaryColor: '#0F172A',
    accentColor: '#67E8F9',
    nibColor: '#E2E8F0',
    clipColor: '#38BDF8',
  },
  {
    id: 'neon_highlighter',
    name: 'Neon Highlighter',
    tagline: 'Wide flat-body defender with high-grip edge resistance',
    unlockCoins: 550,
    style: 'highlighter',
    mass: 1.12,
    power: 0.9,
    spin: 0.88,
    grip: 1.14,
    length: 112,
    radius: 13.5,
    primaryColor: '#A3E635',
    secondaryColor: '#4D7C0F',
    accentColor: '#ECFCCB',
    nibColor: '#D9F99D',
    clipColor: '#1E293B',
  },
  {
    id: 'chunky_marker',
    name: 'Chunky Marker',
    tagline: 'Heavy classroom sweeper that bullies lighter pens off the ledge',
    unlockCoins: 850,
    style: 'marker',
    mass: 1.3,
    power: 0.93,
    spin: 0.83,
    grip: 1.08,
    length: 120,
    radius: 14,
    primaryColor: '#F43F5E',
    secondaryColor: '#9F1239',
    accentColor: '#FFE4E6',
    nibColor: '#1E293B',
    clipColor: '#F8FAFC',
  },
  {
    id: 'vortex_spinner',
    name: 'Vortex Spinner',
    tagline: 'Weighted double-tip frame engineered for insane whip-crit torque',
    unlockCoins: 1200,
    style: 'spinner',
    mass: 0.9,
    power: 0.97,
    spin: 1.3,
    grip: 0.91,
    length: 138,
    radius: 9.5,
    primaryColor: '#8B5CF6',
    secondaryColor: '#312E81',
    accentColor: '#22D3EE',
    nibColor: '#C4B5FD',
    clipColor: '#FACC15',
  },
  {
    id: 'gold_fountain',
    name: 'Gold Fountain',
    tagline: 'Heavy brushed-brass executive powerhouse with commanding poise',
    unlockCoins: 1800,
    style: 'fountain',
    mass: 1.22,
    power: 1.04,
    spin: 0.95,
    grip: 1.07,
    length: 134,
    radius: 11.5,
    primaryColor: '#EAB308',
    secondaryColor: '#18181B',
    accentColor: '#FEF08A',
    nibColor: '#FACC15',
    clipColor: '#FDE047',
  },
];

export const DESKS: DeskSpec[] = [
  {
    id: 'school_oak',
    name: 'School Oak Desk',
    description: 'Classic warm oak planks with balanced classroom friction.',
    unlockRankIndex: 0,
    frictionMult: 1.0,
    surfacePrimary: '#86532E',
    surfaceSecondary: '#5F381D',
    borderColor: '#3E2311',
    trimAccent: '#D4A373',
  },
  {
    id: 'exam_slate',
    name: 'Exam Slate Table',
    description: 'Slick dark drafting slate (-10% friction) for faster ring-outs.',
    unlockRankIndex: 2,
    frictionMult: 0.9,
    surfacePrimary: '#1E293B',
    surfaceSecondary: '#131C2E',
    borderColor: '#090F1C',
    trimAccent: '#38BDF8',
  },
];

export const RANK_NAMES = [
  'Backbench League',
  'Class Monitor Cup',
  'Physics Lab Circuit',
  "Principal's Championship",
  'Aura Trials',
  'Aura Wars Finals',
] as const;

export const TOURNAMENT_LADDER: OpponentSpec[] = [
  // Rank 1: Backbench League (Rookie)
  {
    index: 0,
    rankIndex: 0,
    rankName: RANK_NAMES[0],
    name: 'Aarav',
    title: 'Last-Row Newcomer',
    isBoss: false,
    penId: 'classic_ballpoint',
    deskId: 'school_oak',
  },
  {
    index: 1,
    rankIndex: 0,
    rankName: RANK_NAMES[0],
    name: 'Diya',
    title: 'Quick Flick',
    isBoss: false,
    penId: 'hyper_gel',
    deskId: 'school_oak',
  },
  {
    index: 2,
    rankIndex: 0,
    rankName: RANK_NAMES[0],
    name: 'Kabir',
    title: 'Desk Brawler',
    isBoss: false,
    penId: 'neon_highlighter',
    deskId: 'school_oak',
  },
  {
    index: 3,
    rankIndex: 0,
    rankName: RANK_NAMES[0],
    name: 'Rohan "Flicker"',
    title: 'Backbench Boss',
    isBoss: true,
    penId: 'chunky_marker',
    deskId: 'school_oak',
  },

  // Rank 2: Class Monitor Cup (Intermediate)
  {
    index: 4,
    rankIndex: 1,
    rankName: RANK_NAMES[1],
    name: 'Ananya',
    title: 'Ink Precision',
    isBoss: false,
    penId: 'hyper_gel',
    deskId: 'school_oak',
  },
  {
    index: 5,
    rankIndex: 1,
    rankName: RANK_NAMES[1],
    name: 'Dev',
    title: 'Wide Sweeper',
    isBoss: false,
    penId: 'neon_highlighter',
    deskId: 'school_oak',
  },
  {
    index: 6,
    rankIndex: 1,
    rankName: RANK_NAMES[1],
    name: 'Sanya',
    title: 'Spin Tactician',
    isBoss: false,
    penId: 'vortex_spinner',
    deskId: 'school_oak',
  },
  {
    index: 7,
    rankIndex: 1,
    rankName: RANK_NAMES[1],
    name: 'Meera "Sniper"',
    title: 'Class Monitor Boss',
    isBoss: true,
    penId: 'hyper_gel',
    deskId: 'school_oak',
  },

  // Rank 3: Physics Lab Circuit (Expert — Exam Slate Table!)
  {
    index: 8,
    rankIndex: 2,
    rankName: RANK_NAMES[2],
    name: 'Ishaan',
    title: 'Momentum Ace',
    isBoss: false,
    penId: 'chunky_marker',
    deskId: 'exam_slate',
  },
  {
    index: 9,
    rankIndex: 2,
    rankName: RANK_NAMES[2],
    name: 'Tara',
    title: 'Angular Vector',
    isBoss: false,
    penId: 'vortex_spinner',
    deskId: 'exam_slate',
  },
  {
    index: 10,
    rankIndex: 2,
    rankName: RANK_NAMES[2],
    name: 'Arjun',
    title: 'Lab Captain',
    isBoss: false,
    penId: 'gold_fountain',
    deskId: 'exam_slate',
  },
  {
    index: 11,
    rankIndex: 2,
    rankName: RANK_NAMES[2],
    name: 'Vikram "Torque"',
    title: 'Physics Lab Boss',
    isBoss: true,
    penId: 'vortex_spinner',
    deskId: 'exam_slate',
  },

  // Rank 4: Principal's Championship (Master / Boss)
  {
    index: 12,
    rankIndex: 3,
    rankName: RANK_NAMES[3],
    name: 'Riya',
    title: 'Varsity Striker',
    isBoss: false,
    penId: 'hyper_gel',
    deskId: 'exam_slate',
  },
  {
    index: 13,
    rankIndex: 3,
    rankName: RANK_NAMES[3],
    name: 'Nikhil',
    title: 'Heavy Guard',
    isBoss: false,
    penId: 'chunky_marker',
    deskId: 'exam_slate',
  },
  {
    index: 14,
    rankIndex: 3,
    rankName: RANK_NAMES[3],
    name: 'Zoya',
    title: 'Head Prefect',
    isBoss: false,
    penId: 'vortex_spinner',
    deskId: 'exam_slate',
  },
  {
    index: 15,
    rankIndex: 3,
    rankName: RANK_NAMES[3],
    name: 'Principal Sharma',
    title: 'Championship Boss',
    isBoss: true,
    penId: 'gold_fountain',
    deskId: 'exam_slate',
  },
  // Rank 5: Aura Trials
  {
    index: 16,
    rankIndex: 4,
    rankName: RANK_NAMES[4],
    name: 'Mira',
    title: 'Edge Stalker',
    isBoss: false,
    penId: 'hyper_gel',
    deskId: 'exam_slate',
  },
  {
    index: 17,
    rankIndex: 4,
    rankName: RANK_NAMES[4],
    name: 'Rudra',
    title: 'Cross-Desk Striker',
    isBoss: false,
    penId: 'neon_highlighter',
    deskId: 'exam_slate',
  },
  {
    index: 18,
    rankIndex: 4,
    rankName: RANK_NAMES[4],
    name: 'Kavya',
    title: 'Whip Specialist',
    isBoss: false,
    penId: 'vortex_spinner',
    deskId: 'exam_slate',
  },
  {
    index: 19,
    rankIndex: 4,
    rankName: RANK_NAMES[4],
    name: 'Veer "Sentinel"',
    title: 'Aura Trials Boss',
    isBoss: true,
    penId: 'chunky_marker',
    deskId: 'exam_slate',
  },
  // Rank 6: Aura Wars Finals
  {
    index: 20,
    rankIndex: 5,
    rankName: RANK_NAMES[5],
    name: 'Naina',
    title: 'Counterstrike Ace',
    isBoss: false,
    penId: 'classic_ballpoint',
    deskId: 'exam_slate',
  },
  {
    index: 21,
    rankIndex: 5,
    rankName: RANK_NAMES[5],
    name: 'Aditya',
    title: 'Precision Whip',
    isBoss: false,
    penId: 'hyper_gel',
    deskId: 'exam_slate',
  },
  {
    index: 22,
    rankIndex: 5,
    rankName: RANK_NAMES[5],
    name: 'Kiara',
    title: 'Finals Contender',
    isBoss: false,
    penId: 'vortex_spinner',
    deskId: 'exam_slate',
  },
  {
    index: 23,
    rankIndex: 5,
    rankName: RANK_NAMES[5],
    name: 'Ira "Aura Prime"',
    title: 'Grand Champion Boss',
    isBoss: true,
    penId: 'gold_fountain',
    deskId: 'exam_slate',
  },
];

export function getPenById(id: string): PenSpec {
  return PENS.find((p) => p.id === id) ?? PENS[0];
}

export function getTournamentRivalPen(id: string): PenSpec {
  const appearance = getPenById(id);
  const { mass, power, spin, grip, length, radius } = getPenById('classic_ballpoint');
  return { ...appearance, mass, power, spin, grip, length, radius };
}

export function getDeskById(id: string): DeskSpec {
  return DESKS.find((d) => d.id === id) ?? DESKS[0];
}

export function getOpponentByIndex(index: number): OpponentSpec {
  const clamped = Math.max(0, Math.min(TOURNAMENT_LADDER.length - 1, index));
  return TOURNAMENT_LADDER[clamped];
}
