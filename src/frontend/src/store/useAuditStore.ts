import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AuditResult, NasabahFeatures, FeatureKey } from '../types/audit'

interface AuditStore {
  // ── Audit history (session) ────────────────────────────────────────────
  auditHistory: AuditResult[]
  addResults:   (results: AuditResult[]) => void
  clearHistory: () => void

  // ── Selected nasabah → Inspection Room ────────────────────────────────
  selectedNasabah: AuditResult | null
  setSelectedNasabah: (n: AuditResult | null) => void

  // ── What-If simulation ─────────────────────────────────────────────────
  simInputs:    Partial<NasabahFeatures>
  simResult:    AuditResult | null
  simBaseline:  AuditResult | null  // snapshot sebelum simulasi
  setSimInput:  (key: FeatureKey, value: number) => void
  setSimInputs: (inputs: Partial<NasabahFeatures>) => void
  setSimResult: (r: AuditResult | null) => void
  setSimBaseline: (r: AuditResult | null) => void
  resetSim:     () => void

  // ── UI state ───────────────────────────────────────────────────────────
  isLoading: boolean
  setLoading: (v: boolean) => void
  lastSeed:  number
  setLastSeed: (s: number) => void
}

export const useAuditStore = create<AuditStore>()(
  persist(
    (set) => ({
      auditHistory: [],
      addResults: (results) =>
        set((s) => ({
          auditHistory: [
            ...results,            // terbaru di atas
            ...s.auditHistory,
          ].slice(0, 200),         // cap 200 agar sessionStorage tidak penuh
        })),
      clearHistory: () => set({ auditHistory: [] }),

      selectedNasabah: null,
      setSelectedNasabah: (n) => set({ selectedNasabah: n }),

      simInputs: {},
      simResult: null,
      simBaseline: null,
      setSimInput: (key, value) =>
        set((s) => ({ simInputs: { ...s.simInputs, [key]: value } })),
      setSimInputs: (inputs) => set({ simInputs: inputs }),
      setSimResult: (r) => set({ simResult: r }),
      setSimBaseline: (r) => set({ simBaseline: r }),
      resetSim: () => set({ simInputs: {}, simResult: null, simBaseline: null }),

      isLoading: false,
      setLoading: (v) => set({ isLoading: v }),
      lastSeed: 42,
      setLastSeed: (s) => set({ lastSeed: s }),
    }),
    {
      name: 'credit-audit-session',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        auditHistory:    s.auditHistory,
        selectedNasabah: s.selectedNasabah,
        simInputs:       s.simInputs,
        lastSeed:        s.lastSeed,
      }),
    }
  )
)