export default function DropBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl border border-cyan-300/30 bg-slate-950 shadow-[0_14px_34px_rgba(8,145,178,0.20)]">
        <svg
          viewBox="0 0 48 48"
          className="h-9 w-9"
          role="img"
          aria-label="DIMPRO Drop"
        >
          <defs>
            <linearGradient id="drop-brand-hex" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
              <stop stopColor="#D9FFFA" />
              <stop offset="0.48" stopColor="#67E8F9" />
              <stop offset="1" stopColor="#2DD4BF" />
            </linearGradient>
          </defs>

          <path
            d="M24 4.5 41 14v20L24 43.5 7 34V14L24 4.5Z"
            fill="#061A2A"
            stroke="url(#drop-brand-hex)"
            strokeWidth="2.6"
            strokeLinejoin="round"
          />

          <path
            d="M22 13.5h4v10h5l-7 7-7-7h5v-10Z"
            fill="#D9FFFA"
          />

          <path
            d="M14.5 31.5v5h19v-5"
            fill="none"
            stroke="#5EEAD4"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div>
        <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-700">DIMPRO</p>
        <p className={`${compact ? "text-base" : "text-lg"} font-black text-slate-950`}>Drop</p>
      </div>
    </div>
  );
}
