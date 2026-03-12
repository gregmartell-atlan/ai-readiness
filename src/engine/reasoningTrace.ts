import type { UseCase, MaturityBand, SignalId } from '../types/scoring'
import type { SignalScore, WeightRedistribution } from '../types/assessment'
import { getMaturityConfig } from './scoringEngine'
import { getSignalById } from '../data/signalDefinitions'

/**
 * Build a Claude-style reasoning trace for a use case assessment.
 *
 * This produces a step-by-step explanation of how the composite
 * score was derived, including fallback decisions and weight
 * redistribution logic.
 */
export function buildReasoningTrace(
  useCase: UseCase,
  scopeLabel: string,
  signalScores: SignalScore[],
  redistributions: WeightRedistribution[],
  compositeScore: number,
  maturityBand: MaturityBand,
): string[] {
  const trace: string[] = []
  const mc = getMaturityConfig(maturityBand)

  // Phase 1: Scope
  trace.push(
    `## Phase 1: Scope Resolution\n` +
    `Evaluating **${useCase.name}** readiness for scope: **${scopeLabel}**.\n` +
    `This use case requires ${useCase.signals.length} signals: ${useCase.signals.map(s => getSignalById(s.signalId).name).join(', ')}.`
  )

  // Phase 2: Availability
  const fallbacks = redistributions.filter(r => r.from !== r.to && r.amount > 0)
  const unavailableSignals = redistributions.filter(r => r.amount === 0 && r.from === r.to)

  if (fallbacks.length > 0 || unavailableSignals.length > 0) {
    let availText = `## Phase 2: Signal Availability Check\n`
    if (fallbacks.length > 0) {
      availText += `**${fallbacks.length} signal(s) unavailable** in this scope — activating fallback chains:\n`
      for (const fb of fallbacks) {
        const fromSig = getSignalById(fb.from)
        const toSig = getSignalById(fb.to)
        availText += `- ❌ **${fromSig.name}** → ✅ **${toSig.name}** (+${fb.amount}w) — ${fb.reason}\n`
      }
    }
    if (unavailableSignals.length > 0) {
      availText += `\n**${unavailableSignals.length} signal(s) removed** (no fallback chain):\n`
      for (const us of unavailableSignals) {
        availText += `- ⚠️ ${getSignalById(us.from).name}: ${us.reason}\n`
      }
    }
    trace.push(availText)
  } else {
    trace.push(
      `## Phase 2: Signal Availability Check\n` +
      `All ${useCase.signals.length} signals are available in this scope. No fallback chains activated.`
    )
  }

  // Phase 3: Weight redistribution
  const hasRedistribution = fallbacks.length > 0
  if (hasRedistribution) {
    let weightText = `## Phase 3: Adaptive Weight Redistribution\n`
    weightText += `Original weights → Effective weights after fallback:\n`
    for (const ss of signalScores) {
      const changed = ss.originalWeight !== ss.effectiveWeight || ss.isFallback
      const marker = changed ? '🔄' : '✅'
      weightText += `- ${marker} **${ss.signalName}**: ${ss.originalWeight}w → ${ss.effectiveWeight}w`
      if (ss.isFallback) {
        weightText += ` *(fallback from ${getSignalById(ss.fallbackFrom!).name})*`
      }
      weightText += `\n`
    }
    trace.push(weightText)
  } else {
    trace.push(
      `## Phase 3: Weight Distribution\n` +
      `All weights applied as configured. No redistribution needed.`
    )
  }

  // Phase 4: Measurement
  let measureText = `## Phase 4: Signal Measurement\n`
  measureText += `| Signal | Score | Assets | Weight | Contribution |\n`
  measureText += `|--------|-------|--------|--------|-------------|\n`
  const totalWeight = signalScores.reduce((s, ss) => s + ss.effectiveWeight, 0)
  for (const ss of signalScores) {
    const contribution = totalWeight > 0
      ? Math.round((ss.effectiveWeight * ss.score / totalWeight) * 10) / 10
      : 0
    measureText += `| ${ss.signalName}${ss.isFallback ? ' ⚡' : ''} | ${ss.score}% | ${ss.assetsPassing}/${ss.assetsTotal} | ${ss.effectiveWeight} | ${contribution}% |\n`
  }
  trace.push(measureText)

  // Phase 5: Composite
  trace.push(
    `## Phase 5: Composite Score\n` +
    `**Formula:** Σ(signal_weight × signal_score) / Σ(signal_weight)\n\n` +
    `**Result:** ${compositeScore}% → ${mc.emoji} **${mc.label}**\n\n` +
    `**Recommended Action:** ${mc.action}`
  )

  return trace
}
