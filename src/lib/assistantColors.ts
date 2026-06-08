import type { AssistantColorId } from '../types/assistant';

interface AssistantColorClasses {
  bg: string;
  bgSubtle: string;
  text: string;
  border: string;
  ring: string;
  accent: string;
}

const COLOR_MAP: Record<AssistantColorId, AssistantColorClasses> = {
  blue:   { bg: 'bg-blue-500',    bgSubtle: 'bg-blue-100 dark:bg-blue-900/30',   text: 'text-blue-800 dark:text-blue-200',   border: 'border-blue-300 dark:border-blue-700',   ring: 'ring-blue-500',   accent: 'text-blue-600 dark:text-blue-400' },
  green:  { bg: 'bg-green-500',   bgSubtle: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-200', border: 'border-green-300 dark:border-green-700', ring: 'ring-green-500',  accent: 'text-green-600 dark:text-green-400' },
  purple: { bg: 'bg-purple-500',  bgSubtle: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-800 dark:text-purple-200', border: 'border-purple-300 dark:border-purple-700', ring: 'ring-purple-500', accent: 'text-purple-600 dark:text-purple-400' },
  red:    { bg: 'bg-red-500',     bgSubtle: 'bg-red-100 dark:bg-red-900/30',     text: 'text-red-800 dark:text-red-200',     border: 'border-red-300 dark:border-red-700',     ring: 'ring-red-500',    accent: 'text-red-600 dark:text-red-400' },
  orange: { bg: 'bg-orange-500',  bgSubtle: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-800 dark:text-orange-200', border: 'border-orange-300 dark:border-orange-700', ring: 'ring-orange-500', accent: 'text-orange-600 dark:text-orange-400' },
  yellow: { bg: 'bg-yellow-500',  bgSubtle: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-800 dark:text-yellow-200', border: 'border-yellow-300 dark:border-yellow-700', ring: 'ring-yellow-500', accent: 'text-yellow-600 dark:text-yellow-400' },
  pink:   { bg: 'bg-pink-500',    bgSubtle: 'bg-pink-100 dark:bg-pink-900/30',   text: 'text-pink-800 dark:text-pink-200',   border: 'border-pink-300 dark:border-pink-700',   ring: 'ring-pink-500',   accent: 'text-pink-600 dark:text-pink-400' },
  gray:   { bg: 'bg-gray-500',    bgSubtle: 'bg-gray-100 dark:bg-gray-800/40',    text: 'text-gray-800 dark:text-gray-200',   border: 'border-gray-300 dark:border-gray-600',   ring: 'ring-gray-500',   accent: 'text-gray-600 dark:text-gray-400' },
};

/** Fallback used when the stored color value is null, empty, or unrecognised. */
export const FALLBACK_COLOR: AssistantColorId = 'gray';

/**
 * Returns Tailwind class bundles for the given assistant color.
 * Falls back to `FALLBACK_COLOR` ('gray') when the value is null, undefined,
 * or not in the palette — so callers always receive a valid object.
 */
export function getAssistantColorClasses(color: string | null | undefined): AssistantColorClasses {
  if (color && color in COLOR_MAP) {
    return COLOR_MAP[color as AssistantColorId];
  }
  return COLOR_MAP[FALLBACK_COLOR];
}
