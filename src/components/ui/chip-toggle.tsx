import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Remplaçants modernes des gros interrupteurs on/off (Switch) :
 *  - <ChipToggle>  : puce cliquable avec coche — le libellé EST la puce
 *    (commodités de filtres, équipements…). Rempli bleu marque quand actif.
 *  - <YesNoToggle> : segmenté Oui/Non compact — pour les questions binaires
 *    dont le libellé reste à gauche (wizard, réglages).
 * Accessibles (role switch / boutons aria-pressed), cibles tactiles ≥ 36px.
 */

interface ChipToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export const ChipToggle: React.FC<ChipToggleProps> = ({
  checked,
  onCheckedChange,
  children,
  disabled,
  className,
  id,
}) => (
  <button
    type="button"
    id={id}
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onCheckedChange(!checked)}
    className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all min-h-9',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
      checked
        ? 'border-transparent bg-gradient-to-r from-[#2994C0] to-[#1E6B8C] text-white shadow-sm'
        : 'border-border bg-muted/40 text-foreground/80 hover:border-primary/40 hover:text-foreground',
      disabled && 'opacity-50 pointer-events-none',
      className,
    )}
  >
    <Check className={cn('h-3.5 w-3.5 transition-all', checked ? 'opacity-100' : 'opacity-30')} />
    {children}
  </button>
);

interface YesNoToggleProps {
  /** true = Oui, false = Non, undefined/null = pas encore répondu */
  value: boolean | undefined | null;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
  yesLabel?: string;
  noLabel?: string;
  id?: string;
  'aria-label'?: string;
}

export const YesNoToggle: React.FC<YesNoToggleProps> = ({
  value,
  onChange,
  disabled,
  className,
  yesLabel = 'Oui',
  noLabel = 'Non',
  id,
  'aria-label': ariaLabel,
}) => (
  <div
    id={id}
    role="group"
    aria-label={ariaLabel}
    className={cn(
      'inline-flex items-center rounded-full bg-muted p-0.5',
      disabled && 'opacity-50 pointer-events-none',
      className,
    )}
  >
    <button
      type="button"
      aria-pressed={value === true}
      onClick={() => onChange(true)}
      className={cn(
        'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all min-h-8',
        value === true
          ? 'bg-gradient-to-r from-[#2994C0] to-[#1E6B8C] text-white shadow'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {yesLabel}
    </button>
    <button
      type="button"
      aria-pressed={value === false}
      onClick={() => onChange(false)}
      className={cn(
        'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all min-h-8',
        value === false
          ? 'bg-slate-600 text-white shadow dark:bg-slate-500'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {noLabel}
    </button>
  </div>
);
