import { InputHTMLAttributes } from "react";

interface CarbonCheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function CarbonCheckbox({ label, className = "", ...props }: CarbonCheckboxProps) {
  const checkboxClasses = `
    appearance-none h-5 w-5 border-2 border-ui-04 rounded bg-field-01
    checked:bg-interactive-01 checked:border-interactive-01
    hover:border-interactive-01
    focus:outline-none focus:ring-2 focus:ring-interactive-01 focus:ring-offset-2 focus:ring-offset-layer-01
    cursor-pointer transition-all relative
    checked:after:content-['✓'] checked:after:absolute checked:after:text-white checked:after:text-xs
    checked:after:left-1/2 checked:after:top-1/2 checked:after:-translate-x-1/2 checked:after:-translate-y-1/2
    disabled:opacity-50 disabled:cursor-not-allowed
    ${className}
  `.trim().replace(/\s+/g, ' ');

  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        className={checkboxClasses}
        {...props}
      />
      {label && <span className="carbon-type-body-01 text-text-01 select-none">{label}</span>}
    </label>
  );
}
