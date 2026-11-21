import React from 'react';
import { PenSpec } from '../game/types';

export const GameLogo: React.FC = () => {
  return (
    <div className="flex flex-col items-center select-none">
      <svg
        viewBox="0 0 340 124"
        className="w-[270px] sm:w-[310px] h-auto drop-shadow-[0_12px_24px_rgba(0,0,0,0.65)]"
        aria-label="Pen Fight Royale"
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
          letterSpacing="5.5"
          stroke="#070B14"
          strokeWidth="6"
          paintOrder="stroke"
          fill="url(#logoGold)"
        >
          ROYALE
        </text>
      </svg>
    </div>
  );
};

export const PenPreviewSvg: React.FC<{ pen: PenSpec; className?: string }> = ({
  pen,
  className = 'w-full h-9',
}) => {
  const halfL = pen.length * 0.5;
  const r = pen.radius;
  return (
    <svg
      viewBox={`-82 -22 164 44`}
      className={className}
      aria-hidden="true"
    >
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
      <polygon
        points={`${halfL - 22},${-r * 0.85} ${halfL + 4},0 ${halfL - 22},${r * 0.85}`}
        fill={pen.nibColor}
      />
      {/* Main Barrel */}
      <rect
        x={-halfL}
        y={-r}
        width={pen.length - 18}
        height={r * 2}
        rx={pen.style === 'highlighter' ? 5 : r * 0.85}
        fill={pen.primaryColor}
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
    </svg>
  );
};
