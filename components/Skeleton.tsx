// First-load placeholders for the main tab pages. A cold load used to
// be a blank page with a centered spinner; now the page frame paints
// immediately with soft blocks where the content will land, which
// reads as "almost there" instead of "starting over". Only shown when
// there is no cached snapshot to paint (see lib/tabCache.ts) — tab
// switches with a warm cache never see these.

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-warm-200 dark:bg-white/10 ${className}`} />
}

export function SkeletonPage({ variant = 'home' }: { variant?: 'home' | 'list' | 'calendar' | 'insights' }) {
  if (variant === 'calendar') {
    return (
      <div className="flex-1 flex flex-col gap-3 p-4" aria-hidden>
        <div className="flex gap-2">
          <SkeletonBlock className="h-9 w-24" />
          <SkeletonBlock className="h-9 w-24" />
          <SkeletonBlock className="h-9 w-24" />
        </div>
        <SkeletonBlock className="flex-1 min-h-[320px]" />
      </div>
    )
  }
  if (variant === 'list') {
    return (
      <div className="p-4 space-y-3 max-w-3xl mx-auto w-full" aria-hidden>
        <SkeletonBlock className="h-8 w-48" />
        <SkeletonBlock className="h-11 w-full" />
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }
  if (variant === 'insights') {
    return (
      <div className="p-4 space-y-4 max-w-5xl mx-auto w-full" aria-hidden>
        <SkeletonBlock className="h-8 w-56" />
        <SkeletonBlock className="h-32 w-full" />
        <div className="grid grid-cols-2 gap-3">
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
        </div>
      </div>
    )
  }
  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto w-full" aria-hidden>
      <SkeletonBlock className="h-8 w-52" />
      <SkeletonBlock className="h-36 w-full" />
      <SkeletonBlock className="h-24 w-full" />
      <div className="grid grid-cols-2 gap-3">
        <SkeletonBlock className="h-20" />
        <SkeletonBlock className="h-20" />
      </div>
      <SkeletonBlock className="h-16 w-full" />
      <SkeletonBlock className="h-16 w-full" />
    </div>
  )
}
