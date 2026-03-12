import type { SignalId, UseCaseSignalConfig } from '../types/scoring'
import type {
  SignalAvailability,
  WeightRedistribution,
  ScopeSignalData,
} from '../types/assessment'
import { getSignalById } from '../data/signalDefinitions'

export interface ResolvedSignal {
  originalSignalId: SignalId
  effectiveSignalId: SignalId
  originalWeight: number
  effectiveWeight: number
  isFallback: boolean
  fallbackFrom?: SignalId
  fallbackExplanation?: string
}

interface FallbackResult {
  resolvedSignals: ResolvedSignal[]
  redistributions: WeightRedistribution[]
}

/**
 * Adaptive fallback resolver.
 *
 * When a signal is unavailable in the current scope, its weight
 * is redistributed to fallback signals according to the defined
 * fallback chains. If a fallback target also appears as a primary
 * signal, its weight is merged (additive).
 *
 * If no fallback chain exists, the signal is simply removed and
 * remaining weights are proportionally scaled up.
 */
export function resolveFallbacks(
  signals: UseCaseSignalConfig[],
  availability: SignalAvailability[],
  _data: ScopeSignalData,
): FallbackResult {
  const availMap = new Map(availability.map(a => [a.signalId, a]))
  const resolved: ResolvedSignal[] = []
  const redistributions: WeightRedistribution[] = []

  // Effective weight accumulator (handles merges)
  const weightAccum = new Map<SignalId, number>()

  for (const sc of signals) {
    const avail = availMap.get(sc.signalId)
    const isAvailable = avail?.available ?? true

    if (isAvailable) {
      // Signal available — use directly
      const existing = weightAccum.get(sc.signalId) ?? 0
      weightAccum.set(sc.signalId, existing + sc.weight)

      resolved.push({
        originalSignalId: sc.signalId,
        effectiveSignalId: sc.signalId,
        originalWeight: sc.weight,
        effectiveWeight: sc.weight,
        isFallback: false,
      })
    } else {
      // Signal unavailable — resolve fallback chain
      const sigDef = getSignalById(sc.signalId)

      if (sigDef.fallbackTo.length > 0) {
        for (const fb of sigDef.fallbackTo) {
          const fbWeight = Math.round(sc.weight * fb.weightShare * 10) / 10
          const existing = weightAccum.get(fb.signalId) ?? 0
          weightAccum.set(fb.signalId, existing + fbWeight)

          redistributions.push({
            from: sc.signalId,
            to: fb.signalId,
            amount: fbWeight,
            reason: fb.reason,
          })

          // Check if this fallback signal already appears as a primary
          const existingResolved = resolved.find(
            r => r.effectiveSignalId === fb.signalId && !r.isFallback,
          )

          if (existingResolved) {
            // Merge weight into existing primary signal
            existingResolved.effectiveWeight += fbWeight
          } else {
            resolved.push({
              originalSignalId: sc.signalId,
              effectiveSignalId: fb.signalId,
              originalWeight: sc.weight,
              effectiveWeight: fbWeight,
              isFallback: true,
              fallbackFrom: sc.signalId,
              fallbackExplanation: `${sigDef.name} unavailable in this scope. ${fb.reason}`,
            })
          }
        }
      } else {
        // No fallback chain — weight is lost (proportional scaling handles this)
        redistributions.push({
          from: sc.signalId,
          to: sc.signalId,
          amount: 0,
          reason: `${sigDef.name} unavailable with no fallback — weight redistributed proportionally`,
        })
      }
    }
  }

  // Deduplicate: merge fallback entries that target the same signal
  const deduped = new Map<SignalId, ResolvedSignal>()
  for (const rs of resolved) {
    const key = rs.effectiveSignalId
    const existing = deduped.get(key)
    if (existing) {
      existing.effectiveWeight = Math.round(
        (existing.effectiveWeight + rs.effectiveWeight) * 10,
      ) / 10

      if (!existing.isFallback) {
        continue
      }

      if (!rs.isFallback) {
        // Primary signal metadata should take precedence when present.
        existing.originalSignalId = rs.originalSignalId
        existing.originalWeight = rs.originalWeight
        existing.isFallback = false
        existing.fallbackFrom = undefined
        existing.fallbackExplanation = undefined
      } else {
        existing.originalWeight = Math.round(
          (existing.originalWeight + rs.originalWeight) * 10,
        ) / 10
      }
    } else {
      deduped.set(key, { ...rs })
    }
  }

  return {
    resolvedSignals: Array.from(deduped.values()),
    redistributions,
  }
}
