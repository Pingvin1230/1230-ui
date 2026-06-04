import type { SVGProps } from 'react';

export function NoSessionsIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="20" y="30" width="80" height="60" rx="8" />
      <line x1="32" y1="48" x2="68" y2="48" />
      <line x1="32" y1="60" x2="80" y2="60" />
      <line x1="32" y1="72" x2="56" y2="72" />
      <circle cx="92" cy="34" r="10" fill="white" />
      <line x1="92" y1="29" x2="92" y2="39" />
      <line x1="87" y1="34" x2="97" y2="34" />
    </svg>
  );
}

export function NoMessagesIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M20 32 Q20 24 28 24 H92 Q100 24 100 32 V72 Q100 80 92 80 H44 L28 94 V80 Q20 80 20 72 Z" />
      <line x1="36" y1="44" x2="84" y2="44" />
      <line x1="36" y1="56" x2="72" y2="56" />
      <line x1="36" y1="68" x2="60" y2="68" />
    </svg>
  );
}

export function NoModelsIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="60" cy="60" r="14" />
      <line x1="60" y1="46" x2="60" y2="38" />
      <line x1="60" y1="82" x2="60" y2="74" />
      <line x1="46" y1="60" x2="38" y2="60" />
      <line x1="82" y1="60" x2="74" y2="60" />
      <circle cx="60" cy="22" r="6" />
      <circle cx="60" cy="98" r="6" />
      <circle cx="22" cy="60" r="6" />
      <circle cx="98" cy="60" r="6" />
      <line x1="60" y1="28" x2="60" y2="38" />
      <line x1="60" y1="92" x2="60" y2="82" />
      <line x1="28" y1="60" x2="38" y2="60" />
      <line x1="92" y1="60" x2="74" y2="60" />
    </svg>
  );
}

