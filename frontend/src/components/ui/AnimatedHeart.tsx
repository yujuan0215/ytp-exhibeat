import { useEffect, useMemo, useState } from "react";

type AnimatedHeartProps = {
  checked: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  ariaLabel?: string;
  className?: string;
  size?: number;
  color?: string;
  disabled?: boolean;
};

export function AnimatedHeart({
  checked,
  onClick,
  title,
  ariaLabel,
  className = "",
  size = 20,
  color = "#df8eff",
  disabled = false,
}: AnimatedHeartProps) {
  const [celebrateKey, setCelebrateKey] = useState(0);

  useEffect(() => {
    if (checked) setCelebrateKey((prev) => prev + 1);
  }, [checked]);

  const styleVars = useMemo(
    () =>
      ({
        "--heart-size": `${size}px`,
        "--heart-color": color,
      }) as React.CSSProperties,
    [color, size],
  );

  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel ?? title}
      aria-pressed={checked}
      onClick={onClick}
      disabled={disabled}
      className={`heart-container ${className}`.trim()}
      data-checked={checked ? "true" : "false"}
      style={styleVars}
    >
      <div className="svg-container">
        <svg xmlns="http://www.w3.org/2000/svg" className="svg-outline" viewBox="0 0 24 24">
          <path d="M17.5,1.917a6.4,6.4,0,0,0-5.5,3.3,6.4,6.4,0,0,0-5.5-3.3A6.8,6.8,0,0,0,0,8.967c0,4.547,4.786,9.513,8.8,12.88a4.974,4.974,0,0,0,6.4,0C19.214,18.48,24,13.514,24,8.967A6.8,6.8,0,0,0,17.5,1.917Zm-3.585,18.4a2.973,2.973,0,0,1-3.83,0C4.947,16.006,2,11.87,2,8.967a4.8,4.8,0,0,1,4.5-5.05A4.8,4.8,0,0,1,11,8.967a1,1,0,0,0,2,0,4.8,4.8,0,0,1,4.5-5.05A4.8,4.8,0,0,1,22,8.967C22,11.87,19.053,16.006,13.915,20.313Z" />
        </svg>
        <svg xmlns="http://www.w3.org/2000/svg" className="svg-filled" viewBox="0 0 24 24">
          <path d="M17.5,1.917a6.4,6.4,0,0,0-5.5,3.3,6.4,6.4,0,0,0-5.5-3.3A6.8,6.8,0,0,0,0,8.967c0,4.547,4.786,9.513,8.8,12.88a4.974,4.974,0,0,0,6.4,0C19.214,18.48,24,13.514,24,8.967A6.8,6.8,0,0,0,17.5,1.917Z" />
        </svg>
        {checked ? (
          <svg key={celebrateKey} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="svg-celebrate">
            <line x1="10" y1="10" x2="20" y2="20" />
            <line x1="10" y1="50" x2="24" y2="50" />
            <line x1="20" y1="82" x2="32" y2="70" />
            <line x1="90" y1="10" x2="80" y2="20" />
            <line x1="90" y1="50" x2="76" y2="50" />
            <line x1="80" y1="82" x2="68" y2="70" />
          </svg>
        ) : null}
      </div>
    </button>
  );
}
