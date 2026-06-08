export const ASSISTANT_PALETTE = [
  { id: 'blue',   hex: '#3b82f6' },
  { id: 'green',  hex: '#22c55e' },
  { id: 'purple', hex: '#a855f7' },
  { id: 'red',    hex: '#ef4444' },
  { id: 'orange', hex: '#f97316' },
  { id: 'yellow', hex: '#eab308' },
  { id: 'pink',   hex: '#ec4899' },
  { id: 'gray',   hex: '#6b7280' },
] as const;

export type AssistantColorId = (typeof ASSISTANT_PALETTE)[number]['id'];

export const ASSISTANT_ICONS = [
  '🤖', '💻', '✨', '🧠', '📝', '🔍', '💡', '🎨',
  '🚀', '⚙️', '📊', '🔧', '📚', '🌐', '🛠️', '🎯',
  '💬', '🤝', '⭐', '🔥', '🧪', '📦', '🏗️', '🧩',
  '🪄', '🧭', '🪛', '🧱', '🪴', '🪞',
] as const;

export const ASSISTANT_NAME_MAX = 60;
export const ASSISTANT_DESC_MAX = 200;

export interface AssistantFormValues {
  name: string;
  description: string;
  color: AssistantColorId | null;
  icon: string | null;
  modelId: string | null;
}
