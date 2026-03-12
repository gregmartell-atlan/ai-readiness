import React from 'react'
import type { UseCaseResult } from '../../types/assessment'
import { getMaturityConfig } from '../../engine/scoringEngine'
import MaturityBadge from '../shared/MaturityBadge'
import type { LucideIcon } from 'lucide-react'
import {
  Shield, BarChart3, Search, Code2, Brain, Bot,
  Workflow, Globe, Network, Lock, FileCheck,
} from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  Shield, BarChart3, Search, Code2, Brain, Bot,
  Workflow, Globe, Network, Lock, FileCheck,
}

interface CapabilityCardProps {
  result: UseCaseResult
  onClick: () => void
  isSelected: boolean
}

export default function CapabilityCard({ result, onClick, isSelected }: CapabilityCardProps) {
  const mc = getMaturityConfig(result.maturityBand)
  const Icon = ICON_MAP[result.useCase.icon] ?? Shield
  const hasFallbacks = result.weightRedistributions.length > 0

  return (
    <button
      className={`capability-card ${isSelected ? 'capability-card-selected' : ''}`}
      onClick={onClick}
      style={{
        borderColor: isSelected ? result.useCase.color : undefined,
      }}
    >
      <div className="capability-card-header">
        <div
          className="capability-card-icon"
          style={{ color: result.useCase.color }}
        >
          <Icon size={18} />
        </div>
        <MaturityBadge band={result.maturityBand} size="sm" />
      </div>

      <h4 className="capability-card-title">{result.useCase.shortName}</h4>

      <div className="capability-card-score-row">
        <div className="capability-card-score-bar-bg">
          <div
            className="capability-card-score-bar-fill"
            style={{
              width: `${Math.min(result.compositeScore, 100)}%`,
              backgroundColor: mc.color,
            }}
          />
        </div>
        <span
          className="capability-card-score-value"
          style={{ color: mc.color }}
        >
          {result.compositeScore}%
        </span>
      </div>

      <div className="capability-card-meta">
        <span>{result.signalScores.length} signals</span>
        {hasFallbacks && (
          <span className="capability-card-fallback-badge">
            ⚡ {result.weightRedistributions.length} fallback{result.weightRedistributions.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </button>
  )
}
