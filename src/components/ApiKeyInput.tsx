import { useState, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';

interface ApiKeyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
}

export function ApiKeyInput({ value, onChange, className, ...rest }: ApiKeyInputProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...rest}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        className={
          'w-full px-3 py-2 pr-10 text-sm rounded-lg border border-border-default bg-bg-primary text-fg-primary font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
          (className || '')
        }
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('providers.hideKey') : t('providers.showKey')}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-fg-muted hover:text-fg-secondary rounded transition-colors"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
