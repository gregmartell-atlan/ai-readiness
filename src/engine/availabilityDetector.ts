import type { SignalId } from '../types/scoring'
import type { SignalAvailability, ScopeSignalData } from '../types/assessment'
import { getSignalById } from '../data/signalDefinitions'

/**
 * Scope-aware signal availability detection.
 *
 * A signal is "available" within a scope when its penetration
 * exceeds the defined threshold. Signals like description and
 * ownership are always available (threshold = 0). Conditional
 * signals like DQ checks require ≥5% penetration to count.
 */
export function detectAvailability(
  signalId: SignalId,
  data: ScopeSignalData,
  totalAssets: number,
): SignalAvailability {
  const sigDef = getSignalById(signalId)
  const sigData = data[signalId]

  if (!sigData) {
    return {
      signalId,
      available: sigDef.availabilityThreshold === 0,
      penetration: 0,
      assetsCovered: 0,
      totalAssets,
    }
  }

  const penetration =
    sigData.total > 0 ? sigData.passing / sigData.total : 0

  return {
    signalId,
    available: penetration >= sigDef.availabilityThreshold || sigDef.availabilityThreshold === 0,
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
