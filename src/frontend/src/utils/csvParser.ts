import Papa from 'papaparse'
import type { NasabahFeatures, FeatureKey } from '../types/audit'
import { FEATURE_KEYS } from '../types/audit'

export interface CSVParseResult {
  data:   NasabahFeatures[]
  errors: string[]
  total:  number
}

export function parseAuditCSV(file: File): Promise<CSVParseResult> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const errors: string[] = []
        const headers = result.meta.fields ?? []

        // Cek kolom yang hilang
        const missing = FEATURE_KEYS.filter((c) => !headers.includes(c))
        if (missing.length > 0) {
          resolve({
            data: [],
            errors: [`Kolom tidak ditemukan: ${missing.join(', ')}`],
            total: 0,
          })
          return
        }

        const data: NasabahFeatures[] = []
        result.data.forEach((row, i) => {
          const entry = {} as NasabahFeatures
          let rowHasError = false

          FEATURE_KEYS.forEach((col: FeatureKey) => {
            const raw = row[col]?.trim()
            const val = parseFloat(raw)
            if (raw === '' || raw === undefined || isNaN(val)) {
              errors.push(`Baris ${i + 2}, kolom "${col}": nilai tidak valid ("${raw}")`)
              rowHasError = true
              entry[col] = 0
            } else {
              entry[col] = val
            }
          })

          if (!rowHasError || errors.length < 20) {
            // Tetap masukkan row meskipun ada error (dengan nilai 0 sebagai fallback)
            data.push(entry)
          }
        })

        if (errors.length > 20) {
          errors.splice(20, errors.length - 20, `... dan ${errors.length - 20} error lainnya`)
        }

        resolve({ data, errors, total: result.data.length })
      },
      error: (err) => {
        resolve({ data: [], errors: [`Gagal membaca file: ${err.message}`], total: 0 })
      },
    })
  })
}