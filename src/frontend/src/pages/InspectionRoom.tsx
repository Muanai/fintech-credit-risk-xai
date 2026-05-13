import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, RadarChart,
  PolarGrid, PolarAngleAxis, Radar,
} from 'recharts'
import { TopBar } from '../components/layout/TopBar'
import { StatusBadge } from '../components/audit/StatusBadge'
import { useAuditStore } from '../store/useAuditStore'
import { FEATURE_META } from '../types/audit'
import type { AuditResult, FeatureKey } from '../types/audit'

// ── Helpers ────────────────────────────────────────────────────────────────

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
          {p.name ? `${p.name}: ` : ''}{typeof p.value === 'number' ? p.value.toFixed(4) : p.value}
        </div>
      ))}
    </div>
  )
}

// ── Risk gauge (horizontal) ────────────────────────────────────────────────

function RiskGauge({ prob, status }: { prob: number; status: string }) {
  const pct = prob * 100
  const color =
    status === 'TOLAK' ? '#e23b4a' :
    prob > 0.4 ? '#b09000' : '#00a87e'

  const zones = [
    { label: 'Aman',    pct: 40,    color: 'rgba(0,168,126,0.3)' },
    { label: 'Waspada', pct: 38.55, color: 'rgba(176,144,0,0.3)' },
    { label: 'Tolak',   pct: 21.45, color: 'rgba(226,59,74,0.3)' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Track */}
      <div style={{
        position: 'relative',
        height: 12,
        borderRadius: 999,
        overflow: 'hidden',
        display: 'flex',
      }}>
        {zones.map((z, i) => (
          <div key={i} style={{
            width: `${z.pct}%`, height: '100%',
            background: z.color,
            borderRight: i < zones.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
          }} />
        ))}

        {/* Needle */}
        <div style={{
          position: 'absolute',
          left: `calc(${Math.min(pct, 99)}% - 2px)`,
          top: 0, bottom: 0,
          width: 4,
          background: color,
          borderRadius: 999,
          boxShadow: `0 0 8px ${color}`,
          transition: 'left 0.5s ease',
        }} />
      </div>

      {/* Labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--on-dark-dim)' }}>
        <span style={{ color: '#00c896' }}>0% — Aman</span>
        <span style={{ color: color, fontWeight: 700, fontSize: 14 }}>
          {pct.toFixed(1)}%
        </span>
        <span style={{ color: '#ff5060' }}>Batas 78.5%</span>
      </div>

      {/* Zone markers */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          { label: 'Zona Aman',    range: '0–40%',     color: '#00c896' },
          { label: 'Zona Waspada', range: '40–78.5%',  color: '#d4ae00' },
          { label: 'Zona Tolak',   range: '>78.5%',    color: '#ff5060' },
        ].map(z => (
          <div key={z.label} style={{
            flex: 1, padding: '8px 12px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 'var(--r-md)',
          }}>
            <div style={{ fontSize: 10, color: z.color, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {z.label}
            </div>
            <div style={{ fontSize: 12, color: 'var(--on-dark-dim)', marginTop: 2 }}>{z.range}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── SHAP full bar chart ────────────────────────────────────────────────────

function ShapFullChart({ shapTop }: { shapTop: Record<string, number> }) {
  const data = Object.entries(shapTop)
    .sort((a, b) => b[1] - a[1])
    .map(([feat, val]) => ({
      feat: feat.length > 28 ? feat.slice(0, 26) + '…' : feat,
      val: +val.toFixed(4),
      abs: Math.abs(val),
      fill: val > 0 ? '#e23b4a' : '#00a87e',
    }))

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 60, left: 8, bottom: 4 }}
        barSize={14}
      >
        <XAxis
          type="number"
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
          axisLine={false} tickLine={false}
        />
        <YAxis
          type="category" dataKey="feat" width={200}
          tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
          axisLine={false} tickLine={false}
        />
        <Tooltip content={<DarkTooltip />} />
        <Bar dataKey="val" radius={[0, 6, 6, 0]} name="SHAP Value" label={{
          position: 'right',
          formatter: (v: number) => v > 0 ? `+${v.toFixed(4)}` : v.toFixed(4),
          fill: 'rgba(255,255,255,0.4)',
          fontSize: 11,
        }}>
          {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Risk radar (normalized SHAP magnitude per feature) ────────────────────

function RiskRadar({ shapTop }: { shapTop: Record<string, number> }) {
  const entries = Object.entries(shapTop).slice(0, 6)
  const maxAbs  = Math.max(...entries.map(([, v]) => Math.abs(v)), 0.001)

  const data = entries.map(([feat, val]) => ({
    feat: feat.length > 18 ? feat.slice(0, 16) + '…' : feat,
    value: Math.round((Math.abs(val) / maxAbs) * 100),
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke="rgba(255,255,255,0.07)" />
        <PolarAngleAxis
          dataKey="feat"
          tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
        />
        <Radar
          name="Risk Impact"
          dataKey="value"
          stroke="#494fdf"
          fill="#494fdf"
          fillOpacity={0.25}
          strokeWidth={2}
        />
        <Tooltip content={<DarkTooltip />} formatter={(v: number) => [`${v}%`, 'Kontribusi']} />
      </RadarChart>
    </ResponsiveContainer>
  )
}

// ── Feature detail table ───────────────────────────────────────────────────

function FeatureTable({ shapTop, dominantFeat, dominantValue }: {
  shapTop: Record<string, number>
  dominantFeat: string
  dominantValue: string
}) {
  const rows = Object.entries(shapTop)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Fitur</th>
          <th>Deskripsi</th>
          <th>SHAP Value</th>
          <th>Arah Risiko</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([feat, val], i) => {
          const meta    = FEATURE_META[feat as FeatureKey]
          const isTop   = i === 0
          const isDanger = val > 0

          return (
            <tr key={feat} style={{
              background: isTop ? 'rgba(226,59,74,0.05)' : 'transparent',
            }}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isTop && (
                    <span style={{
                      fontSize: 9, background: 'rgba(226,59,74,0.2)',
                      color: '#ff5060', padding: '2px 6px',
                      borderRadius: 999, fontWeight: 700,
                      letterSpacing: '0.05em', flexShrink: 0,
                    }}>
                      TOP
                    </span>
                  )}
                  <span style={{
                    color: isTop ? 'var(--on-dark)' : 'var(--on-dark-mute)',
                    fontWeight: isTop ? 600 : 400,
                    fontSize: 13,
                  }}>
                    {meta?.label ?? feat}
                  </span>
                </div>
              </td>
              <td style={{ fontSize: 12, color: 'var(--on-dark-dim)', maxWidth: 220 }}>
                {isTop ? dominantValue : (meta?.description ?? '—')}
              </td>
              <td>
                <span style={{
                  fontWeight: 600, fontSize: 13,
                  color: isDanger ? '#ff5060' : '#00c896',
                  fontFamily: 'monospace',
                }}>
                  {val > 0 ? '+' : ''}{val.toFixed(4)}
                </span>
              </td>
              <td>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: isDanger ? '#ff5060' : '#00c896',
                  letterSpacing: '0.04em',
                }}>
                  {isDanger ? '▲ Naik' : '▼ Turun'}
                </span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Decision header ────────────────────────────────────────────────────────

function DecisionBanner({ result }: { result: AuditResult }) {
  const isReject  = result.status === 'TOLAK'
  const isWarn    = result.prob > 0.4 && !isReject
  const bgColor   = isReject ? 'rgba(226,59,74,0.08)' : isWarn ? 'rgba(176,144,0,0.06)' : 'rgba(0,168,126,0.06)'
  const border    = isReject ? 'rgba(226,59,74,0.25)' : isWarn ? 'rgba(176,144,0,0.2)' : 'rgba(0,168,126,0.2)'
  const iconColor = isReject ? '#ff5060' : isWarn ? '#d4ae00' : '#00c896'
  const icon      = isReject ? '✕' : isWarn ? '⚠' : '✓'
  const headline  = isReject
    ? 'Permohonan Kredit DITOLAK'
    : isWarn
    ? 'Permohonan Diluluskan — Pemantauan Ketat'
    : 'Permohonan Kredit DILULUSKAN'

  return (
    <div style={{
      padding: '20px 24px',
      background: bgColor,
      border: `1px solid ${border}`,
      borderRadius: 'var(--r-lg)',
      display: 'flex', alignItems: 'center', gap: 20,
    }}>
      <div style={{
        width: 48, height: 48,
        borderRadius: '50%',
        background: `${iconColor}20`,
        border: `2px solid ${iconColor}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, color: iconColor, flexShrink: 0,
      }}>
        {icon}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: 18, fontWeight: 600,
          color: iconColor,
          fontFamily: 'General Sans, sans-serif',
          letterSpacing: '-0.01em',
          marginBottom: 4,
        }}>
          {headline}
        </div>
        <div style={{ fontSize: 13, color: 'var(--on-dark-dim)' }}>
          Probabilitas gagal bayar: <strong style={{ color: iconColor }}>
            {(result.prob * 100).toFixed(1)}%
          </strong>
          {' '}· Batas penolakan sistem: <strong style={{ color: 'var(--on-dark)' }}>78.5%</strong>
          {' '}· Faktor dominan: <strong style={{ color: 'var(--on-dark)' }}>{result.feat_name}</strong>
        </div>
      </div>

      <StatusBadge status={result.status} prob={result.prob} />
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyState({ onBack }: { onBack: () => void }) {
  return (
    <div style={{
      padding: '80px 32px',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 16, textAlign: 'center',
    }}>
      <div style={{ fontSize: 48, opacity: 0.15 }}>⊕</div>
      <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--on-dark)' }}>
        Tidak ada nasabah yang dipilih
      </div>
      <div style={{ fontSize: 14, color: 'var(--on-dark-dim)', maxWidth: 380 }}>
        Pilih nasabah dari halaman Audit Batch atau Dashboard
        untuk melihat detail inspeksi lengkap.
      </div>
      <button className="btn-primary" onClick={onBack} style={{ marginTop: 8 }}>
        ← Kembali ke Audit Batch
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────

export default function InspectionRoom() {
  const navigate = useNavigate()
  const { selectedNasabah, setSimBaseline } = useAuditStore()

  const handleSimulate = () => {
    if (selectedNasabah) {
      setSimBaseline(selectedNasabah)
      navigate('/simulate')
    }
  }

  if (!selectedNasabah) {
    return (
      <>
        <TopBar title="Inspection Room" subtitle="Detail analisis nasabah tunggal" />
        <div className="page">
          <EmptyState onBack={() => navigate('/audit')} />
        </div>
      </>
    )
  }

  const r = selectedNasabah

  return (
    <>
      <TopBar
        title="Inspection Room"
        subtitle={`Nasabah #${r.idx} · req: ${r.request_id.slice(0, 8)}…`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-soft" onClick={() => navigate('/audit')}
              style={{ height: 36, fontSize: 13 }}>
              ← Audit Batch
            </button>
            <button className="btn-cobalt" onClick={handleSimulate}
              style={{ height: 36, fontSize: 13 }}>
              ⊛ What-If Simulation
            </button>
          </div>
        }
      />

      <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Decision banner ─────────────────────────────────────────── */}
        <DecisionBanner result={r} />

        {/* ── Row 1: Gauge + Radar ─────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 12 }}>

          {/* Risk gauge */}
          <div className="card">
            <div className="metric-label" style={{ marginBottom: 16 }}>
              Posisi Risiko pada Skala Sistem
            </div>
            <RiskGauge prob={r.prob} status={r.status} />

            {/* Quick stats below gauge */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10, marginTop: 20,
            }}>
              {[
                {
                  label: 'Probabilitas',
                  value: `${(r.prob * 100).toFixed(1)}%`,
                  color: r.status === 'TOLAK' ? '#ff5060' : r.prob > 0.4 ? '#d4ae00' : '#00c896',
                },
                {
                  label: 'Keputusan',
                  value: r.status,
                  color: r.status === 'TOLAK' ? '#ff5060' : '#00c896',
                },
                {
                  label: 'Faktor Utama',
                  value: r.feat_name,
                  color: 'var(--on-dark)',
                  small: true,
                },
              ].map(m => (
                <div key={m.label} style={{
                  padding: '12px 14px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 'var(--r-md)',
                }}>
                  <div className="metric-label">{m.label}</div>
                  <div style={{
                    fontSize: m.small ? 12 : 20,
                    fontWeight: 600, color: m.color,
                    fontFamily: 'General Sans, sans-serif',
                    marginTop: 4, lineHeight: 1.2,
                  }}>
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Radar */}
          <div className="card">
            <div className="metric-label" style={{ marginBottom: 8 }}>
              Profil Risiko (Radar SHAP)
            </div>
            <div style={{ fontSize: 12, color: 'var(--on-dark-dim)', marginBottom: 4 }}>
              Magnitude kontribusi per fitur (dinormalisasi)
            </div>
            <RiskRadar shapTop={r.shap_top} />
            <div style={{
              marginTop: 8, fontSize: 12, color: 'var(--on-dark-dim)',
              padding: '10px 12px',
              background: 'rgba(73,79,223,0.08)',
              border: '1px solid rgba(73,79,223,0.2)',
              borderRadius: 'var(--r-md)',
            }}>
              Semakin besar area radar, semakin besar dampak gabungan fitur terhadap risiko.
            </div>
          </div>
        </div>

        {/* ── Row 2: SHAP full chart ────────────────────────────────────── */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div className="metric-label">Analisis SHAP — Semua Fitur</div>
              <div style={{ fontSize: 12, color: 'var(--on-dark-dim)', marginTop: 2 }}>
                Merah ▲ = mendorong probabilitas naik (risiko lebih tinggi) ·
                Hijau ▼ = mendorong probabilitas turun (risiko lebih rendah)
              </div>
            </div>
            <div style={{
              display: 'flex', gap: 12, alignItems: 'center',
              fontSize: 12, color: 'var(--on-dark-dim)',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#e23b4a', display: 'inline-block' }} />
                Naik risiko
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#00a87e', display: 'inline-block' }} />
                Turun risiko
              </span>
            </div>
          </div>
          <ShapFullChart shapTop={r.shap_top} />
        </div>

        {/* ── Row 3: Feature detail table ──────────────────────────────── */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <div className="metric-label" style={{ marginBottom: 16 }}>
            Tabel Detail Kontribusi Fitur
          </div>
          <FeatureTable
            shapTop={r.shap_top}
            dominantFeat={r.feat_name}
            dominantValue={r.value_meaning}
          />
        </div>

        {/* ── Row 4: Legal audit report ─────────────────────────────────── */}
        <div className="card" style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div className="metric-label">Laporan Audit Hukum Otomatis</div>
              <div style={{ fontSize: 12, color: 'var(--on-dark-dim)', marginTop: 2 }}>
                Dihasilkan oleh Llama 3.2 · Referensi POJK 40/2024 via ChromaDB RAG
              </div>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700,
              background: 'rgba(73,79,223,0.15)',
              color: 'var(--primary-bright)',
              padding: '4px 10px', borderRadius: 999,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              AI Generated
            </span>
          </div>

          <div className="report-box">
            {r.report.split('\n\n').map((para, i) => (
              <p key={i} style={{ marginBottom: i < r.report.split('\n\n').length - 1 ? '1em' : 0 }}>
                {para}
              </p>
            ))}
          </div>

          {/* Disclaimer */}
          <div style={{
            marginTop: 14,
            padding: '10px 14px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 'var(--r-md)',
            fontSize: 11,
            color: 'var(--on-dark-dim)',
            lineHeight: 1.5,
          }}>
            ⚠ Laporan ini dihasilkan secara otomatis sebagai panduan awal audit.
            Keputusan kredit final harus divalidasi oleh analis manusia sesuai SOP perusahaan.
            Referensi pasal merujuk pada POJK 40 Tahun 2024 tentang LPBBTI.
          </div>
        </div>

        {/* ── CTA bottom ───────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 12,
          padding: '16px 0 8px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <button className="btn-soft" onClick={() => navigate('/audit')}
            style={{ fontSize: 13 }}>
            ← Kembali ke Batch
          </button>
          <button className="btn-cobalt" onClick={handleSimulate}
            style={{ fontSize: 13 }}>
            ⊛ Buka What-If Simulation
          </button>
          <button className="btn-soft" onClick={() => navigate('/single')}
            style={{ fontSize: 13, marginLeft: 'auto' }}>
            + Audit Nasabah Baru
          </button>
        </div>

      </div>
    </>
  )
}