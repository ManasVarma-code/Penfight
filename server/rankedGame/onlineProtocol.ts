import type { FlickCommand, PhysicsEvent, PhysicsSnapshot } from './types';
import type { RankedHistoryEntry } from './ranking';

export type OnlineSide = 'p1' | 'p2';
export type DuelMode = 'guest' | 'ranked';
export type OnlineFlick = Pick<FlickCommand, 'aimRadians' | 'gripOffset01' | 'normalizedPower'>;

export const ONLINE_DESK = 'school_oak';
export const ONLINE_PEN = 'classic_ballpoint';
export const ONLINE_FRAME_MS = 1000 / 30;

export interface OnlineReplay {
  frames: Array<{ snapshot: PhysicsSnapshot; events: PhysicsEvent[] }>;
  startAt: number;
  endAt: number;
  power: number;
  turbo: boolean;
}

export interface OnlineMatchState {
  revision: number;
  snapshot: PhysicsSnapshot;
  score: Record<OnlineSide, number>;
  surge: Record<OnlineSide, number>;
  turn: OnlineSide;
  round: number;
  shots: number;
  winner: OnlineSide | null;
  deadline: number;
}

export type OnlineStatus =
  | { status: 'waiting' }
  | { status: 'expired' }
  | {
      status: 'matched';
      side: OnlineSide;
      now: number;
      state: OnlineMatchState;
      replay?: OnlineReplay;
      ranked?: {
        id: string;
        startsAt: number;
        players: Record<OnlineSide, { displayName: string; rating: number }>;
        result?: RankedHistoryEntry;
      };
    };
