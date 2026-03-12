import type { SignalId, MaturityBand, ScopeFilter, UseCase } from './scoring'

export interface SignalAvailability {
  signalId: SignalId
  available: boolean
  penetration: number
  assetsCovered: number
  totalAssets: number
}

export interface SignalScore {
  signalId: SignalId
  signalName: string
  originalWeight: number
  effectiveWeight: number
  score: number
  assetsPassing: number
  assetsTotal: number
  isFallback: boolean
  fallbackFrom?: SignalId
  fallbackExplanation?: string
  goldColumn: string
  sqlFragment: string
}

export interface WeightRedistribution {
  from: SignalId
  to: SignalId
  amount: number
  reason: string
}

export interface UseCaseResult {
  useCase: UseCase
  compositeScore: number
  maturityBand: MaturityBand
  signalScores: SignalScore[]
  reasoningTrace: string[]
  scope: ScopeFilter
  availableSignals: SignalAvailability[]
  unavailableSignals: SignalAvailability[]
  weightRedistributions: WeightRedistribution[]
}

export interface AssessmentResult {
  timestamp: string
  scope: ScopeFilter
  useCaseResults: UseCaseResult[]
  overallReadiness: number
}

export interface SignalCount {
  passing: number
  total: number
}

export type ScopeSignalData = Partial<Record<SignalId, SignalCount>>

export interface ScopeNode {
  id: string
  label: string
  scope: ScopeFilter
  children?: ScopeNode[]
  icon?: string
}
