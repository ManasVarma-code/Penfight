import { getPenById } from '../game/content';
import { GameLogo, PenPreviewSvg } from './GameLogo';

export function OpeningScreen({ restoring, unavailable, onGuest }: {
  restoring?: boolean; unavailable?: boolean; onGuest?: () => void;
}) {
  return <div className="fixed inset-0 z-[70] grid place-items-center overflow-hidden bg-[#070d18] px-6">
    <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_43%,#264668_0%,#111c2e_43%,#070d18_75%)]" />
    <div className="relative w-full max-w-[320px] text-center">
      <div aria-hidden="true" className="relative mb-4 h-20">
        <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-200/20 shadow-[0_0_65px_#d3913438]" />
        <PenPreviewSvg pen={getPenById('classic_ballpoint')} className="opening-pen opening-pen-blue absolute left-3 top-8 h-10 w-[150px]" />
        <PenPreviewSvg pen={getPenById('gold_fountain')} className="opening-pen opening-pen-gold absolute right-3 top-2 h-10 w-[150px]" />
      </div>
      <GameLogo />
      {restoring && <p role="status" className="mt-6 text-sm text-slate-300">
        {unavailable ? 'Cloud saves are temporarily unavailable.' : 'Loading your saved progress…'}
      </p>}
      {unavailable && onGuest && <button type="button" onClick={onGuest}
        className="mt-4 min-h-11 rounded-xl border border-slate-500 px-5 text-sm font-bold text-white">Play as guest</button>}
    </div>
  </div>;
}
