import { create } from 'zustand';

const initialQuery = (() => {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('q') ?? '';
})();

interface SearchState {
  query: string;
  setQuery: (query: string) => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: initialQuery,
  setQuery: (query) => set({ query }),
}));
