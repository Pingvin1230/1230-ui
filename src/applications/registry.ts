import type { ApplicationComponent } from './types';
import { FilePreviewApp } from './file-preview';
import { FileManagerApp } from './file-manager';
import { CloudConnectApp } from './cloud-connect';
import { TududiApp } from './tududi';

export const applicationRegistry: Record<string, ApplicationComponent> = {
  file_preview: FilePreviewApp,
  file_manager: FileManagerApp,
  cloud_connect: CloudConnectApp,
  tududi: TududiApp,
};
