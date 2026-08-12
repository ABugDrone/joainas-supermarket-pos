import React from 'react';

interface HeaderLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtext?: boolean;
  showAddress?: boolean;
  customAddress?: string;
  layout?: 'horizontal' | 'vertical';
}

export const HeaderLogo: React.FC<HeaderLogoProps> = ({
  size = 'md',
  showSubtext = true,
  showAddress = false,
  customAddress = 'Behind Fire Service, Gimba Road, Jimeta Yola. Adamawa State.',
  layout = 'horizontal',
}) => {
  let scaleClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
  }[size];

  let textClasses = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-2xl',
    xl: 'text-3xl',
  }[size];

  let subtextClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-lg',
  }[size];

  let addressClasses = {
    sm: 'text-[11px]',
    md: 'text-xs',
    lg: 'text-sm',
    xl: 'text-base',
  }[size];

  return (
    <div
      className={`flex ${
        layout === 'vertical'
          ? 'flex-col items-center text-center gap-2'
          : 'items-center gap-3'
      }`}
    >
      {/* Real Joainas Mart Logo */}
      <img
        src="/logo.png"
        alt="Joainas Mart Logo"
        className={`${scaleClasses} rounded-xl object-contain flex-shrink-0`}
      />

      {/* Brand Title */}
      <div className={`flex flex-col ${layout === 'vertical' ? 'items-center text-center' : 'items-start text-left'}`}>
        <div className="flex items-center gap-1.5 leading-none">
          <span className={`tracking-tight font-extrabold text-[var(--text-primary)] ${textClasses}`}>
            JOAINAS
          </span>
          <span
            className={`font-extrabold rounded-md bg-gradient-to-r from-[var(--accent-orange)] to-[var(--accent-orange-hover)] px-2 py-0.5 text-white tracking-wider uppercase shadow-sm ${
              size === 'sm' ? 'text-[11px]' : size === 'md' ? 'text-xs' : size === 'lg' ? 'text-sm' : 'text-base'
            }`}
          >
            MART
          </span>
        </div>

        {showSubtext && (
          <span className={`font-semibold text-[var(--accent-color)] tracking-wide uppercase mt-0.5 ${subtextClasses}`}>
            Seafoods • Frozen Foods • Groceries
          </span>
        )}

        {showAddress && (
          <span className={`text-[var(--text-muted)] font-medium leading-tight mt-0.5 ${addressClasses}`}>
            {customAddress}
          </span>
        )}
      </div>
    </div>
  );
};
