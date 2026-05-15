import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/layout/TopBar'
import { StatusBadge } from '../components/audit/StatusBadge'
import { LoadingSpinner } from '../components/shared/LoadingSpinner'
import { useAuditStore } from '../store/useAuditStore'
import { creditApi } from '../api/creditApi'
import { FEATURE_META, FEATURE_KEYS } from '../types/audit'
import type { AuditResult, FeatureKey, NasabahFeatures } from '../types/audit'

// ── Default form values (representative mid-range) ──────────────────────

const DEFAULT_INPUTS: NasabahFeatures = {
  RevolvingUtilizationOfUnsecuredLines:    0.20,
  age:                                      45,
  'NumberOfTime30-59DaysPastDueNotWorse':   0,
  DebtRatio:                                0.35,
  MonthlyIncome:                            6000,
  NumberOfOpenCreditLinesAndLoans:          8,
  NumberOfTimes90DaysLate:                  0,
  NumberRealEstateLoansOrLines:             1,
  'NumberOfTime60-89DaysPastDueNotWorse':   0,
  NumberOfDependents:                       2,
}

// ── Helpers ────────────────────────────────────────────────────────────────

function ProbBar({ prob, status }: { prob: number; status: string }) {
  const color = status === 'TOLAK' ? '#e23b4a' : prob > 0.4 ? '#b09000' : '#00a87e'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--on-dark-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
          Probabilitas Gagal Bayar
        </span>
        <span style={{ fontSize: 28, fontWeight: 600, color, fontFamily: 'General Sans, sans-serif' }}>
          {(prob * 100).toFixed(1)}%
        </span>
      </div>
      <div style={{ position: 'relative', height: 10, borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
          <div style={{ width: '40%',    background: 'rgba(0,168,126,0.2)' }} />
          <div style={{ width: '38.55%', background: 'rgba(176,144,0,0.2)' }} />
          <div style={{ flex: 1,         background: 'rgba(226,59,74,0.2)' }} />
        </div>
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: `${Math.min(prob * 100, 100)}%`,
          background: color, borderRadius: 999,
          transition: 'width 0.5s ease',
        }} />
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: '78.55%',
          width: 2, background: 'rgba(226,59,74,0.8)',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--on-dark-dim)' }}>
        <span style={{ color: '#00c896' }}>0% — Aman</span>
        <span style={{ color: 'rgba(226,59,74,0.8)' }}>Batas 78.5%</span>
        <span style={{ color: '#e23b4a' }}>100%</span>
      </div>
    </div>
  )
}

// ── Form field: number input ───────────────────────────────────────────────

function FormField({
  featureKey,
  value,
  onChange,
  error,
}: {
  featureKey: FeatureKey
  value: number
  onChange: (k: FeatureKey, v: number) => void
  error?: string
}) {
  const meta = FEATURE_META[featureKey]

  const formatStep = () => {
    if (meta.step >= 1)   return '0'
    if (meta.step >= 0.1) return '0.0'
    return '0.00'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{
        fontSize: 12, fontWeight: 600, color: 'var(--on-dark)',
        letterSpacing: '0.01em',
      }}>
        {meta.label}
        {meta.unit && (
          <span style={{
            marginLeft: 6, fontSize: 10, color: 'var(--on-dark-dim)',
            fontWeight: 400, background: 'rgba(255,255,255,0.06)',
            padding: '1px 6px', borderRadius: 999,
          }}>
            {meta.unit}
          </span>
        )}
      </label>
      <input
        type="number"
        className="input-field"
        value={value}
        min={meta.min}
        max={meta.max}
        step={meta.step}
        onChange={e => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v)) onChange(featureKey, v)
        }}
        style={{
          height: 44, fontSize: 14,
          borderColor: error ? 'rgba(226,59,74,0.6)' : undefined,
        }}
      />
      <span style={{ fontSize: 11, color: error ? '#ff5060' : 'var(--on-dark-dim)' }}>
        {error ?? meta.description}
      </span>
    </div>
  )
}

// ── SHAP mini bar ──────────────────────────────────────────────────────────

function ShapMiniBar({ shapTop }: { shapTop: Record<string, number> }) {
  const entries = Object.entries(shapTop)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 5)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.map(([feat, val]) => {
        const meta    = FEATURE_META[feat as FeatureKey]
        const label   = meta?.label ?? feat
        const isRisk  = val > 0
        const absPct  = Math.min(Math.abs(val) / 0.5, 1) * 100   // normalize to ~0.5 max

        return (
          <div key={feat} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{
                fontSize: 12, color: 'var(--on-dark-mute)',
                maxWidth: 220, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {label}
              </span>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: isRisk ? '#ff5060' : '#00c896',
                fontFamily: 'monospace',
              }}>
                {val > 0 ? '+' : ''}{val.toFixed(4)}
              </span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 999 }}>
              <div style={{
                width: `${absPct}%`, height: '100%',
                background: isRisk ? '#e23b4a' : '#00a87e',
                borderRadius: 999,
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Result panel ───────────────────────────────────────────────────────────

function ResultPanel({ result, onInspect, onSimulate }: {
  result: AuditResult
  onInspect: () => void
  onSimulate: () => void
}) {
  const isReject = result.status === 'TOLAK'
  const isWarn   = result.prob > 0.4 && !isReject
  const accent   = isReject ? '#e23b4a' : isWarn ? '#b09000' : '#00a87e'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Decision card */}
      <div style={{
        padding: '20px 24px',
        background: isReject
          ? 'rgba(226,59,74,0.08)'
          : isWarn
          ? 'rgba(176,144,0,0.06)'
          : 'rgba(0,168,126,0.06)',
        border: `1px solid ${accent}40`,
        borderRadius: 'var(--r-lg)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{
            fontSize: 20, fontWeight: 600, color: accent,
            fontFamily: 'General Sans, sans-serif', letterSpacing: '-0.01em',
          }}>
            {isReject
              ? 'Kredit DITOLAK'
              : isWarn
              ? 'Lulus — Waspada'
              : 'Kredit DILULUSKAN'}
          </div>
          <StatusBadge status={result.status} prob={result.prob} />
        </div>
        <ProbBar prob={result.prob} status={result.status} />
      </div>

      {/* Dominant feature */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div className="metric-label" style={{ marginBottom: 8 }}>Faktor Risiko Utama</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--on-dark)', marginBottom: 4 }}>
          {result.feat_name}
        </div>
        <div style={{ fontSize: 13, color: 'var(--on-dark-dim)' }}>
          {result.value_meaning}
        </div>
      </div>

      {/* SHAP top */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div className="metric-label" style={{ marginBottom: 12 }}>Kontribusi SHAP Teratas</div>
        <ShapMiniBar shapTop={result.shap_top} />
        <div style={{ fontSize: 11, color: 'var(--on-dark-dim)', marginTop: 10 }}>
          Merah = mendorong risiko naik · Hijau = turun
        </div>
      </div>

      {/* Legal report */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div className="metric-label" style={{ marginBottom: 12 }}>Laporan Audit POJK 40/2024</div>
        <div className="report-box" style={{ fontSize: 13 }}>
          {result.report.split('\n\n').map((para, i) => (
            <p key={i} style={{ marginBottom: i < result.report.split('\n\n').length - 1 ? '0.9em' : 0 }}>
              {para}
            </p>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn-primary" onClick={onInspect}
          style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}>
          Buka di Inspection Room →
        </button>
        <button className="btn-soft" onClick={onSimulate}
          style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}>
          ⊛ What-If Simulation
        </button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────

export default function SingleAudit() {
  const navigate = useNavigate()
  const { addResults, setSelectedNasabah, setSimBaseline } = useAuditStore()

  const [inputs, setInputs]     = useState<NasabahFeatures>({ ...DEFAULT_INPUTS })
  const [errors, setErrors]     = useState<Partial<Record<FeatureKey, string>>>({})
  const [loading, setLoading]   = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [result, setResult]     = useState<AuditResult | null>(null)

  const handleChange = (k: FeatureKey, v: number) => {
    setInputs(prev => ({ ...prev, [k]: v }))
    setErrors(prev => ({ ...prev, [k]: undefined }))
  }

  const validate = (): boolean => {
    const newErrors: Partial<Record<FeatureKey, string>> = {}
    FEATURE_KEYS.forEach(k => {
      const meta = FEATURE_META[k]
      const v    = inputs[k]
      if (isNaN(v)) {
        newErrors[k] = 'Nilai tidak valid'
      } else if (v < meta.min || v > meta.max) {
        newErrors[k] = `Harus antara ${meta.min} – ${meta.max}`
      }
    })
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setLoading(true)
    setApiError(null)
    setResult(null)
    try {
      const { data } = await creditApi.auditPredict([inputs])
      const r = data[0]
      setResult(r)
      addResults([r])
    } catch (e: any) {
      setApiError(e?.response?.data?.detail ?? e.message ?? 'Gagal menghubungi API')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setInputs({ ...DEFAULT_INPUTS })
    setErrors({})
    setResult(null)
    setApiError(null)
  }

  const handleInspect = () => {
    if (result) { setSelectedNasabah(result); navigate('/inspect') }
  }

  const handleSimulate = () => {
    if (result) { setSimBaseline(result); navigate('/simulate') }
  }

  // Split features into 2 columns
  const leftKeys  = FEATURE_KEYS.slice(0, 5)
  const rightKeys = FEATURE_KEYS.slice(5)

  return (
    <>
      <TopBar
        title="Audit Tunggal"
        subtitle="Input manual data satu nasabah untuk analisis risiko"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-soft" onClick={handleReset}
              style={{ height: 36, fontSize: 13 }}>
              ↺ Reset
            </button>
            <button
              className="btn-primary"
              onClick={handleSubmit}
              disabled={loading}
              style={{ height: 36, fontSize: 13 }}
            >
              {loading ? '⏳ Mengaudit...' : '▶ Audit Nasabah'}
            </button>
          </div>
        }
      />

      <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Error banner ─────────────────────────────────────────────── */}
        {apiError && (
          <div style={{
            padding: '12px 16px',
            background: 'rgba(226,59,74,0.08)',
            border: '1px solid rgba(226,59,74,0.25)',
            borderRadius: 'var(--r-md)',
            fontSize: 13, color: '#ff5060',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span>✕</span>
            <span>{apiError}</span>
            <button onClick={() => setApiError(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none',
                color: '#ff5060', cursor: 'pointer', fontSize: 18 }}>
              ×
            </button>
          </div>
        )}

        {/* ── Main layout: form | result ────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 14, alignItems: 'start' }}>

          {/* ── LEFT: Form ─────────────────────────────────────────────── */}
          <div className="card" style={{ padding: '24px 28px' }}>
            <div style={{ marginBottom: 20 }}>
              <div className="metric-label" style={{ marginBottom: 4 }}>Data Nasabah</div>
              <div style={{ fontSize: 13, color: 'var(--on-dark-dim)' }}>
                Isi 10 fitur kredit sesuai profil nasabah. Gunakan nilai 0 jika tidak ada riwayat.
              </div>
            </div>

            {/* Two-column grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Left column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {leftKeys.map(k => (
                  <FormField
                    key={k}
                    featureKey={k}
                    value={inputs[k]}
                    onChange={handleChange}
                    error={errors[k]}
                  />
                ))}
              </div>

              {/* Right column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {rightKeys.map(k => (
                  <FormField
                    key={k}
                    featureKey={k}
                    value={inputs[k]}
                    onChange={handleChange}
                    error={errors[k]}
                  />
                ))}

                {/* Submit button (in-form) */}
                <div style={{ marginTop: 8 }}>
                  <button
                    className="btn-primary"
                    onClick={handleSubmit}
                    disabled={loading}
                    style={{ width: '100%', justifyContent: 'center', height: 48, fontSize: 15 }}
                  >
                    {loading ? '⏳ Mengaudit...' : '▶ Audit Nasabah Ini'}
                  </button>
                </div>
              </div>
            </div>

            {/* Quick fill presets */}
            <div style={{
              marginTop: 20, paddingTop: 16,
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 12, color: 'var(--on-dark-dim)' }}>Preset cepat:</span>
              <button
                className="btn-pill-sm"
                onClick={() => setInputs({
                  RevolvingUtilizationOfUnsecuredLines: 0.10,
                  age: 50, 'NumberOfTime30-59DaysPastDueNotWorse': 0,
                  DebtRatio: 0.20, MonthlyIncome: 10000,
                  NumberOfOpenCreditLinesAndLoans: 6, NumberOfTimes90DaysLate: 0,
                  NumberRealEstateLoansOrLines: 1,
                  'NumberOfTime60-89DaysPastDueNotWorse': 0, NumberOfDependents: 1,
                })}
                style={{ fontSize: 12 }}
              >
                ✓ Nasabah Sehat
              </button>
              <button
                className="btn-pill-sm"
                onClick={() => setInputs({
                  RevolvingUtilizationOfUnsecuredLines: 0.95,
                  age: 30, 'NumberOfTime30-59DaysPastDueNotWorse': 3,
                  DebtRatio: 1.20, MonthlyIncome: 2000,
                  NumberOfOpenCreditLinesAndLoans: 15, NumberOfTimes90DaysLate: 2,
                  NumberRealEstateLoansOrLines: 0,
                  'NumberOfTime60-89DaysPastDueNotWorse': 2, NumberOfDependents: 4,
                })}
                style={{ fontSize: 12 }}
              >
                ⚠ Nasabah Berisiko
              </button>
              <button
                className="btn-pill-sm"
                onClick={handleReset}
                style={{ fontSize: 12 }}
              >
                ↺ Default
              </button>
            </div>
          </div>

          {/* ── RIGHT: Result ──────────────────────────────────────────── */}
          <div style={{ position: 'sticky', top: 72 }}>
            {loading && (
              <div className="card">
                <LoadingSpinner label="Menganalisis & meninjau POJK..." size={24} />
              </div>
            )}

            {!loading && result && (
              <ResultPanel
                result={result}
                onInspect={handleInspect}
                onSimulate={handleSimulate}
              />
            )}

            {!loading && !result && (
              <div className="card" style={{
                padding: '48px 24px',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 14, textAlign: 'center',
              }}>
                <div style={{ fontSize: 40, opacity: 0.15 }}>◎</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--on-dark)' }}>
                  Hasil akan muncul di sini
                </div>
                <div style={{ fontSize: 12, color: 'var(--on-dark-dim)', maxWidth: 260 }}>
                  Isi form di kiri dan klik <strong style={{ color: 'var(--on-dark)' }}>
                  Audit Nasabah</strong> untuk melihat analisis risiko lengkap.
                </div>
                <div style={{
                  marginTop: 8, padding: '12px 16px',
                  background: 'rgba(73,79,223,0.08)',
                  border: '1px solid rgba(73,79,223,0.2)',
                  borderRadius: 'var(--r-md)',
                  fontSize: 12, color: 'var(--on-dark-dim)',
                  textAlign: 'left', lineHeight: 1.6,
                }}>
                  💡 Gunakan preset <strong style={{ color: 'var(--on-dark)' }}>Nasabah Sehat</strong> atau{' '}
                  <strong style={{ color: 'var(--on-dark)' }}>Nasabah Berisiko</strong> untuk demo cepat.
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </>
  )
}