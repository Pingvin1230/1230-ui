import { useEffect, useState } from 'react';

export type TimeBracket = {
  start: number;
  end: number;
  color: string;
  label: string;
};

export const TIME_BRACKETS: TimeBracket[] = [
  { start: 1,  end: 5,  color: '#1E3A5F', label: 'time.midnight' },
  { start: 5,  end: 7,  color: '#FB923C', label: 'time.dawn' },
  { start: 7,  end: 12, color: '#60A5FA', label: 'time.morning' },
  { start: 12, end: 14, color: '#22D3EE', label: 'time.noon' },
  { start: 14, end: 17, color: '#FBBF24', label: 'time.afternoon' },
  { start: 17, end: 19, color: '#F97316', label: 'time.sunset' },
  { start: 19, end: 22, color: '#8B5CF6', label: 'time.evening' },
  { start: 22, end: 24, color: '#3B82F6', label: 'time.night' },
];

function getCurrentBracket(now: Date = new Date()): TimeBracket {
  const h = now.getHours();
  return (
    TIME_BRACKETS.find((s) => h >= s.start && h < s.end) ??
    TIME_BRACKETS[TIME_BRACKETS.length - 1]
  );
}

export function useTimeBracketColor(): TimeBracket {
  const [bracket, setBracket] = useState<TimeBracket>(() => getCurrentBracket());

  useEffect(() => {
    const tick = () => setBracket(getCurrentBracket());
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  return bracket;
}
