import { ASSISTANT_ICONS } from '../types/assistant';

interface IconPickerProps {
  value: string | null;
  onChange: (icon: string | null) => void;
  id?: string;
  label?: string;
}

export function IconPicker({ value, onChange, id = 'assistant-icon', label }: IconPickerProps) {
  return (
    <div>
      {label && (
        <label id={`${id}-label`} className="block text-sm font-medium text-fg-primary mb-2">
          {label}
        </label>
      )}
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        className="grid grid-cols-8 sm:grid-cols-10 gap-2"
      >
        {ASSISTANT_ICONS.map((emoji) => {
          const selected = value === emoji;
          return (
            <button
              key={emoji}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(selected ? null : emoji)}
              className={`min-h-[44px] min-w-[44px] aspect-square rounded-lg border-2 text-xl flex items-center justify-center transition-all ${
                selected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                  : 'border-border-default hover:border-blue-300'
              }`}
            >
              {emoji}
            </button>
          );
        })}
      </div>
    </div>
  );
}
