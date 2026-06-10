import { create } from 'zustand';

interface FilePreviewState {
  selectedFileId: number | null;
  setSelectedFileId: (id: number | null) => void;
}

export const useFilePreviewStore = create<FilePreviewState>((set) => ({
  selectedFileId: null,
  setSelectedFileId: (id) => set({ selectedFileId: id }),
}));
