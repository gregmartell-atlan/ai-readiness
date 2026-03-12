/* ── Signal Types ───────────────────────────────────────────── */

export type SignalId =
  | 'description'
  | 'ownership'
  | 'lineage'
  | 'classifications'
  | 'freshness'
  | 'dq_checks'
  | 'readme'
  | 'glossary_terms'
  | 'custom_metadata'
  | 'certification'
  | 'domain_assignment'
  | 'popularity'

export type MaturityBand =
  | 'critical'
  | 'developing'
  | 'defined'
  | 'managed'
  | 'optimized'

export type ScopeLevel =
  | 'tenant'
  | 'connector'
  | 'connection'
  | 'database'
  | 'schema'
  | 'domain'
  | 'product'

export interface FallbackTarget {
  signalId: SignalId
  weightShare: number
  reason: string
}

export interface SignalDefinition {
  id: SignalId
  name: string
  category: string
  iso25012: string[]
  damaDmbok: string
  goldTable: string
  goldColumns: string[]
  bronzeSource: string[]
  passCondition: string
  sqlFragment: string
  fallbackTo: FallbackTarget[]
  availabilityThreshold: number
}

export interface UseCaseSignalConfig {
  signalId: SignalId
  weight: number
  reason: string
}

export interface UseCase {
  id: string
  name: string
  shortName: string
  description: string
  icon: string
  signals: UseCaseSignalConfig[]
  color: string
}

export interface MaturityConfig {
  band: MaturityBand
  label: string
  emoji: string
  min: number
  max: number
  color: string
  bgColor: string
  action: string
}

export interface ScopeFilter {
  level: ScopeLevel
  connectorName?: string
  connectionQualifiedName?: string
  databaseName?: string
  schemaName?: string
  domainGuid?: string
  domainName?: string
  productGuid?: string
  productName?: string
  label: string
}
