import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function ResultsPage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-atlan-bg text-atlan-text p-4">
      <div className="text-center bg-atlan-surface border border-atlan-border rounded-2xl px-8 py-10 shadow-rc">
        <h1 className="text-2xl font-semibold text-atlan-text mb-4">
          Detailed Results
        </h1>
        <p className="text-atlan-textSecondary mb-8">
          Export and historical comparison coming soon.
        </p>
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-atlan-primary text-white rounded-lg hover:bg-atlan-primaryHover transition-colors text-sm font-medium shadow-btn"
        >
          <ArrowLeft size={16} />
          Back to Assessment
        </button>
      </div>
    </div>
  )
}
