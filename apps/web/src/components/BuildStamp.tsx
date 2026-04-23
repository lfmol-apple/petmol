import { getBuildInfo } from '@/lib/buildInfo';

export function BuildStamp() {
  const buildInfo = getBuildInfo();

  return (
    <div
      className="pointer-events-none fixed bottom-2 right-2 z-[9999] rounded-full border border-slate-200/70 bg-white/90 px-2.5 py-1 text-[10px] font-semibold tracking-[0.04em] text-slate-600 shadow-sm backdrop-blur-sm"
      data-build-stamp={buildInfo.id}
      aria-label={buildInfo.label}
    >
      {buildInfo.label}
    </div>
  );
}