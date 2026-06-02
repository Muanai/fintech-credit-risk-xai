import { getRiskLevel } from '../../types/audit'
import type { RiskLevel } from '../../types/audit'

interface Props {
  status: 'LULUS' | 'TOLAK'
  prob: number
  size?: 'sm' | 'md'
}

const CONFIG: Record<RiskLevel, { cls: string; label: string; dot: string }> = {
  safe:   { cls: 'badge badge-approve', label: 'Lulus',   dot: '#00c896' },
  warn:   { cls: 'badge badge-warn',    label: 'Waspada', dot: '#d4ae00' },
  danger: { cls: 'badge badge-reject',  label: 'Tolak',   dot: '#ff5060' },
}

export function StatusBadge({ status, prob, size = 'md' }: Props) {
  const level  = getRiskLevel(prob, status)
  const config = CONFIG[level]

  return (
    <span
      className={config.cls}
      style={size === 'sm' ? { fontSize: '10px', padding: '3px 8px' } : {}}
    >
      <span style={{
        width: 5, height: 5,
        borderRadius: '50%',
        background: config.dot,
        display: 'inline-block',
        flexShrink: 0,
      }} />
      {config.label}
    </span>
  )
}