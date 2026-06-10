import type { ApplicationComponent } from './types';
import { FilePreviewApp } from './file-preview';
import { FileManagerApp } from './file-manager';

export const applicationRegistry: Record<string, ApplicationComponent> = {
  file_preview: FilePreviewApp,
  file_manager: FileManagerApp,
};
