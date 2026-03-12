import type { MaturityBand, ScopeFilter, UseCase } from '../types/scoring'
import type {
  SignalScore,
  UseCaseResult,
  AssessmentResult,
  WeightRedistribution,
  ScopeSignalData,
} from '../types/assessment'
import { SIGNALS, MATURITY_BANDS, getSignalById } from '../data/signalDefinitions'
import { detectAvailability } from './availabilityDetector'
import { resolveFallbacks } from './fallbackResolver'
import { buildReasoningTrace } from './reasoningTrace'

export function computeUseCaseScore(
  useCase: UseCase,
  data: ScopeSignalData,
  scope: ScopeFilter,
): UseCaseResult {
  const totalAssets = Math.max(
    ...Object.values(data).map(d => d?.total ?? 0),
    1,
  )

  // Phase 1: Detect availability per signal in this use case
  const availResults = useCase.signals.map(sc =>
    detectAvailability(sc.signalId, data, totalAssets),
  )
  const available = availResults.filter(a => a.available)
  const unavailable = availResults.filter(a => !a.available)

  // Phase 2: Resolve fallbacks and redistribute weights
  const { resolvedSignals, redistributions } = resolveFallbacks(
    useCase.signals,
    availResults,
    data,
  )

  // Phase 3: Compute per-signal scores
  const signalScores: SignalScore[] = resolvedSignals.map(rs => {
    const sigDef = getSignalById(rs.effectiveSignalId)
    const sigData = data[rs.effectiveSignalId]
    const passing = sigData?.passing ?? 0
    const total = sigData?.total ?? totalAssets
    const score = total > 0 ? (passing / total) * 100 : 0

    return {
      signalId: rs.effectiveSignalId,
      signalName: sigDef.name,
      originalWeight: rs.originalWeight,
      effectiveWeight: rs.effectiveWeight,
      score: Math.round(score * 10) / 10,
      assetsPassing: passing,
      assetsTotal: total,
      isFallback: rs.isFallback,
      fallbackFrom: rs.fallbackFrom,
      fallbackExplanation: rs.fallbackExplanation,
      goldColumn: sigDef.goldColumns.join(', '),
      sqlFragment: sigDef.sqlFragment,
    }
  })

  // Phase 4: Composite weighted score
  const totalWeight = signalScores.reduce((s, ss) => s + ss.effectiveWeight, 0)
  const weightedSum = signalScores.reduce(
    (s, ss) => s + ss.effectiveWeight * ss.score,
    0,
  )
  const compositeScore =
    totalWeight > 0
      ? Math.round((weightedSum / totalWeight) * 10) / 10
      : 0

  // Phase 5: Determine maturity band
  const maturityBand = getMaturityBand(compositeScore)

  // Phase 6: Build reasoning trace
  const reasoningTrace = buildReasoningTrace(
    useCase,
    scope.label,
    signalScores,
    redistributions,
    compositeScore,
    maturityBand,
  )

  return {
    useCase,
    compositeScore,
    maturityBand,
    signalScores,
    reasoningTrace,
    scope,
    availableSignals: available,
    unavailableSignals: unavailable,
    weightRedistributions: redistributions,
  }
}

export function computeFullAssessment(
  useCases: UseCase[],
  data: ScopeSignalData,
  scope: ScopeFilter,
): AssessmentResult {
  const useCaseResults = useCases.map(uc =>
    computeUseCaseScore(uc, data, scope),
  )

  const overallReadiness =
    useCaseResults.length > 0
      ? Math.round(
          (useCaseResults.reduce((s, r) => s + r.compositeScore, 0) /
            useCaseResults.length) *
            10,
        ) / 10
      : 0

  return {
    timestamp: new Date().toISOString(),
    scope,
    useCaseResults,
    overallReadiness,
  }
}

export function getMaturityBand(score: number): MaturityBand {
  for (const band of MATURITY_BANDS) {
    if (score >= band.min && score <= band.max) return band.band
  }
  return 'critical'
}

export function getMaturityConfig(band: MaturityBand) {
  return MATURITY_BANDS.find(b => b.band === band)!
}
