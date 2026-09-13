export function StreamWave({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <svg
        viewBox="0 0 120 24"
        className="h-6 w-[120px] overflow-visible text-ink/70"
        aria-hidden="true"
      >
        <path
          className="wave-path"
          d="M0 12 Q 7.5 2, 15 12 T 30 12 T 45 12 T 60 12 T 75 12 T 90 12 T 105 12 T 120 12 T 135 12 T 150 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          className="wave-path wave-path-2"
          d="M0 12 Q 7.5 20, 15 12 T 30 12 T 45 12 T 60 12 T 75 12 T 90 12 T 105 12 T 120 12 T 135 12 T 150 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.45"
        />
      </svg>
      <span className="text-sm text-ink/60">{label}</span>
    </div>
  );
}
