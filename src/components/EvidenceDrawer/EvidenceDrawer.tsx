import React, { useState } from 'react'
import { X, ChevronDown, ChevronRight, Zap, Info, Code2, ArrowRight } from 'lucide-react'
import type { UseCaseResult, SignalScore, WeightRedistribution } from '../../types/assessment'
import { getMaturityConfig } from '../../engine/scoringEngine'
import { getSignalById } from '../../data/signalDefinitions'
import MaturityBadge from '../shared/MaturityBadge'
import './EvidenceDrawer.css'

interface EvidenceDrawerProps {
  result: UseCaseResult | null
  onClose: () => void
}

function SignalRow({ ss }: { ss: SignalScore }) {
  const [expanded, setExpanded] = useState(false)
  const sigDef = getSignalById(ss.signalId)

  return (
    <div className={`signal-row ${ss.isFallback ? 'signal-row-fallback' : ''}`}>
      <button
        className="signal-row-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="signal-row-expand">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="signal-row-name">
          {ss.signalName}
          {ss.isFallback && (
            <span className="signal-fallback-tag">
              <Zap size={10} /> proxy
            </span>
          )}
        </span>
        <span className="signal-row-score-bar-wrap">
          <div className="signal-row-score-bar-bg">
            <div
              className="signal-row-score-bar-fill"
              style={{ width: `${Math.min(ss.score, 100)}%` }}
            />
          </div>
        </span>
        <span className="signal-row-score">{ss.score}%</span>
        <span className="signal-row-weight">{ss.effectiveWeight}w</span>
      </button>

      {expanded && (
        <div className="signal-row-details animate-fade-in">
          <div className="signal-detail-grid">
            <div className="signal-detail">
              <span className="signal-detail-label">Assets</span>
              <span className="signal-detail-value">
                {ss.assetsPassing.toLocaleString()} / {ss.assetsTotal.toLocaleString()}
              </span>
            </div>
            <div className="signal-detail">
              <span className="signal-detail-label">Gold Column</span>
              <span className="signal-detail-value font-mono text-xs">{ss.goldColumn}</span>
            </div>
            <div className="signal-detail">
              <span className="signal-detail-label">ISO 25012</span>
              <span className="signal-detail-value">{sigDef.iso25012.join(', ')}</span>
            </div>
            <div className="signal-detail">
              <span className="signal-detail-label">DAMA DMBOK</span>
              <span className="signal-detail-value">{sigDef.damaDmbok}</span>
            </div>
          </div>

          {ss.isFallback && ss.fallbackExplanation && (
            <div className="signal-fallback-explain">
              <Info size={14} />
              <span>{ss.fallbackExplanation}</span>
            </div>
          )}

          <div className="signal-sql-block">
            <div className="signal-sql-label">
              <Code2 size={12} /> SQL Fragment
            </div>
            <pre className="signal-sql-code">{ss.sqlFragment}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

function FallbackSection({ redistributions }: { redistributions: WeightRedistribution[] }) {
  const active = redistributions.filter(r => r.from !== r.to && r.amount > 0)
  if (active.length === 0) return null

  return (
    <div className="fallback-section">
      <h4 className="fallback-section-title">
        <Zap size={14} /> Weight Redistribution
      </h4>
      {active.map((r, i) => {
        const fromSig = getSignalById(r.from)
        const toSig = getSignalById(r.to)
        return (
          <div key={i} className="fallback-row">
            <span className="fallback-from">{fromSig.name}</span>
            <ArrowRight size={12} className="fallback-arrow" />
            <span className="fallback-to">{toSig.name}</span>
            <span className="fallback-amount">+{r.amount}w</span>
            <p className="fallback-reason">{r.reason}</p>
          </div>
        )
      })}
    </div>
  )
}

function ReasoningSection({ trace }: { trace: string[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="reasoning-section">
      <button className="reasoning-toggle" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>Reasoning Trace</span>
      </button>
      {open && (
        <div className="reasoning-content animate-fade-in">
          {trace.map((step, i) => (
            <div key={i} className="reasoning-step">
              {step.split('\n').map((line, j) => {
                if (line.startsWith('## ')) {
                  return <h5 key={j} className="reasoning-phase-title">{line.replace('## ', '')}</h5>
                }
                if (line.startsWith('| ')) {
                  return <code key={j} className="reasoning-table-line">{line}</code>
                }
                if (line.startsWith('- ')) {
                  return <p key={j} className="reasoning-bullet">{line}</p>
                }
                if (line.startsWith('**')) {
                  return <p key={j} className="reasoning-bold-line">{line}</p>
                }
                return line ? <p key={j} className="reasoning-line">{line}</p> : null
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function EvidenceDrawer({ result, onClose }: EvidenceDrawerProps) {
  if (!result) return null

  const mc = getMaturityConfig(result.maturityBand)

  return (
    <div className="evidence-drawer animate-slide-in">
      <div className="evidence-drawer-header">
        <div className="evidence-drawer-header-left">
          <h3 className="evidence-drawer-title">{result.useCase.name}</h3>
          <div className="evidence-drawer-score-row">
            <span
              className="evidence-drawer-score"
              style={{ color: mc.color }}
            >
              {result.compositeScore}%
            </span>
            <MaturityBadge band={result.maturityBand} size="md" />
          </div>
        </div>
        <button className="evidence-drawer-close" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="evidence-drawer-description">
        {result.useCase.description}
      </div>

      <div className="evidence-drawer-body">
        <h4 className="evidence-section-title">Signal Breakdown</h4>
        <div className="signal-list">
          {result.signalScores.map(ss => (
            <SignalRow key={ss.signalId} ss={ss} />
          ))}
        </div>

        <FallbackSection redistributions={result.weightRedistributions} />

        <ReasoningSection trace={result.reasoningTrace} />
      </div>
    </div>
  )
}
