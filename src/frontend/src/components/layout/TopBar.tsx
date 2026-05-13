import { useEffect, useState } from 'react'
import { creditApi } from '../../api/creditApi'

interface Props {
  title:    string
  subtitle?: string
  actions?: React.ReactNode
}

export function TopBar({ title, subtitle, actions }: Props) {
  const [apiOk, setApiOk] = useState<boolean | null>(null)

  useEffect(() => {
    creditApi.health()
      .then(() => setApiOk(true))
      .catch(() => setApiOk(false))
  }, [])

  const dotColor = apiOk === null ? '#8d969e' : apiOk ? '#00c896' : '#ff5060'
  const dotLabel = apiOk === null ? 'Checking...' : apiOk ? 'API Online' : 'API Offline'

  return (
    <div className="topbar">
      {/* Page title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="topbar-title">{title}</div>
        {subtitle && (
          <div style={{ fontSize: 12, color: 'var(--on-dark-dim)', marginTop: 1 }}>
            {subtitle}
          </div>
        )}
      </div>

      {/* Actions slot */}
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {actions}
        </div>
      )}

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: 'var(--hl-dark)', margin: '0 8px' }} />

      {/* API status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: dotColor, flexShrink: 0,
          boxShadow: apiOk ? `0 0 6px ${dotColor}` : 'none',
          transition: 'background 0.3s ease',
        }} />
        <span style={{ fontSize: 12, color: 'var(--on-dark-dim)', whiteSpace: 'nowrap' }}>
          {dotLabel}
        </span>
      </div>
    </div>
  )
}