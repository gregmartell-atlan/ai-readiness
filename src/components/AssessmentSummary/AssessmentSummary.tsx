import React from 'react'
import type { AssessmentResult } from '../../types/assessment'
import { getMaturityConfig, getMaturityBand } from '../../engine/scoringEngine'
import MaturityBadge from '../shared/MaturityBadge'
import { Activity, TrendingUp, AlertTriangle, CheckCircle2, Circle } from 'lucide-react'
import './AssessmentSummary.css'

interface AssessmentSummaryProps {
  result: AssessmentResult
}

export default function AssessmentSummary({ result }: AssessmentSummaryProps) {
  const overallBand = getMaturityBand(result.overallReadiness)
  const mc = getMaturityConfig(overallBand)

  const managed = result.useCaseResults.filter(r => r.compositeScore >= 76).length
  const critical = result.useCaseResults.filter(r => r.compositeScore <= 25).length
  const totalFallbacks = result.useCaseResults.reduce(
    (s, r) => s + r.weightRedistributions.filter(w => w.from !== w.to && w.amount > 0).length,
    0,
  )
  const topUseCases = [...result.useCaseResults]
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, 8)

  return (
    <div className="assessment-summary-layout">
      <section className="assessment-summary assessment-summary-overview">
        <div className="summary-widget-header">
          <h2 className="summary-title">Overview</h2>
          <span className="summary-scope">{result.scope.label}</span>
        </div>

        <div className="summary-overall-row">
          <div className="summary-overall-icon">
            <Circle size={16} />
          </div>
          <div className="summary-overall-stat">
            <span className="summary-overall-label">Overall readiness</span>
            <span className="summary-overall-score" style={{ color: mc.color }}>
              {result.overallReadiness}%
            </span>
          </div>
        </div>

        <div className="summary-stats">
          <div className="summary-stat">
            <div className="summary-stat-icon" style={{ color: '#3C71DF' }}>
              <Activity size={14} />
            </div>
            <div className="summary-stat-content">
              <span className="summary-stat-value">{result.useCaseResults.length}</span>
              <span className="summary-stat-label">Use cases</span>
            </div>
          </div>

          <div className="summary-stat">
            <div className="summary-stat-icon" style={{ color: '#00B28A' }}>
              <CheckCircle2 size={14} />
            </div>
            <div className="summary-stat-content">
              <span className="summary-stat-value">{managed}</span>
              <span className="summary-stat-label">Managed+</span>
            </div>
          </div>

          <div className="summary-stat">
            <div className="summary-stat-icon" style={{ color: '#3C71DF' }}>
              <AlertTriangle size={14} />
            </div>
            <div className="summary-stat-content">
              <span className="summary-stat-value">{critical}</span>
              <span className="summary-stat-label">Critical</span>
            </div>
          </div>

          <div className="summary-stat">
            <div className="summary-stat-icon" style={{ color: '#F7B43D' }}>
              <TrendingUp size={14} />
            </div>
            <div className="summary-stat-content">
              <span className="summary-stat-value">{totalFallbacks}</span>
              <span className="summary-stat-label">Fallbacks</span>
            </div>
          </div>
        </div>

        <div className="summary-badge-row">
          <span className="summary-overall-label">Maturity band</span>
          <MaturityBadge band={overallBand} size="md" />
        </div>
      </section>

      <section className="assessment-summary">
        <div className="summary-widget-header">
          <h2 className="summary-title">Use case categories</h2>
          <span className="summary-scope">Top readiness scores</span>
        </div>

        <div className="summary-categories-grid">
          {topUseCases.map(useCaseResult => (
            <div key={useCaseResult.useCase.id} className="summary-category-item">
              <div
                className="summary-category-dot"
                style={{ backgroundColor: `${useCaseResult.useCase.color}22`, color: useCaseResult.useCase.color }}
              >
                <Circle size={12} />
              </div>
              <div className="summary-category-content">
                <span className="summary-category-value">{useCaseResult.compositeScore}%</span>
                <span className="summary-category-label">{useCaseResult.useCase.shortName}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="summary-overall">
          <span className="summary-overall-score" style={{ color: mc.color }}>
            {result.overallReadiness}%
          </span>
          <MaturityBadge band={overallBand} size="md" />
        </div>
      </section>
    </div>
  )
}
