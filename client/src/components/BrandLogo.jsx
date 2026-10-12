import React from 'react';

/**
 * BrandLogo: Precision verified personnel badge logogram for myHR by Swaniki.
 * Renders an Apple-inspired verified credential squircle with optical geometry.
 */
export default function BrandLogo({ size = 24, className = '', verifiedColor = '#10B981', color = 'currentColor' }) {
  const width = size;
  const height = Math.round(size * (84 / 68));
  const maskId = `brandMask_${size}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 68 84"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', flexShrink: 0, color: color !== 'currentColor' ? color : undefined }}
      aria-hidden="true"
    >
      <defs>
        <mask id={maskId}>
          <rect width="68" height="84" fill="white" />
          <circle cx="53" cy="67" r="18" fill="black" />
        </mask>
      </defs>

      {/* Main Badge Card */}
      <rect
        x="2.5"
        y="2.5"
        width="63"
        height="79"
        rx="14"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="3.5"
        mask={`url(#${maskId})`}
      />

      {/* Avatar Head */}
      <circle
        cx="34"
        cy="27"
        r="10"
        stroke="currentColor"
        strokeWidth="3.5"
        fill="none"
        mask={`url(#${maskId})`}
      />

      {/* Avatar Torso */}
      <path
        d="M 17 53 C 17 41, 51 41, 51 53"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
        mask={`url(#${maskId})`}
      />

      {/* Detail Line */}
      <line
        x1="18"
        y1="64"
        x2="34"
        y2="64"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {/* Verified Seal Circle */}
      <circle
        cx="53"
        cy="67"
        r="13"
        fill={verifiedColor}
        stroke="currentColor"
        strokeWidth="2"
      />

      {/* Checkmark inside Seal */}
      <path
        d="M 47.5 67 L 51.5 71 L 58.5 63"
        stroke="#FFFFFF"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
