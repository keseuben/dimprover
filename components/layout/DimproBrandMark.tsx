import React from "react";

type DimproBrandMarkProps = {
  size?: number;
  withText?: boolean;
  compact?: boolean;
  className?: string;
  textClassName?: string;
};

export default function DimproBrandMark({
  size = 54,
  withText = true,
  compact = false,
  className = "",
  textClassName = "",
}: DimproBrandMarkProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img
        src="/dimprover-logo.png"
        alt="DIMPROVER hexagon+P embléma"
        width={size}
        height={size}
        className="shrink-0 object-contain drop-shadow-[0_10px_26px_rgba(0,140,255,0.42)]"
      />

      {withText ? (
        <div className={`min-w-0 ${textClassName}`}>
          <div className="text-[28px] font-black leading-none tracking-[0.16em] text-slate-950 dark:text-white">
            DIMPRO<span className="text-sky-500">VER</span>
          </div>
          {!compact ? (
            <div className="mt-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-300">
              <span className="h-px w-8 bg-sky-500" />
              <span>Digitális műszaki projektvezető rendszer</span>
              <span className="h-px w-8 bg-sky-500" />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
