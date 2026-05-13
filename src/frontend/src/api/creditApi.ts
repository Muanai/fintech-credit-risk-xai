import axios from 'axios'
import type { AuditResult, NasabahFeatures } from '../types/audit'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
  timeout: 120_000,
  headers: { 'Content-Type': 'application/json' },
})

// Interceptor: log error ke console di dev
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (import.meta.env.DEV) {
      console.error('[API Error]', err.response?.status, err.response?.data ?? err.message)
    }
    return Promise.reject(err)
  }
)

export const creditApi = {
  health: () =>
    api.get<{ status: string; model_loaded: boolean; test_rows: number }>('/health'),

  auditSample: (n_samples: number, seed?: number) =>
    api.post<AuditResult[]>('/audit/sample', { n_samples, seed }),

  auditPredict: (payload: NasabahFeatures[]) =>
    api.post<AuditResult[]>('/audit/predict', payload),
}