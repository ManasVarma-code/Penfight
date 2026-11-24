import React, { useId } from 'react';
import { PenSpec, PenUpgradePart } from '../game/types';
import { PEN_DETAILS } from '../game/render/penDetails';

export const GameLogo: React.FC = () => {
  return (
    <div className="flex flex-col items-center select-none">
      <svg
        viewBox="0 0 340 124"
        className="w-[270px] sm:w-[310px] h-auto drop-shadow-[0_12px_24px_rgba(0,0,0,0.65)]"
        aria-label="Pen Fight Aura Wars"
        role="img"
      >
        <defs>
          <linearGradient id="logoGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FEF08A" />
            <stop offset="55%" stopColor="#FACC15" />
            <stop offset="100%" stopColor="#CA8A04" />
          </linearGradient>
          <linearGradient id="logoCyan" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0284C7" />
            <stop offset="100%" stopColor="#38BDF8" />
          </linearGradient>
          <linearGradient id="logoCoral" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#E11D48" />
            <stop offset="100%" stopColor="#FB7185" />
          </linearGradient>
        </defs>

        {/* Crossed glossy pens behind title */}
        <g transform="translate(170 48) rotate(-20)">
          <rect x="-112" y="-8" width="186" height="16" rx="8" fill="url(#logoCyan)" />
          <polygon points="74,-8 106,0 74,8" fill="#E2E8F0" />
          <rect x="-92" y="-5" width="142" height="4" rx="2" fill="#FFFFFF" fillOpacity="0.45" />
        </g>
        <g transform="translate(170 48) rotate(20)">
          <rect x="-112" y="-8" width="186" height="16" rx="8" fill="url(#logoCoral)" />
          <polygon points="74,-8 106,0 74,8" fill="#FDE68A" />
          <rect x="-92" y="-5" width="142" height="4" rx="2" fill="#FFFFFF" fillOpacity="0.45" />
        </g>

        {/* Impact spark burst */}
        <circle cx="170" cy="48" r="14" fill="#FACC15" fillOpacity="0.28" />
        <polygon
          points="170,31 174,43 187,48 174,53 170,65 166,53 153,48 166,43"
          fill="#FEF08A"
        />

        {/* Primary Display Wordmark */}
        <text
          x="170"
          y="78"
          textAnchor="middle"
          fontFamily="Outfit, system-ui, sans-serif"
          fontWeight="800"
          fontSize="44"
          letterSpacing="-0.5"
          stroke="#070B14"
          strokeWidth="9"
          paintOrder="stroke"
          fill="#F8FAFC"
        >
          PEN FIGHT
        </text>
        <text
          x="170"
          y="108"
          textAnchor="middle"
          fontFamily="Outfit, system-ui, sans-serif"
          fontWeight="800"
          fontSize="24"
          letterSpacing="4.5"
          stroke="#070B14"
          strokeWidth="6"
          paintOrder="stroke"
          fill="url(#logoGold)"
        >
          AURA WARS
        </text>
      </svg>
    </div>
  );
};

export const PenPreviewSvg: React.FC<{
  pen: PenSpec;
  className?: string;
  focusedPart?: PenUpgradePart;
  installLevel?: number;
}> = ({
  pen,
  className = 'w-full h-9',
  focusedPart,
  installLevel,
}) => {
  const gradient = useId();
  const halfL = pen.length * 0.5;
  const r = pen.radius;
  const nib = `${halfL - 22},${-r * 0.85} ${halfL + 4},0 ${halfL - 22},${r * 0.85}`;
  const gripSelected = focusedPart === 'grip';
  const nibSelected = focusedPart === 'nib';
  const detail = PEN_DETAILS[pen.style];
  const tip = pen.style === 'highlighter' ? `${halfL - 21},${-r * 0.65} ${halfL + 2},${-r * 0.3} ${halfL + 2},${r * 0.48} ${halfL - 21},${r * 0.7}`
    : pen.style === 'marker' ? `${halfL - 21},${-r * 0.57} ${halfL - 3},${-r * 0.44} ${halfL + 2},0 ${halfL - 3},${r * 0.44} ${halfL - 21},${r * 0.57}` : nib;
  return (
    <svg
      viewBox={focusedPart ? '-106 -28 212 56' : '-82 -22 164 44'}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${gradient}-barrel`} x1="0" x2="0" y1="0" y2="1">
          <stop stopColor={pen.secondaryColor} />
          <stop offset=".45" stopColor={pen.primaryColor} />
          <stop offset="1" stopColor="#0c1521" />
        </linearGradient>
        <linearGradient id={`${gradient}-metal`} x1="0" x2="0" y1="0" y2="1">
          <stop stopColor={pen.clipColor} />
          <stop offset=".53" stopColor={pen.nibColor} />
          <stop offset="1" stopColor="#536478" />
        </linearGradient>
      </defs>
      {/* Subtle drop shadow */}
      <rect
        x={-halfL + 2}
        y={-r + 4}
        width={pen.length}
        height={r * 2}
        rx={r}
        fill="rgba(0,0,0,0.35)"
      />
      {/* Nib */}
      {!nibSelected && <polygon points={tip} fill={`url(#${gradient}-metal)`} />}
      {/* Main Barrel */}
      <rect
        x={-halfL}
        y={-r}
        width={pen.length - 18}
        height={r * 2}
        rx={pen.style === 'highlighter' ? 5 : r * 0.85}
        fill={`url(#${gradient}-barrel)`}
      />
      {/* Secondary Trim */}
      {pen.style === 'gel' || pen.style === 'fountain' ? (
        <rect
          x={-halfL}
          y={-r}
          width={pen.length - 56}
          height={r * 2}
          rx={r * 0.7}
          fill={pen.secondaryColor}
        />
      ) : null}
      {pen.style === 'spinner' ? (
        <>
          <rect x={-halfL} y={-r} width={18} height={r * 2} rx={4} fill="#0F172A" />
          <rect x={halfL - 22} y={-r} width={18} height={r * 2} rx={4} fill="#0F172A" />
          <rect x={-halfL + 5} y={-r} width={4} height={r * 2} fill={pen.accentColor} />
          <rect x={halfL - 13} y={-r} width={4} height={r * 2} fill={pen.accentColor} />
        </>
      ) : null}
      {pen.style === 'marker' ? (
        <>
          <rect x={-halfL + 16} y={-r} width={pen.length - 56} height={r * 2} fill="#E2E8F0" />
          <rect x={-halfL + 24} y={-3.5} width={34} height={7} fill={pen.primaryColor} />
        </>
      ) : null}
      {/* Clip */}
      <rect
        x={-halfL + 8}
        y={-r - 2.5}
        width={38}
        height={3.5}
        rx={1.7}
        fill={pen.clipColor}
      />
      {/* Gloss specular highlight */}
      <rect
        x={-halfL + 8}
        y={-r * 0.75}
        width={pen.length - 36}
        height={r * 0.45}
        rx={2}
        fill="#FFFFFF"
        fillOpacity="0.4"
      />
      {pen.style === 'ballpoint' && <path d={`M ${-halfL + 18} 3 H ${halfL - 32}`} stroke="#091d36" strokeOpacity=".65" strokeWidth="2.5" />}
      {pen.style === 'gel' && <g fill={pen.primaryColor}>
        {[0, 4, 8, 12, 16].map(x => <rect key={x} x={halfL - 46 + x} y={-r + 2} width="2" height={2 * r - 4} rx="1" />)}
      </g>}
      {pen.style === 'highlighter' && <path d={`M ${halfL - 32} ${-r} v ${2 * r}`} stroke="#293a16" strokeWidth="7" />}
      {pen.style === 'marker' && <path d={`M ${halfL - 43} -5 h 16 m -16 10 h 16`} stroke={pen.secondaryColor} strokeWidth="2" />}
      {pen.style === 'spinner' && <g stroke={pen.accentColor} strokeWidth="1.5" fill="none">
        <path d={`M ${halfL - 50} -5 l 5 5 -5 5 m 6 -10 l 5 5 -5 5`} />
      </g>}
      {pen.style === 'fountain' && <g fill={pen.accentColor} stroke={pen.clipColor} strokeWidth="1">
        <path d={`M ${halfL - 40} -5 l 5 5 -5 5 -5 -5 z M ${halfL - 26} ${-r} v ${2 * r}`} />
        <path d={`M ${halfL - 14} 0 H ${halfL}`} fill="none" />
      </g>}
      <text x={-18} y="2.3" textAnchor="middle" fontFamily="system-ui,sans-serif" fontWeight="800"
        fontSize={pen.style === 'marker' ? 6.2 : 5.8} letterSpacing=".65" fill={detail.ink}>{detail.mark}</text>
      {gripSelected && (
        <g key={`grip-${installLevel ?? 'preview'}`}
          className={installLevel !== undefined ? 'garage-install-grip' : undefined}>
          <rect x={halfL - 55} y={-r - 3} width={32} height={2 * r + 6} rx="5"
            fill="#22D3EE" fillOpacity="0.22" stroke="#67E8F9" strokeWidth="1.45" />
          {[49, 42, 35, 28].map((x) => (
            <path key={x} d={`M ${halfL - x} ${-r + 3} v ${2 * r - 6}`}
              stroke="#A5F3FC" strokeOpacity="0.65" strokeWidth="1" />
          ))}
        </g>
      )}
      {nibSelected && (
        <g key={`nib-${installLevel ?? 'preview'}`}
          className={installLevel !== undefined ? 'garage-install-nib' : undefined}>
          <polygon points={tip} fill={pen.nibColor} />
          <polygon points={`${halfL - 23},${-r} ${halfL + 7},0 ${halfL - 23},${r}`}
            fill="#FBBF24" fillOpacity="0.26" stroke="#FDE68A" strokeWidth="1.45" />
        </g>
      )}
      {focusedPart && installLevel !== undefined && (
        <g key={`lock-${focusedPart}-${installLevel}`}
          transform={`translate(${halfL - (gripSelected ? 37 : 18)} 0)`}>
          <circle className="garage-install-lock" r={r + 3} fill="none"
            stroke={gripSelected ? '#A5F3FC' : '#FDE68A'} strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
};
