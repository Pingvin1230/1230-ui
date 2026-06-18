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

// ── Tone / communication style ────────────────────────────────────────────
export const STYLE_OPTIONS = [
  { id: 'friendly',   emoji: '💬', label: 'assistants.styleFriendly' },
  { id: 'formal',     emoji: '📋', label: 'assistants.styleFormal' },
  { id: 'concise',    emoji: '✂️',  label: 'assistants.styleConcise' },
  { id: 'creative',   emoji: '🎨', label: 'assistants.styleCreative' },
] as const;

export type AssistantStyleId = (typeof STYLE_OPTIONS)[number]['id'];

// ── Response depth (maps to max_iterations in Hermes) ─────────────────────
export const DEPTH_OPTIONS = [
  { id: 'quick',    dots: 1, label: 'assistants.depthQuick' },
  { id: 'standard', dots: 2, label: 'assistants.depthStandard' },
  { id: 'thorough', dots: 3, label: 'assistants.depthThorough' },
] as const;

export type AssistantDepthId = (typeof DEPTH_OPTIONS)[number]['id'];

// ── Executor backend (Variant B) ──────────────────────────────────────────
export const EXECUTOR_OPTIONS = [
  { id: 'hermes',        emoji: '🤖', label: 'assistants.executor.hermes' },
  { id: 'opencode-1230', emoji: '⚡', label: 'assistants.executor.opencode-1230' },
] as const;

export type AssistantExecutorId = (typeof EXECUTOR_OPTIONS)[number]['id'];

export interface AssistantFormValues {
  name: string;
  description: string;
  color: AssistantColorId | null;
  icon: string | null;
  modelId: string | null;
  style: AssistantStyleId | null;
  depth: AssistantDepthId | null;
}
