import React from 'react'
import type { UseCaseResult } from '../../types/assessment'
import CapabilityCard from './CapabilityCard'
import './CapabilityGrid.css'

interface CapabilityGridProps {
  results: UseCaseResult[]
  selectedUseCaseId: string | null
  onSelect: (result: UseCaseResult) => void
}

export default function CapabilityGrid({
  results,
  selectedUseCaseId,
  onSelect,
}: CapabilityGridProps) {
  return (
    <div className="capability-grid-container">
      <div className="capability-grid-header">
        <h2 className="capability-grid-title">Use Case Readiness</h2>
        <p className="capability-grid-subtitle">
          Select a capability to view scoring details and evidence
        </p>
      </div>
      <div className="capability-grid">
        {results.map(r => (
          <CapabilityCard
            key={r.useCase.id}
            result={r}
            isSelected={selectedUseCaseId === r.useCase.id}
            onClick={() => onSelect(r)}
          />
        ))}
      </div>
    </div>
  )
}
