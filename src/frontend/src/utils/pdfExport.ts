import jsPDF from 'jspdf'
import type { AuditResult } from '../types/audit'

export function exportAuditPDF(results: AuditResult[], batchId?: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const ml = 20   // margin left
  const mr = 20   // margin right
  const pw = doc.internal.pageSize.getWidth() - ml - mr
  let y = ml

  const line = (txt: string, size = 11, weight: 'normal' | 'bold' = 'normal', gap = 5) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', weight)
    const lines = doc.splitTextToSize(txt, pw) as string[]
    lines.forEach((l) => {
      if (y > 272) { doc.addPage(); y = ml }
      doc.text(l, ml, y)
      y += size * 0.42
    })
    y += gap
  }

  const rule = () => {
    doc.setDrawColor(200, 196, 192)
    doc.line(ml, y, ml + pw, y)
    y += 6
  }

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFillColor(20, 20, 19)
  doc.roundedRect(ml, y, pw, 22, 4, 4, 'F')
  doc.setTextColor(243, 240, 238)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Laporan Audit Risiko Kredit AI', ml + 8, y + 9)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`POJK 40/2024 · XAI + RAG · ${new Date().toLocaleString('id-ID')}`, ml + 8, y + 16)
  doc.setTextColor(20, 20, 19)
  y += 30

  // ── Summary bar ─────────────────────────────────────────────────────────
  if (batchId) line(`Batch ID: ${batchId}`, 9, 'normal', 2)
  line(`Total nasabah diaudit: ${results.length}`, 10, 'bold')
  const lulus = results.filter(r => r.status === 'LULUS').length
  const tolak = results.filter(r => r.status === 'TOLAK').length
  const avgProb = (results.reduce((s, r) => s + r.prob, 0) / results.length * 100).toFixed(1)
  line(`Lulus: ${lulus}  |  Tolak: ${tolak}  |  Rata-rata probabilitas gagal bayar: ${avgProb}%`, 10)
  rule()

  // ── Per-nasabah ──────────────────────────────────────────────────────────
  results.forEach((r, i) => {
    if (y > 240) { doc.addPage(); y = ml }

    // Card header
    const headerColor = r.status === 'TOLAK' ? [155, 28, 28] : r.prob > 0.4 ? [180, 83, 9] : [45, 106, 79]
    doc.setFillColor(...(headerColor as [number, number, number]))
    doc.roundedRect(ml, y, pw, 8, 2, 2, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `Nasabah #${i + 1} · ${r.status} · Prob: ${(r.prob * 100).toFixed(1)}%`,
      ml + 4, y + 5.5
    )
    doc.setTextColor(20, 20, 19)
    y += 12

    line(`Faktor dominan: ${r.feat_name}`, 10, 'bold', 2)
    line(r.value_meaning, 9, 'normal', 4)

    // SHAP top 5
    line('Kontribusi SHAP:', 9, 'bold', 1)
    Object.entries(r.shap_top)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 5)
      .forEach(([feat, val]) => {
        const dir = val > 0 ? '▲ risiko naik' : '▼ risiko turun'
        line(`  ${feat}: ${val > 0 ? '+' : ''}${val.toFixed(4)}  (${dir})`, 8, 'normal', 1)
      })
    y += 2

    // Legal report
    line('Laporan Audit Hukum:', 9, 'bold', 1)
    line(r.report, 9, 'normal', 2)

    // Request ID kecil di bawah
    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.text(`ref: ${r.request_id}`, ml, y)
    doc.setTextColor(20, 20, 19)
    y += 6

    rule()
  })

  doc.save(`audit-kredit-${Date.now()}.pdf`)
}