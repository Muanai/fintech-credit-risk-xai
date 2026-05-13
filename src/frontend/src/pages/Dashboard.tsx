import { useMemo } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/layout/TopBar'
import { StatusBadge } from '../components/audit/StatusBadge'
import { MetricSkeleton } from '../components/shared/LoadingSpinner'
import { useAuditStore } from '../store/useAuditStore'
import { computePulse } from '../types/audit'
import type { AuditResult } from '../types/audit'

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (n: number, dec = 1) => n.toFixed(dec)
const pct = (n: number) => `${fmt(n)}%`

function ProbBar({ prob, status }: { prob: number; status: string }) {
  const color = status === 'TOLAK' ? '#e23b4a' : prob > 0.4 ? '#b09000' : '#00a87e'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <div style={{
        flex: 1, height: 4,
        background: 'rgba(255,255,255,0.07)',
        borderRadius: 999, overflow: 'hidden',
      }}>
        <div style={{
          width: `${prob * 100}%`, height: '100%',
          background: color, borderRadius: 999,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ fontSize: 12, color, fontWeight: 600, width: 38, textAlign: 'right' }}>
        {pct(prob * 100)}
      </span>
    </div>
  )
}

function DarkTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#16181a', border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 10, padding: '10px 14px', fontSize: 13,
    }}>
      {label && <div style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color ?? '#fff', fontWeight: 600 }}>
          {p.name ? `${p.name}: ` : ''}{typeof p.value === 'number' ? fmt(p.value) : p.value}
        </div>
      ))}
    </div>
  )
}

function PulseMetricCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <span className="metric-value" style={{ color: color ?? 'var(--on-dark)', fontSize: 28 }}>
        {value}
      </span>
      {sub && <span className="metric-sub">{sub}</span>}
    </div>
  )
}

function RiskDonut({ approve, warn, reject }: { approve: number; warn: number; reject: number }) {
  const data = [
    { name: 'Lulus',   value: approve, color: '#00a87e' },
    { name: 'Waspada', value: warn,    color: '#b09000' },
    { name: 'Tolak',   value: reject,  color: '#e23b4a' },
  ].filter(d => d.value > 0)

  if (!data.length) return (
    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: 'var(--on-dark-dim)', fontSize: 13 }}>Belum ada data</span>
    </div>
  )

  return (
    <ResponsiveContainer width="100%" height={160}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%"
          innerRadius={48} outerRadius={68} paddingAngle={3} dataKey="value">
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
        <Tooltip content={<DarkTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function ProbDistribution({ results }: { results: AuditResult[] }) {
  const bins = Array.from({ length: 10 }, (_, i) => ({
    label: `${i * 10}–${(i + 1) * 10}%`,
    count: 0,
    fill: i >= 8 ? '#e23b4a' : i >= 4 ? '#b09000' : '#00a87e',
  }))
  results.forEach(r => {
    const idx = Math.min(Math.floor(r.prob * 10), 9)
    bins[idx].count++
  })

  return (
    <ResponsiveContainer width="100%" height={130}>
      <BarChart data={bins} barSize={14} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
        <XAxis dataKey="label"
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }}
          axisLine={false} tickLine={false} interval={1} />
        <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
          axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={<DarkTooltip />} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Nasabah">
          {bins.map((b, i) => <Cell key={i} fill={b.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function ProbTimeline({ results }: { results: AuditResult[] }) {
  const data = results.slice(0, 30).reverse().map((r, i) => ({
    i: i + 1,
    prob: +(r.prob * 100).toFixed(1),
    threshold: 78.5,
  }))

  return (
    <ResponsiveContainer width="100%" height={130}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
        <defs>
          <linearGradient id="probGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#494fdf" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#494fdf" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis dataKey="i" hide />
        <YAxis domain={[0, 100]}
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
          axisLine={false} tickLine={false} />
        <Tooltip content={<DarkTooltip />} formatter={(v: number) => [`${v}%`]} />
        <Area type="monotone" dataKey="prob"
          stroke="#494fdf" strokeWidth={2}
          fill="url(#probGrad)" name="Prob %" />
        <Area type="monotone" dataKey="threshold"
          stroke="#e23b4a" strokeWidth={1}
          strokeDasharray="4 3" fill="none" name="Batas" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function KillerFeatureBar({ results }: { results: AuditResult[] }) {
  const counts: Record<string, number> = {}
  results.forEach(r => {
    const top = Object.entries(r.shap_top)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]
    if (top) counts[top[0]] = (counts[top[0]] ?? 0) + 1
  })

  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const max = ranked[0]?.[1] ?? 1

  if (!ranked.length) return (
    <div style={{ color: 'var(--on-dark-dim)', fontSize: 13, padding: '16px 0' }}>
      Belum ada data
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {ranked.map(([feat, count], i) => (
        <div key={feat} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{
              fontSize: 12,
              color: i === 0 ? 'var(--on-dark)' : 'var(--on-dark-mute)',
              fontWeight: i === 0 ? 600 : 400,
              maxWidth: 180,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {i === 0 && <span style={{ color: '#e23b4a', marginRight: 4 }}>★</span>}
              {feat}
            </span>
            <span style={{ fontSize: 12, color: 'var(--on-dark-dim)' }}>{count}×</span>
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 999 }}>
            <div style={{
              width: `${(count / max) * 100}%`, height: '100%',
              background: i === 0 ? '#e23b4a' : '#494fdf',
              borderRadius: 999, opacity: 1 - i * 0.15,
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function RecentTable({ results, onInspect }: {
  results: AuditResult[]
  onInspect: (r: AuditResult) => void
}) {
  const recent = results.slice(0, 10)

  if (!recent.length) return (
    <div style={{
      padding: '48px 0', display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 12, textAlign: 'center',
    }}>
      <div style={{ fontSize: 32, opacity: 0.3 }}>◎</div>
      <div style={{ fontSize: 15, color: 'var(--on-dark)', fontWeight: 500 }}>
        Belum ada data audit
      </div>
      <div style={{ fontSize: 13, color: 'var(--on-dark-dim)', marginBottom: 8 }}>
        Jalankan audit pertama untuk melihat Global Risk Pulse
      </div>
    </div>
  )

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Status</th>
          <th>Prob Gagal Bayar</th>
          <th>Faktor Dominan</th>
          <th>Nilai</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {recent.map((r, i) => (
          <tr key={`${r.request_id}-${r.idx}-${i}`}>
            <td style={{ color: 'var(--on-dark-dim)', width: 32 }}>{i + 1}</td>
            <td><StatusBadge status={r.status} prob={r.prob} size="sm" /></td>
            <td style={{ width: 200 }}><ProbBar prob={r.prob} status={r.status} /></td>
            <td style={{
              maxWidth: 200, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: 'var(--on-dark)',
            }}>
              {r.feat_name}
            </td>
            <td style={{ fontSize: 12 }}>{r.value_meaning}</td>
            <td>
              <button
                className="btn-pill-sm"
                onClick={() => onInspect(r)}
                style={{ fontSize: 12, height: 28 }}
              >
                Inspect →
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const { auditHistory, setSelectedNasabah } = useAuditStore()
  const pulse = useMemo(() => computePulse(auditHistory), [auditHistory])

  const approveCount = auditHistory.filter(r => r.status === 'LULUS' && r.prob <= 0.4).length
  const warnCount    = auditHistory.filter(r => r.status === 'LULUS' && r.prob > 0.4).length
  const rejectCount  = auditHistory.filter(r => r.status === 'TOLAK').length
  const isEmpty      = auditHistory.length === 0

  const handleInspect = (r: AuditResult) => {
    setSelectedNasabah(r)
    navigate('/inspect')
  }

  return (
    <>
      <TopBar
        title="Dashboard"
        subtitle="Global Risk Pulse — ringkasan seluruh sesi audit"
        actions={
          <button
            className="btn-cobalt"
            onClick={() => navigate('/audit')}
            style={{ height: 36, fontSize: 13 }}
          >
            + Audit Baru
          </button>
        }
      />

      <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Row 1: 6 metric cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 10,
        }}>
          {isEmpty
            ? Array.from({ length: 6 }).map((_, i) => <MetricSkeleton key={i} />)
            : <>
                <PulseMetricCard label="Total Diaudit"    value={String(pulse!.total)}             sub="nasabah sesi ini" />
                <PulseMetricCard label="Approval Rate"    value={pct(pulse!.approvalRate)}          sub={`${auditHistory.filter(r => r.status === 'LULUS').length} lulus`}  color="#00c896" />
                <PulseMetricCard label="Default Rate"     value={pct(pulse!.defaultRate)}           sub={`${rejectCount} ditolak`} color={pulse!.defaultRate > 20 ? '#e23b4a' : 'var(--on-dark)'} />
                <PulseMetricCard label="Avg Prob Gagal"   value={pct(pulse!.avgProbability)}        sub="rata-rata batch"  color={pulse!.avgProbability > 50 ? '#e23b4a' : pulse!.avgProbability > 25 ? '#d4ae00' : 'var(--on-dark)'} />
                <PulseMetricCard label="Charge-Off Proxy" value={pct(pulse!.chargeOffProxy)}        sub="prob > 90%"       color={pulse!.chargeOffProxy > 10 ? '#e23b4a' : 'var(--on-dark)'} />
                <PulseMetricCard label="Roll Rate"        value={pct(pulse!.rollRate)}              sub="zona waspada"     color={pulse!.rollRate > 30 ? '#d4ae00' : 'var(--on-dark)'} />
              </>
          }
        </div>

        {/* Row 2: Donut | Timeline+Distribution | Killer Feature */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 260px', gap: 12 }}>

          {/* Donut */}
          <div className="card" style={{ padding: '20px 16px' }}>
            <div className="metric-label" style={{ marginBottom: 12 }}>Distribusi Status</div>
            <RiskDonut approve={approveCount} warn={warnCount} reject={rejectCount} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {[
                { label: 'Lulus Aman', count: approveCount, color: '#00c896' },
                { label: 'Waspada',    count: warnCount,    color: '#d4ae00' },
                { label: 'Tolak',      count: rejectCount,  color: '#ff5060' },
              ].map(d => (
                <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--on-dark-mute)', flex: 1 }}>{d.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--on-dark)', fontWeight: 600 }}>{d.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline + Distribution stacked */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card" style={{ flex: 1, padding: '16px 20px' }}>
              <div className="metric-label" style={{ marginBottom: 10 }}>Tren Probabilitas (30 terakhir)</div>
              <ProbTimeline results={auditHistory} />
            </div>
            <div className="card" style={{ flex: 1, padding: '16px 20px' }}>
              <div className="metric-label" style={{ marginBottom: 10 }}>Distribusi Probabilitas</div>
              <ProbDistribution results={auditHistory} />
            </div>
          </div>

          {/* Killer feature */}
          <div className="card" style={{ padding: '20px' }}>
            <div className="metric-label" style={{ marginBottom: 4 }}>Fitur Paling Mematikan</div>
            <div style={{ fontSize: 12, color: 'var(--on-dark-dim)', marginBottom: 16 }}>
              Top SHAP contributor per nasabah
            </div>
            <KillerFeatureBar results={auditHistory} />
            {pulse && (
              <div style={{
                marginTop: 20, padding: '12px 14px',
                background: 'rgba(226,59,74,0.08)',
                border: '1px solid rgba(226,59,74,0.2)',
                borderRadius: 'var(--r-md)',
              }}>
                <div style={{
                  fontSize: 10, color: '#ff5060', fontWeight: 600,
                  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4,
                }}>
                  ★ Killer Feature
                </div>
                <div style={{ fontSize: 13, color: 'var(--on-dark)', fontWeight: 600, lineHeight: 1.3 }}>
                  {pulse.topKillerFeature}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Row 3: Recent audit table */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div className="metric-label">Audit Terbaru</div>
              {auditHistory.length > 10 && (
                <div style={{ fontSize: 12, color: 'var(--on-dark-dim)', marginTop: 2 }}>
                  Menampilkan 10 dari {auditHistory.length}
                </div>
              )}
            </div>
            {auditHistory.length > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-soft" onClick={() => navigate('/audit')}
                  style={{ height: 34, fontSize: 13 }}>
                  Audit Baru
                </button>
                <button className="btn-soft" onClick={() => navigate('/audit')}
                  style={{ height: 34, fontSize: 13 }}>
                  Lihat Semua →
                </button>
              </div>
            )}
          </div>

          {isEmpty ? (
            <div style={{
              padding: '48px 0', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 12, textAlign: 'center',
            }}>
              <div style={{ fontSize: 32, opacity: 0.2 }}>◎</div>
              <div style={{ fontSize: 15, color: 'var(--on-dark)', fontWeight: 500 }}>
                Belum ada data audit
              </div>
              <div style={{ fontSize: 13, color: 'var(--on-dark-dim)', marginBottom: 8 }}>
                Jalankan audit pertama untuk melihat Global Risk Pulse
              </div>
              <button className="btn-primary" onClick={() => navigate('/audit')}>
                Mulai Audit Batch
              </button>
            </div>
          ) : (
            <RecentTable results={auditHistory} onInspect={handleInspect} />
          )}
        </div>

      </div>
    </>
  )
}