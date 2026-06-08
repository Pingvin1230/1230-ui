import { ASSISTANT_PALETTE, type AssistantColorId } from '../types/assistant';

interface ColorPickerProps {
  value: AssistantColorId | null;
  onChange: (color: AssistantColorId | null) => void;
  id?: string;
  label?: string;
}

export function ColorPicker({ value, onChange, id = 'assistant-color', label }: ColorPickerProps) {
  return (
    <div>
      {label && (
        <label id={`${id}-label`} className="block text-sm font-medium text-fg-primary mb-2">
          {label}
        </label>
      )}
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
        {ASSISTANT_PALETTE.map((c) => {
          const selected = value === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={c.id}
              onClick={() => onChange(c.id)}
              className={`min-h-[44px] min-w-[44px] w-11 h-11 rounded-full border-2 transition-all ${
                selected
                  ? 'border-fg-primary scale-110 ring-2 ring-offset-2 ring-blue-500 ring-offset-bg-primary'
                  : 'border-border-default hover:scale-105'
              }`}
              style={{ backgroundColor: c.hex }}
            />
          );
        })}
        {value !== null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="min-h-[44px] min-w-[44px] px-3 rounded-lg border border-border-default text-sm text-fg-secondary hover:bg-bg-secondary"
          >
            None
          </button>
        )}
      </div>
    </div>
  );
}
