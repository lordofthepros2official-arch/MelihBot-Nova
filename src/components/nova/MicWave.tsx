/** Mikrofon kaydı sırasında ses seviyesine göre yükselip alçalan dalga. */
export function MicWave({ level, bars = 18 }: { level: number; bars?: number }) {
  return (
    <div className="flex h-6 items-center gap-[3px]">
      {Array.from({ length: bars }).map((_, i) => {
        const center = 1 - Math.abs(i - (bars - 1) / 2) / ((bars - 1) / 2);
        // Sessizlikte orta boy dalga, ses yükseldikçe yükselir.
        const h = 6 + (0.35 + level * 1.6) * 18 * (0.45 + center * 0.55);
        return (
          <span
            key={i}
            className="w-[3px] rounded-full bg-current transition-[height] duration-75"
            style={{ height: `${Math.min(24, h)}px` }}
          />
        );
      })}
    </div>
  );
}
