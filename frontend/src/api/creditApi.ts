import axios from 'axios'
import type { AuditResult, NasabahFeatures } from '../types/audit'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
  timeout: 120_000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (import.meta.env.DEV) {
      console.error('[API Error]', err.response?.status, err.response?.data ?? err.message)
    }
    return Promise.reject(err)
  }
)

export type FullFeatureRow = {
  RevolvingUtilizationOfUnsecuredLines: number
  age: number | null
  'NumberOfTime30-59DaysPastDueNotWorse': number | null
  DebtRatio: number
  MonthlyIncome: number | null
  NumberOfOpenCreditLinesAndLoans: number
  NumberOfTimes90DaysLate: number | null
  NumberRealEstateLoansOrLines: number
  'NumberOfTime60-89DaysPastDueNotWorse': number | null
  NumberOfDependents: number
  // 3 sentinel flags
  'NumberOfTime30-59DaysPastDueNotWorse_is_96_or_98': number
  'NumberOfTime60-89DaysPastDueNotWorse_is_96_or_98': number
  'NumberOfTimes90DaysLate_is_96_or_98': number
  // Derived features
  Income_Missing_Flag: number
  Monthly_Debt: number | null
  Income_Per_Dependent: number | null
}

export function applyFeatureEngineering(raw: NasabahFeatures): FullFeatureRow {
  // ── Step 1: Sentinel flag + nullify 96/98 (identik dengan Python) ────────
  // Python: df[f'{col}_is_96_or_98'] = df[col].isin([96, 98]).astype(int)
  //         df.loc[df[col] >= 96, col] = np.nan
  const val3059 = raw['NumberOfTime30-59DaysPastDueNotWorse']
  const val6089 = raw['NumberOfTime60-89DaysPastDueNotWorse']
  const val90   = raw.NumberOfTimes90DaysLate

  const flag3059 = (val3059 === 96 || val3059 === 98) ? 1 : 0
  const flag6089 = (val6089 === 96 || val6089 === 98) ? 1 : 0
  const flag90   = (val90   === 96 || val90   === 98) ? 1 : 0

  // Nilai asli di-null-kan jika >= 96 (backend imputer mengisi dengan median)
  const clean3059: number | null = val3059 >= 96 ? null : val3059
  const clean6089: number | null = val6089 >= 96 ? null : val6089
  const clean90:   number | null = val90   >= 96 ? null : val90

  // ── Step 2: Income missing flag ───────────────────────────────────────────
  // Python: df['Income_Missing_Flag'] = df['MonthlyIncome'].isna().astype(int)
  const income: number | null = (!raw.MonthlyIncome || isNaN(raw.MonthlyIncome))
    ? null
    : raw.MonthlyIncome
  const incomeMissingFlag = income === null ? 1 : 0

  // ── Step 3: Monthly_Debt = DebtRatio × MonthlyIncome ─────────────────────
  // Python mengalikan sebelum imputation → NaN jika income NaN
  const monthlyDebt: number | null = income === null
    ? null
    : raw.DebtRatio * income

  // ── Step 4: Income_Per_Dependent = MonthlyIncome / (dependents + 1) ──────
  const dependents = raw.NumberOfDependents ?? 0
  const incomePerDep: number | null = income === null
    ? null
    : income / (dependents + 1)

  return {
    RevolvingUtilizationOfUnsecuredLines:               raw.RevolvingUtilizationOfUnsecuredLines,
    age:                                                raw.age,
    'NumberOfTime30-59DaysPastDueNotWorse':             clean3059,
    DebtRatio:                                          raw.DebtRatio,
    MonthlyIncome:                                      income,
    NumberOfOpenCreditLinesAndLoans:                    raw.NumberOfOpenCreditLinesAndLoans,
    NumberOfTimes90DaysLate:                            clean90,
    NumberRealEstateLoansOrLines:                       raw.NumberRealEstateLoansOrLines,
    'NumberOfTime60-89DaysPastDueNotWorse':             clean6089,
    NumberOfDependents:                                 dependents,
    // 3 sentinel flags
    'NumberOfTime30-59DaysPastDueNotWorse_is_96_or_98': flag3059,
    'NumberOfTime60-89DaysPastDueNotWorse_is_96_or_98': flag6089,
    'NumberOfTimes90DaysLate_is_96_or_98':              flag90,
    // Derived
    Income_Missing_Flag:                                incomeMissingFlag,
    Monthly_Debt:                                       monthlyDebt,
    Income_Per_Dependent:                               incomePerDep,
  }
}

// ── API client ─────────────────────────────────────────────────────────────

export const creditApi = {
  health: () =>
    api.get<{ status: string; model_loaded: boolean; test_rows: number }>('/health'),

  auditSample: (n_samples: number, seed?: number) =>
    api.post<AuditResult[]>('/audit/sample', { n_samples, seed }),

  auditPredict: (payload: NasabahFeatures[]) =>
    api.post<AuditResult[]>('/audit/predict', payload.map(applyFeatureEngineering)),
}