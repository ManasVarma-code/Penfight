import { ArrowLeft, Gem, Grip, PenTool } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import {
  getPenUpgradeCost, getPenUpgradeLevel, GRIP_GAIN_PERCENT, MAX_PEN_UPGRADE_LEVEL, NIB_GAIN_PERCENT,
} from '../game/garage';
import type { PenSpec, PenUpgradePart, ProfileV1 } from '../game/types';
import { PenPreviewSvg } from './GameLogo';
import './GarageWorkbench.css';

const PARTS = {
  grip: {
    label: 'Grip', Icon: Grip, perLevel: GRIP_GAIN_PERCENT,
    detail: 'Brakes sooner after a hit, so you can recover from closer to the edge.',
    stat: 'braking after a hit',
  },
  nib: {
    label: 'Nib', Icon: PenTool, perLevel: NIB_GAIN_PERCENT,
    detail: 'Transfers more force from the same flick, so shorter drags can still reach your target.',
    stat: 'flick force',
  },
} as const;

interface GarageWorkbenchProps {
  pen: PenSpec;
  profile: ProfileV1;
  onBack: () => void;
  onUpgrade: (penId: string, part: PenUpgradePart, level: number) => boolean;
}

export default function GarageWorkbench({ pen, profile, onBack, onUpgrade }: GarageWorkbenchProps) {
  const [part, setPart] = useState<PenUpgradePart>('grip');
  const [announcement, setAnnouncement] = useState('');
  const [installed, setInstalled] = useState<{ part: PenUpgradePart; level: number }>();
  const level = getPenUpgradeLevel(profile, pen.id, part);
  const cost = getPenUpgradeCost(part, level);
  const info = PARTS[part];
  const reduce = profile.reducedMotion;
  const installLevel = !reduce && installed?.part === part ? installed.level : undefined;

  function selectPart(option: PenUpgradePart) {
    if (option === part) return;
    setInstalled(undefined);
    setPart(option);
  }

  function upgrade() {
    if (onUpgrade(pen.id, part, level)) {
      setInstalled({ part, level: level + 1 });
      setAnnouncement(`${info.label} upgraded to level ${level + 1}.`);
    }
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack}
        className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold text-slate-200">
        <ArrowLeft className="h-4 w-4" /> All pens
      </button>

      <div className="relative overflow-hidden rounded-3xl border border-slate-700 bg-[#0B1422] px-4 pt-4 pb-2">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-30
          [background-image:linear-gradient(#334155_1px,transparent_1px),linear-gradient(90deg,#334155_1px,transparent_1px)]
          [background-size:20px_20px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div className="relative text-center">
          <h3 className="font-display text-xl font-extrabold text-white">{pen.name}</h3>
          <p className="mt-1 text-xs text-slate-400">Tournament upgrades</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={part} className="mt-2"
              initial={reduce ? false : { opacity: 0, x: part === 'grip' ? -14 : 14, rotate: part === 'grip' ? -5 : 5 }}
              animate={{ opacity: 1, x: 0, rotate: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: reduce ? 0 : 0.18 }}>
              <PenPreviewSvg pen={pen} focusedPart={part} installLevel={installLevel}
                className="h-16 w-full drop-shadow-lg" />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Pen parts">
        {(['grip', 'nib'] as const).map((option) => {
          const { Icon, label } = PARTS[option];
          const selected = part === option;
          return (
            <button key={option} type="button" aria-pressed={selected} onClick={() => selectPart(option)}
              className={`flex min-h-12 items-center gap-2 rounded-2xl border px-3 text-left transition ${selected
                ? 'border-cyan-400/70 bg-cyan-950 text-cyan-100'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>
              <Icon className="h-5 w-5 shrink-0" />
              <span className="min-w-0 text-sm font-bold">{label}
                <span className="block text-[11px] font-medium text-slate-400">
                  Level {getPenUpgradeLevel(profile, pen.id, option)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <section className="rounded-2xl border border-slate-700 bg-[#172235] p-3" aria-label={`${info.label} upgrade`}>
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-display text-base font-bold text-white">{info.label}</h4>
          <span className="font-mono-num text-xs text-slate-300">{level}/{MAX_PEN_UPGRADE_LEVEL}</span>
        </div>
        <div className="mt-2 grid grid-cols-5 gap-1.5" aria-hidden="true">
          {Array.from({ length: MAX_PEN_UPGRADE_LEVEL }, (_, index) => (
            <motion.div key={index} className={`h-2 rounded-full ${index < level ? 'bg-cyan-300' : 'bg-slate-700'}`}
              animate={{ scaleY: installLevel === level && index === level - 1 ? [1, 1.7, 1] : 1 }}
              transition={{ duration: reduce ? 0 : 0.35, delay: installLevel === level ? 0.43 : 0 }} />
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-300">{info.detail}</p>
        <p className="mt-1 text-xs font-bold text-cyan-200">
          +{level * info.perLevel}%{cost !== undefined && <> → +{(level + 1) * info.perLevel}%</>} {info.stat}
        </p>
        <button type="button" onClick={upgrade} disabled={cost === undefined || profile.coins < cost}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-3 text-sm font-extrabold text-slate-950 transition active:scale-[0.98] disabled:bg-slate-800 disabled:text-slate-400">
          {cost === undefined ? 'Fully upgraded' : (
            <><Gem className="h-4 w-4" aria-hidden="true" /> Upgrade · {cost.toLocaleString()} Aura Points</>
          )}
        </button>
        {cost !== undefined && profile.coins < cost && (
          <p className="mt-2 text-center text-xs text-slate-400">{(cost - profile.coins).toLocaleString()} more Aura Points needed</p>
        )}
      </section>
      <p role="status" className="sr-only">{announcement}</p>
    </div>
  );
}
