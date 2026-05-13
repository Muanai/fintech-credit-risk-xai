import { useLocation, useNavigate } from 'react-router-dom'
import { useAuditStore } from '../../store/useAuditStore'

interface NavItem {
  path:    string
  label:   string
  icon:    string
  showBadge?: boolean
}

const NAV: NavItem[] = [
  { path: '/',         label: 'Dashboard',      icon: '▪',  },
  { path: '/audit',    label: 'Audit Batch',     icon: '▪',  showBadge: true },
  { path: '/single',   label: 'Audit Tunggal',   icon: '▪',  },
  { path: '/inspect',  label: 'Inspection Room', icon: '▪',  },
  { path: '/simulate', label: 'What-If Sim',     icon: '▪',  },
]

// Icon map — using simple unicode so no icon lib dep at this stage
const ICON: Record<string, string> = {
  '/':         '⊞',
  '/audit':    '≡',
  '/single':   '◎',
  '/inspect':  '⊕',
  '/simulate': '⊛',
}

export function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { auditHistory, clearHistory } = useAuditStore()

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">
          <span style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>CA</span>
        </div>
        <div>
          <div className="sidebar-logo-text">Credit Auditor</div>
          <div style={{ fontSize: 10, color: 'var(--on-dark-dim)', letterSpacing: '0.04em' }}>
            AI · POJK 40/2024
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <span className="nav-section-label">Navigasi</span>

        {NAV.map((item) => (
          <button
            key={item.path}
            className={`nav-link${isActive(item.path) ? ' active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <span style={{
              width: 20, textAlign: 'center',
              fontSize: 14,
              color: isActive(item.path) ? 'var(--primary-bright)' : 'var(--on-dark-dim)',
            }}>
              {ICON[item.path]}
            </span>
            {item.label}
            {item.showBadge && auditHistory.length > 0 && (
              <span className="nav-badge">{Math.min(auditHistory.length, 99)}</span>
            )}
          </button>
        ))}

        <span className="nav-section-label" style={{ marginTop: 24 }}>Session</span>

        <button
          className="nav-link"
          onClick={clearHistory}
          style={{ opacity: auditHistory.length ? 1 : 0.3 }}
          disabled={!auditHistory.length}
        >
          <span style={{ width: 20, textAlign: 'center', fontSize: 14, color: 'var(--on-dark-dim)' }}>
            ⊗
          </span>
          Hapus History
        </button>
      </nav>

      {/* Footer info */}
      <div style={{
        borderTop: '1px solid var(--hl-dark)',
        paddingTop: 16,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{ fontSize: 10, color: 'var(--on-dark-dim)', padding: '0 12px', lineHeight: 1.6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#00c896', display: 'inline-block',
            }} />
            <span>XGBoost + SHAP</span>
          </div>
          <div style={{ paddingLeft: 12 }}>ChromaDB · Llama 3.2</div>
        </div>
      </div>
    </aside>
  )
}