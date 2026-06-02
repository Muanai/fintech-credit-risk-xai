interface SpinnerProps {
  label?: string
  size?:  number
}

export function LoadingSpinner({ label = 'Memproses...', size = 28 }: SpinnerProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 14, padding: 48,
    }}>
      <svg width={size} height={size} viewBox="0 0 28 28"
        style={{ animation: 'spin 0.8s linear infinite' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <circle cx="14" cy="14" r="11"
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
        <circle cx="14" cy="14" r="11"
          fill="none" stroke="var(--primary-bright)" strokeWidth="2.5"
          strokeDasharray="18 52" strokeLinecap="round" />
      </svg>
      {label && (
        <span style={{ fontSize: 13, color: 'var(--on-dark-dim)', letterSpacing: '0.02em' }}>
          {label}
        </span>
      )}
    </div>
  )
}

interface SkeletonProps {
  height?:       number
  width?:        string
  borderRadius?: string
}

export function Skeleton({ height = 16, width = '100%', borderRadius = '8px' }: SkeletonProps) {
  return <div className="skeleton" style={{ height, width, borderRadius }} />
}

export function MetricSkeleton() {
  return (
    <div className="metric-card" style={{ gap: 10 }}>
      <Skeleton height={11} width="55%" borderRadius="6px" />
      <Skeleton height={32} width="70%" borderRadius="6px" />
      <Skeleton height={11} width="40%" borderRadius="6px" />
    </div>
  )
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Skeleton height={16} width="40%" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={13} width={`${75 - i * 10}%`} />
      ))}
    </div>
  )
}