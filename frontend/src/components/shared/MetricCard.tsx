interface Props {
  label:   string
  value:   string | number
  sub?:    string
  status?: 'approve' | 'warn' | 'reject' | 'neutral'
  trend?:  'up' | 'down' | 'flat'
}

const STATUS_COLOR = {
  approve: '#00c896',
  warn:    '#d4ae00',
  reject:  '#ff5060',
  neutral: 'var(--on-dark)',
}

export function MetricCard({ label, value, sub, status = 'neutral', trend }: Props) {
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : null
  const trendColor = trend === 'up' ? '#ff5060' : trend === 'down' ? '#00c896' : undefined

  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="metric-value" style={{ color: STATUS_COLOR[status] }}>
          {value}
        </span>
        {trendIcon && (
          <span style={{ fontSize: 13, color: trendColor, fontWeight: 600 }}>
            {trendIcon}
          </span>
        )}
      </div>
      {sub && <span className="metric-sub">{sub}</span>}
    </div>
  )
}