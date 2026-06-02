import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/layout/Sidebar'

import { lazy, Suspense } from 'react'
import { LoadingSpinner } from './components/shared/LoadingSpinner'

const Dashboard        = lazy(() => import('./pages/Dashboard'))
const BatchAudit       = lazy(() => import('./pages/BatchAudit'))
const SingleAudit      = lazy(() => import('./pages/SingleAudit'))
const InspectionRoom   = lazy(() => import('./pages/InspectionRoom'))
const WhatIfSimulation = lazy(() => import('./pages/WhatIfSimulation'))

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Sidebar />
        <div className="main-content">
          <Suspense fallback={<LoadingSpinner label="Memuat halaman..." />}>
            <Routes>
              <Route path="/"         element={<Dashboard />} />
              <Route path="/audit"    element={<BatchAudit />} />
              <Route path="/single"   element={<SingleAudit />} />
              <Route path="/inspect"  element={<InspectionRoom />} />
              <Route path="/simulate" element={<WhatIfSimulation />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </BrowserRouter>
  )
}