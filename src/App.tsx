import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

const AssessmentPage = lazy(() => import('./pages/AssessmentPage'))
const ResultsPage = lazy(() => import('./pages/ResultsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-screen bg-atlan-bg">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-atlan-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-atlan-textSecondary text-sm">
          Loading assessment engine...
        </p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<AssessmentPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
