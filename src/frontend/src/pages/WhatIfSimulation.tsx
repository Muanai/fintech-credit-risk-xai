import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { TopBar } from '../components/layout/TopBar'
import { StatusBadge } from '../components/audit/StatusBadge'
import { LoadingSpinner } from '../components/shared/LoadingSpinner'
import { useAuditStore } from '../store/useAuditStore'
import { creditApi } from '../api/creditApi'
import { FEATURE_META, FEATURE_KEYS } from '../types/audit'
import type { AuditResult, FeatureKey, NasabahFeatures } from '../types/audit'

// ── Helpers ────────────────────────────────────────────────────────────────

const pct  = (n: number) => `${(n * 100).toFixed(1)}%`
const diff = (a: number, b: number) => {
  const d = (b - a) * 100
  return d > 0 ? `+${d.toFixed(1)}%` : `${d.toFixed(1)}%`
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
          {p.name ? `${p.name}: ` : ''}{typeof p.value === 'number' ? p.value.toFixed(4) : p.value}
        </div>
      ))}
    </div>
  )
}

// ── Probability gauge (compact horizontal) ────────────────────────────────

function MiniGauge({
  prob,
  label,
  status,
}: {
  prob: number
  label: string
  status: 'LULUS' | 'TOLAK'
}) {
  const color =
    status === 'TOLAK' ? '#e23b4a' :
    prob > 0.4 ? '#b09000' : '#00a87e'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--on-dark-dim)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {label}
        </span>
        <span style={{ fontSize: 18, fontWeight: 600, color, fontFamily: 'General Sans, sans-serif' }}>
          {pct(prob)}
        </span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
        {/* Zone coloring */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
          <div style={{ width: '40%', background: 'rgba(0,168,126,0.15)' }} />
          <div style={{ width: '38.55%', background: 'rgba(176,144,0,0.15)' }} />
          <div style={{ flex: 1, background: 'rgba(226,59,74,0.15)' }} />
        </div>
        {/* Needle fill */}
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: `${Math.min(prob * 100, 100)}%`,
          background: color, borderRadius: 999,
          transition: 'width 0.4s ease',
        }} />
        {/* Threshold line */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: '78.55%', width: 2,
          background: 'rgba(226,59,74,0.7)',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--on-dark-dim)' }}>
        <span>0%</span>
        <span style={{ color: 'rgba(226,59,74,0.7)' }}>Batas 78.5%</span>
        <span>100%</span>
      </div>
    </div>
  )
}

// ── Delta indicator ────────────────────────────────────────────────────────

function DeltaBadge({ baseline, current }: { baseline: number; current: number }) {
  const delta = (current - baseline) * 100
  const isUp  = delta > 0.05
  const isDn  = delta < -0.05
  if (!isUp && !isDn) return <span style={{ fontSize: 12, color: 'var(--on-dark-dim)' }}>—</span>

  return (
    <span style={{
      fontSize: 12, fontWeight: 700,
      color: isUp ? '#ff5060' : '#00c896',
      background: isUp ? 'rgba(226,59,74,0.12)' : 'rgba(0,168,126,0.12)',
      padding: '2px 8px', borderRadius: 999,
    }}>
      {isUp ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}pp
    </span>
  )
}

// ── Single feature slider row ──────────────────────────────────────────────

function FeatureSlider({
  featureKey,
  value,
  baselineValue,
  onChange,
  shapValue,
}: {
  featureKey: FeatureKey
  value: number
  baselineValue: number
  onChange: (key: FeatureKey, val: number) => void
  shapValue?: number
}) {
  const meta    = FEATURE_META[featureKey]
  const isRisk  = (shapValue ?? 0) > 0
  const changed = Math.abs(value - baselineValue) > 0.001

  const formatVal = (v: number) => {
    if (meta.unit === 'rasio') return v.toFixed(2)
    if (meta.unit === 'USD')   return v.toLocaleString('id-ID')
    return Math.round(v).toString()
  }

  // Progress fill for track (from min to current)
  const pctFill = ((value - meta.min) / (meta.max - meta.min)) * 100

  return (
    <div style={{
      padding: '14px 16px',
      background: changed
        ? 'rgba(73,79,223,0.06)'
        : 'rgba(255,255,255,0.02)',
      border: `1px solid ${changed ? 'rgba(73,79,223,0.25)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 'var(--r-md)',
      transition: 'border-color 0.15s ease, background 0.15s ease',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {/* SHAP direction dot */}
        {shapValue !== undefined && (
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: isRisk ? '#e23b4a' : '#00a87e',
          }} />
        )}

        <span style={{
          fontSize: 13, color: 'var(--on-dark)', fontWeight: 500, flex: 1,
        }}>
          {meta.label}
        </span>

        {/* Baseline vs current */}
        <span style={{
          fontSize: 11, color: 'var(--on-dark-dim)',
          fontFamily: 'monospace',
        }}>
          {formatVal(baselineValue)}
        </span>
        <span style={{ fontSize: 11, color: 'var(--on-dark-dim)' }}>→</span>
        <span style={{
          fontSize: 13, fontWeight: 700,
          color: changed ? 'var(--primary-bright)' : 'var(--on-dark)',
          fontFamily: 'monospace', minWidth: 48, textAlign: 'right',
        }}>
          {formatVal(value)}{meta.unit && meta.unit !== 'rasio' ? '' : ''}
        </span>

        {/* Reset button */}
        {changed && (
          <button
            onClick={() => onChange(featureKey, baselineValue)}
            style={{
              background: 'none', border: 'none',
              color: 'var(--on-dark-dim)', cursor: 'pointer',
              fontSize: 14, padding: '0 4px', lineHeight: 1,
            }}
            title="Reset ke nilai asal"
          >
            ↺
          </button>
        )}
      </div>

      {/* Slider */}
      <div style={{ position: 'relative' }}>
        <input
          type="range"
          min={meta.min}
          max={meta.max}
          step={meta.step}
          value={value}
          onChange={e => onChange(featureKey, +e.target.value)}
          style={{
            width: '100%',
            background: `linear-gradient(to right, ${changed ? 'var(--primary)' : '#494fdf88'} ${pctFill}%, rgba(255,255,255,0.1) ${pctFill}%)`,
          }}
        />
      </div>

      {/* Min / max labels */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 10, color: 'var(--on-dark-dim)', marginTop: 4,
      }}>
        <span>{formatVal(meta.min)} {meta.unit}</span>
        <span style={{ color: 'var(--on-dark-dim)', fontSize: 10, textAlign: 'center', flex: 1, padding: '0 8px' }}>
          {meta.description}
        </span>
        <span>{formatVal(meta.max)} {meta.unit}</span>
      </div>
    </div>
  )
}

// ── Comparison bar chart ───────────────────────────────────────────────────

function ComparisonChart({
  baseline,
  current,
}: {
  baseline: AuditResult | null
  current: AuditResult | null
}) {
  if (!baseline || !current) return null

  const data = [
    { name: 'Baseline', prob: +(baseline.prob * 100).toFixed(1), fill: '#5c5e60' },
    { name: 'Simulasi',  prob: +(current.prob * 100).toFixed(1),
      fill: current.prob >= 0.7855 ? '#e23b4a' : current.prob > 0.4 ? '#b09000' : '#00a87e' },
  ]

  return (
    <ResponsiveContainer width="100%" height={130}>
      <BarChart data={data} barSize={48} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
        <XAxis dataKey="name"
          tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
          axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]}
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
          axisLine={false} tickLine={false} />
        <Tooltip content={<DarkTooltip />} formatter={(v: number) => [`${v}%`, 'Probabilitas']} />
        <ReferenceLine y={78.5} stroke="#e23b4a" strokeDasharray="4 3" strokeWidth={1} />
        <Bar dataKey="prob" radius={[6, 6, 0, 0]} name="Prob Gagal Bayar">
          {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Changed features summary ───────────────────────────────────────────────

function ChangedFeaturesList({
  inputs,
  baseline,
}: {
  inputs: Partial<NasabahFeatures>
  baseline: Partial<NasabahFeatures>
}) {
  const changes = FEATURE_KEYS.filter(k => {
    const cur  = inputs[k]
    const base = baseline[k]
    return cur !== undefined && base !== undefined && Math.abs(cur - base) > 0.001
  })

  if (!changes.length) return (
    <div style={{ fontSize: 13, color: 'var(--on-dark-dim)', padding: '8px 0' }}>
      Belum ada fitur yang diubah.
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {changes.map(k => {
        const meta  = FEATURE_META[k]
        const base  = baseline[k]!
        const cur   = inputs[k]!
        const delta = cur - base
        const isUp  = delta > 0

        return (
          <div key={k} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 'var(--r-md)',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: isUp ? '#e23b4a' : '#00a87e', flexShrink: 0,
            }} />
            <span style={{ fontSize: 12, color: 'var(--on-dark)', flex: 1 }}>
              {meta.label}
            </span>
            <span style={{ fontSize: 12, color: 'var(--on-dark-dim)', fontFamily: 'monospace' }}>
              {base.toFixed(meta.step < 1 ? 2 : 0)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--on-dark-dim)' }}>→</span>
            <span style={{
              fontSize: 12, fontWeight: 700,
              color: isUp ? '#ff5060' : '#00c896',
              fontFamily: 'monospace',
            }}>
              {cur.toFixed(meta.step < 1 ? 2 : 0)}
            </span>
            <span style={{
              fontSize: 11,
              color: isUp ? '#ff5060' : '#00c896',
              background: isUp ? 'rgba(226,59,74,0.1)' : 'rgba(0,168,126,0.1)',
              padding: '1px 6px', borderRadius: 999,
            }}>
              {isUp ? '▲' : '▼'} {Math.abs(delta).toFixed(meta.step < 1 ? 2 : 0)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Default inputs ────────────────────────────────────────────────────────

const SAFE_DEFAULTS: NasabahFeatures = {
  RevolvingUtilizationOfUnsecuredLines:   0.20,
  age:                                    45,
  'NumberOfTime30-59DaysPastDueNotWorse': 0,
  DebtRatio:                              0.35,
  MonthlyIncome:                          6000,
  NumberOfOpenCreditLinesAndLoans:        8,
  NumberOfTimes90DaysLate:               0,
  NumberRealEstateLoansOrLines:           1,
  'NumberOfTime60-89DaysPastDueNotWorse': 0,
  NumberOfDependents:                     2,
}

function initInputsFromBaseline(_baseline: AuditResult | null): NasabahFeatures {
  // Selalu return complete NasabahFeatures dengan safe defaults
  // Slider akan menampilkan nilai ini sebagai titik awal yang masuk akal
  return { ...SAFE_DEFAULTS }
}

// ── Main ──────────────────────────────────────────────────────────────────

export default function WhatIfSimulation() {
  const navigate = useNavigate()
  const {
    simBaseline, simResult, simInputs,
    setSimInput, setSimInputs, setSimResult,
  } = useAuditStore()

  // Local state: selalu NasabahFeatures lengkap, bukan Partial
  const [inputs, setInputs] = useState<NasabahFeatures>(() => {
    // Jika simInputs dari store sudah lengkap (semua 10 key ada), pakai itu
    const hasAllKeys = FEATURE_KEYS.every(k => simInputs[k] !== undefined)
    if (hasAllKeys) return simInputs as NasabahFeatures
    // Selalu fallback ke safe defaults — tidak pernah Partial
    return initInputsFromBaseline(simBaseline)
  })

  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [localResult, setLocalResult] = useState<AuditResult | null>(simResult)

  // Debounce ref — avoid calling API on every slider tick
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Baseline for comparison (either the pre-loaded baseline or last sim result)
  const baselineResult = simBaseline

  // ── Slider change handler ────────────────────────────────────────────────
  const handleSliderChange = useCallback((key: FeatureKey, val: number) => {
    const next = { ...inputs, [key]: val }
    setInputs(next)
    setSimInput(key, val)
  }, [inputs, setSimInput])

  // ── Run simulation ────────────────────────────────────────────────────────
  const handleRun = async () => {
    // inputs sudah selalu NasabahFeatures lengkap — tidak perlu validasi missing
    // Tapi tetap cek NaN untuk keamanan
    const nanKeys = FEATURE_KEYS.filter(k => isNaN(inputs[k]))
    if (nanKeys.length > 0) {
      setError(`Nilai tidak valid: ${nanKeys.map(k => FEATURE_META[k].label).join(', ')}`)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { data } = await creditApi.auditPredict([inputs])
      const result = data[0]
      setLocalResult(result)
      setSimResult(result)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e.message ?? 'Gagal menghubungi API')
    } finally {
      setLoading(false)
    }
  }

  // ── Reset all to baseline ─────────────────────────────────────────────────
  const handleReset = () => {
    const fresh = initInputsFromBaseline(simBaseline)
    setInputs(fresh)
    setSimInputs(fresh)
    setLocalResult(null)
    setSimResult(null)
    setError(null)
  }

  const hasResult = !!localResult
  const probDelta = hasResult && baselineResult
    ? localResult!.prob - baselineResult.prob
    : null

  const statusChanged = hasResult && baselineResult &&
    localResult!.status !== baselineResult.status

  // Sorted feature keys: SHAP-impactful features from baseline first
  const sortedKeys: FeatureKey[] = baselineResult
    ? [...FEATURE_KEYS].sort((a, b) => {
        const sa = Math.abs(baselineResult.shap_top[a] ?? 0)
        const sb = Math.abs(baselineResult.shap_top[b] ?? 0)
        return sb - sa
      })
    : FEATURE_KEYS

  return (
    <>
      <TopBar
        title="What-If Simulation"
        subtitle="Ubah nilai fitur nasabah dan lihat dampaknya terhadap skor risiko"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-soft" onClick={handleReset}
              style={{ height: 36, fontSize: 13 }}>
              ↺ Reset
            </button>
            <button
              className="btn-primary"
              onClick={handleRun}
              disabled={loading}
              style={{ height: 36, fontSize: 13 }}
            >
              {loading ? '⏳ Menghitung...' : '▶ Jalankan Simulasi'}
            </button>
          </div>
        }
      />

      <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── No baseline warning ─────────────────────────────────────── */}
        {!baselineResult && (
          <div style={{
            padding: '12px 16px',
            background: 'rgba(176,144,0,0.08)',
            border: '1px solid rgba(176,144,0,0.2)',
            borderRadius: 'var(--r-md)',
            fontSize: 13, color: '#d4ae00',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span>⚠</span>
            <span>
              Tidak ada nasabah baseline. Atur slider secara manual, atau kembali ke{' '}
              <button
                onClick={() => navigate('/audit')}
                style={{ background: 'none', border: 'none', color: '#d4ae00',
                  cursor: 'pointer', fontWeight: 700, textDecoration: 'underline',
                  fontSize: 13, padding: 0 }}
              >
                Audit Batch
              </button>
              {' '}dan klik <strong>Sim</strong> pada salah satu nasabah.
            </span>
          </div>
        )}

        {/* ── Main layout: sliders | result panel ─────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 14, alignItems: 'start' }}>

          {/* ── LEFT: Feature sliders ──────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Section header */}
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', marginBottom: 2,
            }}>
              <div>
                <div className="metric-label">Parameter Fitur</div>
                <div style={{ fontSize: 12, color: 'var(--on-dark-dim)', marginTop: 2 }}>
                  Fitur diurutkan berdasarkan dampak SHAP terbesar dari baseline
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, fontSize: 11, color: 'var(--on-dark-dim)', alignItems: 'center' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e23b4a', display: 'inline-block' }} />
                Mendorong risiko naik
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#00a87e', display: 'inline-block', marginLeft: 8 }} />
                Mendorong risiko turun
              </div>
            </div>

            {/* Slider grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sortedKeys.map(k => (
                <FeatureSlider
                  key={k}
                  featureKey={k}
                  value={inputs[k]}
                  baselineValue={SAFE_DEFAULTS[k]}
                  onChange={handleSliderChange}
                  shapValue={baselineResult?.shap_top[k]}
                />
              ))}
            </div>
          </div>

          {/* ── RIGHT: Result panel ────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 72 }}>

            {/* Baseline card */}
            {baselineResult && (
              <div className="card" style={{ padding: '16px 20px' }}>
                <div className="metric-label" style={{ marginBottom: 12 }}>Baseline (Nasabah Asli)</div>
                <MiniGauge prob={baselineResult.prob} label="" status={baselineResult.status} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                  <StatusBadge status={baselineResult.status} prob={baselineResult.prob} size="sm" />
                  <span style={{ fontSize: 12, color: 'var(--on-dark-dim)' }}>
                    Faktor: {baselineResult.feat_name}
                  </span>
                </div>
              </div>
            )}

            {/* Simulation result card */}
            <div className="card" style={{
              padding: '16px 20px',
              borderColor: hasResult
                ? localResult!.status === 'TOLAK'
                  ? 'rgba(226,59,74,0.4)'
                  : 'rgba(0,168,126,0.3)'
                : 'rgba(255,255,255,0.10)',
              transition: 'border-color 0.3s ease',
            }}>
              <div className="metric-label" style={{ marginBottom: 12 }}>Hasil Simulasi</div>

              {loading && <LoadingSpinner label="Menghitung skor..." size={24} />}

              {!loading && !hasResult && (
                <div style={{
                  padding: '24px 0', textAlign: 'center',
                  color: 'var(--on-dark-dim)', fontSize: 13,
                }}>
                  <div style={{ fontSize: 28, opacity: 0.2, marginBottom: 8 }}>⊛</div>
                  Klik <strong style={{ color: 'var(--on-dark)' }}>Jalankan Simulasi</strong> untuk melihat hasil
                </div>
              )}

              {!loading && hasResult && (
                <>
                  <MiniGauge
                    prob={localResult!.prob}
                    label=""
                    status={localResult!.status}
                  />

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                    <StatusBadge status={localResult!.status} prob={localResult!.prob} size="sm" />
                    {probDelta !== null && (
                      <DeltaBadge
                        baseline={baselineResult?.prob ?? 0}
                        current={localResult!.prob}
                      />
                    )}
                  </div>

                  {/* Status flip alert */}
                  {statusChanged && (
                    <div style={{
                      marginTop: 12,
                      padding: '10px 12px',
                      background: localResult!.status === 'LULUS'
                        ? 'rgba(0,168,126,0.1)'
                        : 'rgba(226,59,74,0.1)',
                      border: `1px solid ${localResult!.status === 'LULUS'
                        ? 'rgba(0,168,126,0.3)'
                        : 'rgba(226,59,74,0.3)'}`,
                      borderRadius: 'var(--r-md)',
                      fontSize: 12,
                      color: localResult!.status === 'LULUS' ? '#00c896' : '#ff5060',
                      fontWeight: 600,
                    }}>
                      {localResult!.status === 'LULUS'
                        ? '✓ Status berubah: TOLAK → LULUS'
                        : '✕ Status berubah: LULUS → TOLAK'}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Comparison chart */}
            {hasResult && baselineResult && (
              <div className="card" style={{ padding: '16px 20px' }}>
                <div className="metric-label" style={{ marginBottom: 10 }}>
                  Perbandingan Probabilitas
                </div>
                <ComparisonChart baseline={baselineResult} current={localResult} />
                <div style={{ fontSize: 11, color: 'var(--on-dark-dim)', marginTop: 6, textAlign: 'center' }}>
                  Garis merah = batas penolakan 78.5%
                </div>
              </div>
            )}

            {/* Changed features summary */}
            <div className="card" style={{ padding: '16px 20px' }}>
              <div className="metric-label" style={{ marginBottom: 12 }}>Fitur yang Diubah</div>
              <ChangedFeaturesList
                inputs={inputs}
                baseline={SAFE_DEFAULTS}
              />
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className="btn-primary"
                onClick={handleRun}
                disabled={loading}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {loading ? '⏳ Menghitung...' : '▶ Jalankan Simulasi'}
              </button>

              {hasResult && (
                <button
                  className="btn-soft"
                  onClick={() => {
                    if (localResult) {
                      useAuditStore.getState().setSelectedNasabah(localResult)
                      navigate('/inspect')
                    }
                  }}
                  style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}
                >
                  Buka Hasil di Inspection Room →
                </button>
              )}

              <button
                className="btn-soft"
                onClick={() => navigate('/audit')}
                style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}
              >
                ← Kembali ke Audit Batch
              </button>
            </div>

          </div>
        </div>

        {/* ── Error banner ─────────────────────────────────────────────── */}
        {error && (
          <div style={{
            padding: '12px 16px',
            background: 'rgba(226,59,74,0.08)',
            border: '1px solid rgba(226,59,74,0.25)',
            borderRadius: 'var(--r-md)',
            fontSize: 13, color: '#ff5060',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span>✕</span>
            <span>{error}</span>
            <button onClick={() => setError(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none',
                color: '#ff5060', cursor: 'pointer', fontSize: 18 }}>
              ×
            </button>
          </div>
        )}

      </div>
    </>
  )
}