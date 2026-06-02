import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { TopBar } from '../components/layout/TopBar'
import { StatusBadge } from '../components/audit/StatusBadge'
import { LoadingSpinner } from '../components/shared/LoadingSpinner'
import { useAuditStore } from '../store/useAuditStore'
import { creditApi } from '../api/creditApi'
import { parseAuditCSV } from '../utils/csvParser'
import { exportAuditPDF } from '../utils/pdfExport'
import type { AuditResult, NasabahFeatures } from '../types/audit'

// ─── Helpers ──────────────────────────────────────────────────────────────

const pct = (n: number) => `${(n * 100).toFixed(1)}%`

function ProbBar({ prob, status }: { prob: number; status: string }) {
  const color = status === 'TOLAK' ? '#e23b4a' : prob > 0.4 ? '#b09000' : '#00a87e'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
      <div style={{
        flex: 1, height: 4,
        background: 'rgba(255,255,255,0.07)',
        borderRadius: 999, overflow: 'hidden',
      }}>
        <div style={{
          width: `${prob * 100}%`, height: '100%',
          background: color, borderRadius: 999,
        }} />
      </div>
      <span style={{ fontSize: 12, color, fontWeight: 600, width: 36, textAlign: 'right' }}>
        {pct(prob)}
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
          {p.name ? `${p.name}: ` : ''}{p.value}
        </div>
      ))}
    </div>
  )
}

// ─── SHAP mini bar for a single result ────────────────────────────────────

function ShapMini({ shapTop }: { shapTop: Record<string, number> }) {
  const data = Object.entries(shapTop)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 5)
    .map(([feat, val]) => ({
      feat: feat.length > 22 ? feat.slice(0, 20) + '…' : feat,
      val: +val.toFixed(4),
      fill: val > 0 ? '#e23b4a' : '#00a87e',
    }))

  return (
    <ResponsiveContainer width="100%" height={110}>
      <BarChart data={data} layout="vertical"
        margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barSize={8}>
        <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
          axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="feat" width={140}
          tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
          axisLine={false} tickLine={false} />
        <Tooltip content={<DarkTooltip />} />
        <Bar dataKey="val" radius={[0, 4, 4, 0]} name="SHAP">
          {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Single audit result card (expanded) ──────────────────────────────────

function AuditCard({
  result,
  index,
  onInspect,
  onSimulate,
}: {
  result: AuditResult
  index: number
  onInspect: (r: AuditResult) => void
  onSimulate: (r: AuditResult) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const prob = result.prob
  const borderColor =
    result.status === 'TOLAK' ? 'rgba(226,59,74,0.4)' :
    prob > 0.4 ? 'rgba(176,144,0,0.4)' :
    'rgba(0,168,126,0.3)'

  return (
    <div style={{
      background: 'var(--surface-el)',
      border: `1px solid ${borderColor}`,
      borderRadius: 'var(--r-lg)',
      overflow: 'hidden',
      transition: 'border-color 0.15s ease',
    }}>
      {/* Card header — always visible */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '32px auto 1fr 180px 160px auto',
          alignItems: 'center',
          gap: 16,
          padding: '14px 20px',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Index */}
        <span style={{ fontSize: 13, color: 'var(--on-dark-dim)', fontWeight: 600 }}>
          {String(index + 1).padStart(2, '0')}
        </span>

        {/* Status badge */}
        <StatusBadge status={result.status} prob={prob} size="sm" />

        {/* Dominant feature */}
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 13, color: 'var(--on-dark)', fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {result.feat_name}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--on-dark-dim)', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {result.value_meaning}
          </div>
        </div>

        {/* Prob bar */}
        <ProbBar prob={prob} status={result.status} />

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          <button className="btn-pill-sm" onClick={() => onInspect(result)}
            style={{ fontSize: 11, height: 28 }}>
            Inspect
          </button>
          <button className="btn-pill-sm" onClick={() => onSimulate(result)}
            style={{ fontSize: 11, height: 28 }}>
            Sim
          </button>
        </div>

        {/* Expand toggle */}
        <span style={{
          fontSize: 14, color: 'var(--on-dark-dim)',
          transform: expanded ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s ease',
          display: 'flex', alignItems: 'center',
        }}>▾</span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 0,
        }}>
          {/* SHAP chart */}
          <div style={{ padding: '16px 20px', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="metric-label" style={{ marginBottom: 12 }}>
              Kontribusi Fitur SHAP
            </div>
            <ShapMini shapTop={result.shap_top} />
            <div style={{ fontSize: 11, color: 'var(--on-dark-dim)', marginTop: 6 }}>
              Merah = mendorong ke tolak · Hijau = mendorong ke lulus
            </div>
          </div>

          {/* Legal report */}
          <div style={{ padding: '16px 20px' }}>
            <div className="metric-label" style={{ marginBottom: 12 }}>
              Laporan Audit Hukum (POJK 40/2024)
            </div>
            <div className="report-box" style={{ fontSize: 13, maxHeight: 200, overflowY: 'auto' }}>
              {result.report.split('\n\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Batch summary bar ────────────────────────────────────────────────────

function BatchSummary({ results }: { results: AuditResult[] }) {
  const total   = results.length
  const lulus   = results.filter(r => r.status === 'LULUS').length
  const tolak   = results.filter(r => r.status === 'TOLAK').length
  const avgProb = results.reduce((s, r) => s + r.prob, 0) / total

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 10,
      marginBottom: 16,
    }}>
      {[
        { label: 'Total',        value: String(total),                color: 'var(--on-dark)' },
        { label: 'Lulus',        value: String(lulus),                color: '#00c896' },
        { label: 'Tolak',        value: String(tolak),                color: '#ff5060' },
        { label: 'Avg Prob',     value: `${(avgProb * 100).toFixed(1)}%`, color: avgProb > 0.5 ? '#ff5060' : avgProb > 0.25 ? '#d4ae00' : 'var(--on-dark)' },
      ].map(m => (
        <div key={m.label} className="card-sm" style={{ textAlign: 'center', padding: '12px 16px' }}>
          <div className="metric-label">{m.label}</div>
          <div style={{
            fontSize: 24, fontWeight: 500, color: m.color,
            fontFamily: 'General Sans, Inter, sans-serif',
            letterSpacing: '-0.02em', marginTop: 4,
          }}>{m.value}</div>
        </div>
      ))}
    </div>
  )
}

// ─── CSV drop zone ────────────────────────────────────────────────────────

function CSVDropZone({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void
  disabled: boolean
}) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.csv')) onFile(file)
  }, [onFile])

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      style={{
        border: `1.5px dashed ${dragging ? 'var(--primary-bright)' : 'rgba(255,255,255,0.15)'}`,
        borderRadius: 'var(--r-lg)',
        padding: '28px 20px',
        textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'border-color 0.15s ease, background 0.15s ease',
        background: dragging ? 'rgba(73,79,223,0.06)' : 'transparent',
      }}
    >
      <input
        ref={inputRef} type="file" accept=".csv"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
      <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.5 }}>⬆</div>
      <div style={{ fontSize: 14, color: 'var(--on-dark)', fontWeight: 500, marginBottom: 4 }}>
        Drop CSV atau klik untuk browse
      </div>
      <div style={{ fontSize: 12, color: 'var(--on-dark-dim)' }}>
        Kolom wajib: 10 fitur Give Me Some Credit · Max 100 baris
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────

type Mode = 'sample' | 'csv'
type SortKey = 'prob' | 'status' | 'feat'
type SortDir = 'asc' | 'desc'

export default function BatchAudit() {
  const navigate = useNavigate()
  const { auditHistory, addResults, setSelectedNasabah, setSimInputs, setSimBaseline } = useAuditStore()

  // ── Control state ────────────────────────────────────────────────────────
  const [mode, setMode]           = useState<Mode>('sample')
  const [nSamples, setNSamples]   = useState(5)
  const [seed, setSeed]           = useState(42)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  // ── Results of THIS batch run (separate from history) ───────────────────
  const [batchResults, setBatchResults] = useState<AuditResult[]>([])

  // ── CSV state ────────────────────────────────────────────────────────────
  const [csvFile, setCsvFile]     = useState<File | null>(null)
  const [csvErrors, setCsvErrors] = useState<string[]>([])
  const [csvParsed, setCsvParsed] = useState<NasabahFeatures[]>([])

  // ── Sort + filter ────────────────────────────────────────────────────────
  const [filterStatus, setFilterStatus] = useState<'all' | 'LULUS' | 'TOLAK'>('all')
  const [sortKey, setSortKey]     = useState<SortKey>('prob')
  const [sortDir, setSortDir]     = useState<SortDir>('desc')

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleRunSample = async () => {
    setLoading(true)
    setError(null)
    setBatchResults([])
    try {
      const { data } = await creditApi.auditSample(nSamples, seed)
      setBatchResults(data)
      addResults(data)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e.message ?? 'Gagal menghubungi API')
    } finally {
      setLoading(false)
    }
  }

  const handleCSVFile = async (file: File) => {
    setCsvFile(file)
    setCsvErrors([])
    setCsvParsed([])
    const result = await parseAuditCSV(file)
    setCsvErrors(result.errors)
    setCsvParsed(result.data)
  }

  const handleRunCSV = async () => {
    if (!csvParsed.length) return
    setLoading(true)
    setError(null)
    setBatchResults([])
    try {
      const payload = csvParsed.slice(0, 100)
      const { data } = await creditApi.auditPredict(payload)
      setBatchResults(data)
      addResults(data)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e.message ?? 'Gagal menghubungi API')
    } finally {
      setLoading(false)
    }
  }

  const handleInspect = (r: AuditResult) => {
    setSelectedNasabah(r)
    navigate('/inspect')
  }

  const handleSimulate = (r: AuditResult) => {
    // Pre-fill what-if with this nasabah's top SHAP features as starting point
    setSimBaseline(r)
    navigate('/simulate')
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  // ── Derived: sorted + filtered results ────────────────────────────────

  const displayResults = [...batchResults]
    .filter(r => filterStatus === 'all' || r.status === filterStatus)
    .sort((a, b) => {
      let cmp = 0
      if (sortKey === 'prob')   cmp = a.prob - b.prob
      if (sortKey === 'status') cmp = a.status.localeCompare(b.status)
      if (sortKey === 'feat')   cmp = a.feat_name.localeCompare(b.feat_name)
      return sortDir === 'asc' ? cmp : -cmp
    })

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? <span style={{ opacity: 0.3 }}> ↕</span> :
    sortDir === 'asc' ? <span style={{ color: 'var(--primary-bright)' }}> ↑</span> :
    <span style={{ color: 'var(--primary-bright)' }}> ↓</span>

  const hasResults = batchResults.length > 0

  return (
    <>
      <TopBar
        title="Audit Batch"
        subtitle="Analisis risiko kredit massal dengan XAI + RAG POJK"
        actions={
          hasResults ? (
            <button
              className="btn-soft"
              onClick={() => exportAuditPDF(batchResults)}
              style={{ height: 36, fontSize: 13 }}
            >
              ↓ Export PDF
            </button>
          ) : undefined
        }
      />

      <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Control panel ──────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          {/* Mode: Sample */}
          <div
            className="card"
            style={{
              cursor: 'pointer',
              borderColor: mode === 'sample' ? 'var(--primary)' : 'rgba(255,255,255,0.10)',
              transition: 'border-color 0.15s ease',
            }}
            onClick={() => setMode('sample')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 16, height: 16, borderRadius: '50%',
                border: `2px solid ${mode === 'sample' ? 'var(--primary-bright)' : 'rgba(255,255,255,0.2)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {mode === 'sample' && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary-bright)' }} />
                )}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-dark)' }}>
                  Random Sample
                </div>
                <div style={{ fontSize: 12, color: 'var(--on-dark-dim)' }}>
                  Ambil sampel acak dari dataset test
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <div className="metric-label" style={{ marginBottom: 6 }}>Jumlah Nasabah</div>
                <input
                  type="number"
                  className="input-field"
                  value={nSamples}
                  min={1} max={20}
                  onChange={e => setNSamples(Math.min(20, Math.max(1, +e.target.value)))}
                  onClick={e => e.stopPropagation()}
                  style={{ height: 40, fontSize: 14 }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="metric-label" style={{ marginBottom: 6 }}>Random Seed</div>
                <input
                  type="number"
                  className="input-field"
                  value={seed}
                  onChange={e => setSeed(+e.target.value)}
                  onClick={e => e.stopPropagation()}
                  style={{ height: 40, fontSize: 14 }}
                />
              </div>
              <button
                className="btn-primary"
                onClick={e => { e.stopPropagation(); setMode('sample'); handleRunSample() }}
                disabled={loading}
                style={{ height: 40, fontSize: 13, flexShrink: 0 }}
              >
                {loading && mode === 'sample' ? '⏳ Memproses...' : '▶ Jalankan'}
              </button>
            </div>
          </div>

          {/* Mode: CSV Upload */}
          <div
            className="card"
            style={{
              cursor: 'pointer',
              borderColor: mode === 'csv' ? 'var(--primary)' : 'rgba(255,255,255,0.10)',
              transition: 'border-color 0.15s ease',
            }}
            onClick={() => setMode('csv')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 16, height: 16, borderRadius: '50%',
                border: `2px solid ${mode === 'csv' ? 'var(--primary-bright)' : 'rgba(255,255,255,0.2)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {mode === 'csv' && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary-bright)' }} />
                )}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-dark)' }}>
                  Upload CSV
                </div>
                <div style={{ fontSize: 12, color: 'var(--on-dark-dim)' }}>
                  Upload file CSV data nasabah (max 100 baris)
                </div>
              </div>
            </div>

            <div onClick={e => e.stopPropagation()}>
              <CSVDropZone onFile={handleCSVFile} disabled={loading} />

              {csvFile && (
                <div style={{
                  marginTop: 10, display: 'flex',
                  justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div style={{ fontSize: 12, color: 'var(--on-dark-mute)' }}>
                    📄 {csvFile.name}
                    {csvParsed.length > 0 && (
                      <span style={{ color: '#00c896', marginLeft: 8 }}>
                        {csvParsed.length} baris valid
                      </span>
                    )}
                  </div>
                  <button
                    className="btn-primary"
                    onClick={() => { setMode('csv'); handleRunCSV() }}
                    disabled={loading || !csvParsed.length}
                    style={{ height: 36, fontSize: 13 }}
                  >
                    {loading && mode === 'csv' ? '⏳...' : '▶ Audit CSV'}
                  </button>
                </div>
              )}

              {csvErrors.length > 0 && (
                <div style={{
                  marginTop: 10,
                  padding: '10px 14px',
                  background: 'rgba(226,59,74,0.08)',
                  border: '1px solid rgba(226,59,74,0.2)',
                  borderRadius: 'var(--r-md)',
                  fontSize: 12,
                }}>
                  {csvErrors.slice(0, 4).map((e, i) => (
                    <div key={i} style={{ color: '#ff5060', marginBottom: 2 }}>⚠ {e}</div>
                  ))}
                  {csvErrors.length > 4 && (
                    <div style={{ color: 'var(--on-dark-dim)' }}>
                      +{csvErrors.length - 4} error lainnya
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Error banner ────────────────────────────────────────────────── */}
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
                color: '#ff5060', cursor: 'pointer', fontSize: 16 }}>
              ×
            </button>
          </div>
        )}

        {/* ── Loading state ────────────────────────────────────────────────── */}
        {loading && (
          <div className="card" style={{ padding: 0 }}>
            <LoadingSpinner label="Menganalisis risiko & meninjau pasal POJK... (Llama 3.2 ~5–15 detik per nasabah)" />
          </div>
        )}

        {/* ── Results ──────────────────────────────────────────────────────── */}
        {hasResults && !loading && (
          <>
            {/* Batch summary */}
            <BatchSummary results={batchResults} />

            {/* Filter + sort toolbar */}
            <div style={{
              display: 'flex', alignItems: 'center',
              gap: 10, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 12, color: 'var(--on-dark-dim)' }}>Filter:</span>
              {(['all', 'LULUS', 'TOLAK'] as const).map(f => (
                <button
                  key={f}
                  className={`btn-pill-sm ${filterStatus === f ? 'active' : ''}`}
                  onClick={() => setFilterStatus(f)}
                  style={{ fontSize: 12 }}
                >
                  {f === 'all' ? 'Semua' : f}
                  {f !== 'all' && (
                    <span style={{ marginLeft: 4, opacity: 0.7 }}>
                      ({batchResults.filter(r => r.status === f).length})
                    </span>
                  )}
                </button>
              ))}

              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--on-dark-dim)' }}>Urutkan:</span>
                {([
                  { k: 'prob' as SortKey, label: 'Probabilitas' },
                  { k: 'status' as SortKey, label: 'Status' },
                  { k: 'feat' as SortKey, label: 'Fitur' },
                ]).map(({ k, label }) => (
                  <button
                    key={k}
                    className={`btn-pill-sm ${sortKey === k ? 'active' : ''}`}
                    onClick={() => handleSort(k)}
                    style={{ fontSize: 12 }}
                  >
                    {label}<SortIcon k={k} />
                  </button>
                ))}
              </div>
            </div>

            {/* Results count */}
            <div style={{ fontSize: 12, color: 'var(--on-dark-dim)' }}>
              Menampilkan {displayResults.length} dari {batchResults.length} nasabah
            </div>

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {displayResults.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--on-dark-dim)' }}>
                  Tidak ada nasabah dengan filter yang dipilih.
                </div>
              ) : (
                displayResults.map((r, i) => (
                  <AuditCard
                    key={`${r.request_id}-${r.idx}-${i}`}
                    result={r}
                    index={i}
                    onInspect={handleInspect}
                    onSimulate={handleSimulate}
                  />
                ))
              )}
            </div>
          </>
        )}

        {/* ── History strip ─────────────────────────────────────────────── */}
        {!hasResults && !loading && auditHistory.length > 0 && (
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="metric-label">History Session ({auditHistory.length} nasabah)</div>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Status</th>
                  <th>Probabilitas</th>
                  <th>Faktor Dominan</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {auditHistory.slice(0, 8).map((r, i) => (
                  <tr key={`h-${r.request_id}-${i}`}>
                    <td style={{ color: 'var(--on-dark-dim)' }}>{i + 1}</td>
                    <td><StatusBadge status={r.status} prob={r.prob} size="sm" /></td>
                    <td>
                      <span style={{
                        fontSize: 13, fontWeight: 600,
                        color: r.status === 'TOLAK' ? '#ff5060' : r.prob > 0.4 ? '#d4ae00' : '#00c896',
                      }}>
                        {(r.prob * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--on-dark)' }}>{r.feat_name}</td>
                    <td>
                      <button className="btn-pill-sm"
                        onClick={() => handleInspect(r)}
                        style={{ fontSize: 11, height: 26 }}>
                        Inspect →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────────────────── */}
        {!hasResults && !loading && auditHistory.length === 0 && (
          <div className="card" style={{
            padding: '64px 32px',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 14, textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, opacity: 0.2 }}>≡</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--on-dark)' }}>
              Belum ada audit batch
            </div>
            <div style={{ fontSize: 13, color: 'var(--on-dark-dim)', maxWidth: 400 }}>
              Pilih mode <strong style={{ color: 'var(--on-dark)' }}>Random Sample</strong> untuk
              langsung mengambil sampel dari dataset, atau <strong style={{ color: 'var(--on-dark)' }}>
              Upload CSV</strong> untuk data nasabah sendiri.
            </div>
          </div>
        )}

      </div>
    </>
  )
}