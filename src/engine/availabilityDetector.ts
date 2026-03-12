import type { SignalId } from '../types/scoring'
import type { SignalAvailability, ScopeSignalData } from '../types/assessment'

/**
 * Scope-aware signal availability detection.
 *
 * Threshold-based availability has been removed.
 * Signals are considered available whenever the provider returns
 * signal data for them, and scored directly from observed counts.
 */
export function detectAvailability(
  signalId: SignalId,
  data: ScopeSignalData,
  totalAssets: number,
): SignalAvailability {
  const sigData = data[signalId]

  if (!sigData) {
    return {
      signalId,
      available: false,
      penetration: 0,
      assetsCovered: 0,
      totalAssets,
    }
  }

  const penetration =
    sigData.total > 0 ? sigData.passing / sigData.total : 0

  return {
    signalId,
    available: true,
    penetration: Math.round(penetration * 1000) / 10,
    assetsCovered: sigData.passing,
    totalAssets: sigData.total,
  }
}

/**
 * Detect all signal availability for a full scope.
 */
export function detectAllAvailability(
  data: ScopeSignalData,
): SignalAvailability[] {
  const totalAssets = Math.max(
    ...Object.values(data).map(d => d?.total ?? 0),
    1,
  )

  const allSignalIds: SignalId[] = [
    'description', 'ownership', 'lineage', 'classifications',
    'freshness', 'dq_checks', 'readme', 'glossary_terms',
    'custom_metadata', 'certification', 'domain_assignment', 'popularity',
  ]

  return allSignalIds.map(id => detectAvailability(id, data, totalAssets))
}
