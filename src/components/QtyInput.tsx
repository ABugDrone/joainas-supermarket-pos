import React from 'react';

interface QtyInputProps {
  value: number;
  onChange: (n: number) => void;
  /** Optional hard cap (e.g. product stock). Services leave this undefined. */
  max?: number;
  className?: string;
  'aria-label'?: string;
}

/**
 * Direct type-in quantity field for the bill (services are sold as "nth"
 * units — 9 hours, 500 pages — so tapping − / + one by one is unusable).
 *
 * Deliberately NOT NumberInput: that component pushes 0 whenever the field is
 * cleared, and updateCartQuantity treats 0 as "delete this line", so typing a
 * multi-digit quantity could wipe the row mid-edit. This one keeps its own
 * draft, only commits values >= 1, and re-syncs from the parent on blur so a
 * value the parent rejected (e.g. more than stock) can never stay on screen.
 */
export const QtyInput: React.FC<QtyInputProps> = ({ value, onChange, max, className, ...rest }) => {
  const initial = value > 0 ? value : 1;
  const [raw, setRaw] = React.useState<string>(String(initial));
  const focusedRef = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Adopt parent changes (scan-added qty, +/- buttons) while not being edited.
  React.useEffect(() => {
    if (!focusedRef.current) setRaw(value > 0 ? String(value) : '1');
  }, [value]);

  const clamp = (n: number): number => {
    let next = Math.max(1, Math.trunc(n));
    if (max !== undefined && Number.isFinite(max) && max >= 1 && next > max) next = Math.trunc(max);
    return next;
  };

  return (
    <input
      {...rest}
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={raw}
      className={className}
      onFocus={(e) => {
        focusedRef.current = true;
        requestAnimationFrame(() => {
          try {
            inputRef.current?.select();
          } catch {
            /* selection is a convenience only */
          }
        });
      }}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 7);
        setRaw(digits);
        if (digits === '') return; // empty draft — commit on blur instead
        const next = clamp(parseInt(digits, 10));
        if (Number.isFinite(next) && next !== value) onChange(next);
      }}
      onBlur={() => {
        focusedRef.current = false;
        // Show what the parent actually holds (it may have rejected/limited us).
        const settled = clamp(value);
        setRaw(String(settled));
      }}
    />
  );
};
