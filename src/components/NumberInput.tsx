import React from 'react';

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onValueChange: (n: number) => void;
  /** When true, only whole numbers are accepted (no decimal point). */
  integer?: boolean;
}

/**
 * Desktop-friendly numeric input that never shows a sticky "0".
 *
 * Problem it solves: `<input type="number" value={0}>` always renders
 * "0". Clearing the field immediately snaps back to "0" because the
 * handler does `Number(e.target.value) || 0`. The user must select the
 * 0 before typing, and "0" + "5" produces "05". Non-technical users find
 * this confusing.
 *
 * This component renders `type="text" inputMode="decimal"` with an
 * *empty* display when the logical value is 0, so clearing leaves a
 * blank field and typing just works. Decimals (e.g. "10.50") are allowed
 * and intermediate states like "10." are preserved while focused.
 */
export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onValueChange,
  integer = false,
  onFocus,
  onBlur,
  ...rest
}) => {
  const [raw, setRaw] = React.useState<string>(() => (value === 0 ? '' : String(value)));
  const focusedRef = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Keep display in sync when the parent resets the value (e.g. form
  // cleared, product switched) — but never clobber what the user is
  // actively typing.
  React.useEffect(() => {
    if (!focusedRef.current) {
      setRaw(value === 0 ? '' : String(value));
    }
  }, [value]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    focusedRef.current = true;
    // Select existing content so typing replaces it — easiest for
    // non-technical users (no need to manually delete the old number).
    requestAnimationFrame(() => {
      try {
        inputRef.current?.select();
      } catch {}
    });
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    focusedRef.current = false;
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed === '.' || trimmed === '-') {
      setRaw('');
      if (value !== 0) onValueChange(0);
      onBlur?.(e);
      return;
    }
    const parsed = integer ? parseInt(trimmed, 10) : parseFloat(trimmed);
    if (Number.isNaN(parsed)) {
      setRaw('');
      if (value !== 0) onValueChange(0);
    } else {
      const minAttr = rest.min !== undefined ? Number(rest.min) : undefined;
      const clamped = minAttr !== undefined && !Number.isNaN(minAttr) ? Math.max(minAttr, parsed) : parsed;
      const nextRaw = String(clamped);
      setRaw(clamped === 0 ? '' : nextRaw);
      if (clamped !== value) onValueChange(clamped);
    }
    onBlur?.(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let next = e.target.value;

    if (integer) {
      next = next.replace(/[^0-9]/g, '');
    } else {
      // Allow digits, single dot, and an optional leading minus for
      // completeness (clamped to min on blur).
      next = next.replace(/[^0-9.\-]/g, '');
      // Keep only the first dot and ensure minus is only at the start.
      const minus = next.startsWith('-') ? '-' : '';
      const body = minus ? next.slice(1) : next;
      const parts = body.split('.');
      next = minus + (parts.length <= 1 ? body : `${parts[0]}.${parts.slice(1).join('')}`);
    }

    setRaw(next);

    // Push numeric value to parent live so dependent totals update
    // immediately; empty / incomplete states ("" / "10." / "-") map to 0
    // until blur finalises them.
    if (next === '' || next === '.' || next === '-' || next === '-.') {
      if (value !== 0) onValueChange(0);
      return;
    }
    const parsed = integer ? parseInt(next, 10) : parseFloat(next);
    const numeric = Number.isNaN(parsed) ? 0 : parsed;
    if (numeric !== value) onValueChange(numeric);
  };

  return (
    <input
      {...rest}
      ref={inputRef}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      value={raw}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
    />
  );
};
