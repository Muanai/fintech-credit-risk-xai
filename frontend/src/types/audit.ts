// ── Core audit types ──────────────────────────────────────────────────────

export interface AuditResult {
  request_id: string
  idx: number
  status: 'LULUS' | 'TOLAK'
  prob: number
  report: string
  feat_name: string
  value_meaning: string
  shap_top: Record<string, number>
}

export type RiskLevel = 'safe' | 'warn' | 'danger'

export function getRiskLevel(prob: number, status: string): RiskLevel {
  if (status === 'TOLAK') return 'danger'
  if (prob > 0.4) return 'warn'
  return 'safe'
}

export function getRiskLabel(level: RiskLevel): string {
  return { safe: 'Aman', warn: 'Waspada', danger: 'Tolak' }[level]
}

// ── Feature definitions ───────────────────────────────────────────────────

export interface FeatureMeta {
  label: string        // Bahasa Indonesia
  min: number
  max: number
  step: number
  unit?: string
  description: string
}

export type FeatureKey =
  | 'RevolvingUtilizationOfUnsecuredLines'
  | 'age'
  | 'NumberOfTime30-59DaysPastDueNotWorse'
  | 'DebtRatio'
  | 'MonthlyIncome'
  | 'NumberOfOpenCreditLinesAndLoans'
  | 'NumberOfTimes90DaysLate'
  | 'NumberRealEstateLoansOrLines'
  | 'NumberOfTime60-89DaysPastDueNotWorse'
  | 'NumberOfDependents'

export type NasabahFeatures = Record<FeatureKey, number>

export const FEATURE_META: Record<FeatureKey, FeatureMeta> = {
  RevolvingUtilizationOfUnsecuredLines: {
    label: 'Utilisasi Kredit Tanpa Agunan',
    min: 0, max: 1, step: 0.01,
    unit: 'rasio',
    description: 'Nilai 1.0 = batas kredit penuh (kritis)',
  },
  age: {
    label: 'Usia Peminjam',
    min: 18, max: 100, step: 1,
    unit: 'tahun',
    description: 'Usia calon penerima dana',
  },
  'NumberOfTime30-59DaysPastDueNotWorse': {
    label: 'Keterlambatan 30–59 Hari',
    min: 0, max: 20, step: 1,
    unit: 'insiden',
    description: 'Jumlah insiden keterlambatan 30–59 hari',
  },
  DebtRatio: {
    label: 'Rasio Beban Utang',
    min: 0, max: 5, step: 0.01,
    unit: 'rasio',
    description: 'Total cicilan / pendapatan bulanan',
  },
  MonthlyIncome: {
    label: 'Pendapatan Bulanan',
    min: 0, max: 50000, step: 500,
    unit: 'USD',
    description: 'Pendapatan bersih bulanan',
  },
  NumberOfOpenCreditLinesAndLoans: {
    label: 'Fasilitas Kredit Aktif',
    min: 0, max: 50, step: 1,
    unit: 'fasilitas',
    description: 'Jumlah pinjaman dan kartu kredit aktif',
  },
  NumberOfTimes90DaysLate: {
    label: 'Keterlambatan > 90 Hari',
    min: 0, max: 20, step: 1,
    unit: 'insiden',
    description: 'Indikator kredit macet terkuat',
  },
  NumberRealEstateLoansOrLines: {
    label: 'Pinjaman Properti',
    min: 0, max: 20, step: 1,
    unit: 'fasilitas',
    description: 'Pinjaman beragun properti aktif',
  },
  'NumberOfTime60-89DaysPastDueNotWorse': {
    label: 'Keterlambatan 60–89 Hari',
    min: 0, max: 20, step: 1,
    unit: 'insiden',
    description: 'Sinyal serius sebelum status macet',
  },
  NumberOfDependents: {
    label: 'Jumlah Tanggungan',
    min: 0, max: 20, step: 1,
    unit: 'orang',
    description: 'Anggota keluarga yang ditanggung',
  },
}

export const FEATURE_KEYS = Object.keys(FEATURE_META) as FeatureKey[]

// ── Computed metrics ──────────────────────────────────────────────────────

export interface PulseMetrics {
  total: number
  approvalRate: number      // % LULUS
  avgProbability: number    // rata-rata prob gagal bayar
  defaultRate: number       // % TOLAK (proxy NPL sederhana)
  chargeOffProxy: number    // % prob > 0.9 (sangat berisiko)
  rollRate: number          // % zona waspada (0.4–0.785)
  topKillerFeature: string  // fitur SHAP dominan terbanyak di batch
}

export function computePulse(results: AuditResult[]): PulseMetrics | null {
  if (!results.length) return null

  const total = results.length
  const tolak = results.filter(r => r.status === 'TOLAK').length
  const avgProb = results.reduce((s, r) => s + r.prob, 0) / total
  const chargeOff = results.filter(r => r.prob > 0.9).length
  const roll = results.filter(r => r.prob >= 0.4 && r.prob < 0.7855).length

  // Fitur yang paling sering jadi top SHAP di batch
  const featCount: Record<string, number> = {}
  results.forEach(r => {
    const top = Object.entries(r.shap_top).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]
    if (top) featCount[top[0]] = (featCount[top[0]] ?? 0) + 1
  })
  const topKiller = Object.entries(featCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-'

  return {
    total,
    approvalRate: (((total - tolak) / total) * 100),
    avgProbability: avgProb * 100,
    defaultRate: (tolak / total) * 100,
    chargeOffProxy: (chargeOff / total) * 100,
    rollRate: (roll / total) * 100,
    topKillerFeature: topKiller,
  }
}