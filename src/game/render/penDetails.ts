import type { PenSpec } from '../types';

export const PEN_DETAILS: Record<PenSpec['style'], { mark: string; ink: string }> = {
  ballpoint: { mark: 'CLASSIC', ink: '#e6f8ff' },
  gel: { mark: 'HYPER GEL', ink: '#8df3ff' },
  highlighter: { mark: 'NEON', ink: '#18290a' },
  marker: { mark: 'CHUNKY', ink: '#ffffff' },
  spinner: { mark: 'VORTEX', ink: '#f2d9ff' },
  fountain: { mark: 'AURA', ink: '#fff0b9' },
};
