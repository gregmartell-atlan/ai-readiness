import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  CircleDot,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Upload,
} from 'lucide-react'
import EvidenceDrawer from '../components/EvidenceDrawer/EvidenceDrawer'
import { SCOPE_TREE, MOCK_SIGNAL_DATA } from '../data/mockData'
import { USE_CASES } from '../data/useCases'
import { ASSET_TYPE_OPTIONS } from '../data/signalDefinitions'
import { computeFullAssessment } from '../engine/scoringEngine'
import type { ScopeNode, ScopeSignalData, UseCaseResult } from '../types/assessment'
import type { ScopeFilter, SignalId } from '../types/scoring'
import {
  getScopeSignalData,
  getScopeTree,
  type CatalogLayer,
} from '../services/mdlh/qualityApi'
import './AssessmentPage.css'

type BucketTab = 'all' | 'created' | 'archived'

interface BucketMetric {
  id: SignalId
  label: string
  value: number
}

const PRODUCT_TABS: ReadonlyArray<{ label: string, active?: boolean }> = [
  { label: 'Context Enrichment' },
  { label: 'Context Engineering' },
  { label: 'Observability' },
  { label: 'AI Readiness Assessments', active: true },
]
const BUCKET_TABS: ReadonlyArray<{ id: BucketTab, label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'created', label: 'Created by You' },
  { id: 'archived', label: 'Archived' },
]

export default function AssessmentPage() {
  const [selectedScopeId, setSelectedScopeId] = useState('tenant')
  const [selectedResult, setSelectedResult] = useState<UseCaseResult | null>(null)
  const [liveSignalData, setLiveSignalData] = useState<ScopeSignalData | null>(null)
  const [liveStatus, setLiveStatus] = useState<'checking' | 'live' | 'fallback'>('checking')
  const [scopeTree, setScopeTree] = useState<ScopeNode[]>(SCOPE_TREE)
  const [scopeTreeReady, setScopeTreeReady] = useState(false)
  const [layer, setLayer] = useState<CatalogLayer>('gold')
  const [bucketTab, setBucketTab] = useState<BucketTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>(() =>
    ASSET_TYPE_OPTIONS.map(option => option.typeName),
  )

  useEffect(() => {
    document.title = 'AI Readiness Assessments'
  }, [])

  const selectedScope = useMemo<ScopeFilter>(() => {
    return findScopeById(scopeTree, selectedScopeId)?.scope ?? {
      level: 'tenant',
      label: 'home.atlan.com',
    }
  }, [scopeTree, selectedScopeId])

  useEffect(() => {
    let active = true

    async function loadScopeTree() {
      setScopeTreeReady(false)
      setSelectedResult(null)
      setLiveSignalData(null)
      try {
        const liveTree = await getScopeTree(layer)
        if (!active || liveTree.length === 0) return
        setScopeTree(liveTree)
        setSelectedScopeId(current => {
          return findScopeById(liveTree, current) ? current : liveTree[0]?.id ?? current
        })
      } catch {
        if (!active) return
        setScopeTree(SCOPE_TREE)
      } finally {
        if (!active) return
        setScopeTreeReady(true)
      }
    }

    void loadScopeTree()
    return () => {
      active = false
    }
  }, [layer])

  useEffect(() => {
    let active = true
    if (!scopeTreeReady) return

    async function loadScopeData() {
      setLiveStatus('checking')

      try {
        const data = await getScopeSignalData(
          selectedScope,
          layer,
          selectedAssetTypes,
        )
        if (!active) return

        if (data) {
          setLiveSignalData(data)
          setLiveStatus('live')
          return
        }
      } catch {
        // Fallback to static demo data when live MDLH query route fails.
      }

      if (!active) return
      setLiveSignalData(null)
      setLiveStatus('fallback')
    }

    void loadScopeData()
    return () => {
      active = false
    }
  }, [selectedScope, layer, selectedAssetTypes, scopeTreeReady])

  const assessment = useMemo(() => {
    const mockKey = scopeToMockKey(selectedScope)
    const data = liveSignalData ?? MOCK_SIGNAL_DATA[mockKey] ?? MOCK_SIGNAL_DATA[selectedScopeId] ?? MOCK_SIGNAL_DATA.tenant
    return computeFullAssessment(USE_CASES, data, selectedScope)
  }, [liveSignalData, selectedScope, selectedScopeId, selectedAssetTypes])

  const flattenedScopes = useMemo(() => flattenScopes(scopeTree), [scopeTree])
  const sortedUseCases = useMemo(
    () => [...assessment.useCaseResults].sort((a, b) => b.compositeScore - a.compositeScore),
    [assessment.useCaseResults],
  )
  const visibleUseCases = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return sortedUseCases.filter(result => {
      if (!matchesBucketTab(result, bucketTab)) return false
      if (!query) return true
      return (
        result.useCase.name.toLowerCase().includes(query) ||
        result.useCase.shortName.toLowerCase().includes(query) ||
        result.useCase.description.toLowerCase().includes(query)
      )
    })
  }, [bucketTab, searchQuery, sortedUseCases])
  const sideCoverage = useMemo(() => {
    return [
      { label: 'Description', value: getSignalCoverage(assessment.useCaseResults, 'description') },
      { label: 'Terms', value: getSignalCoverage(assessment.useCaseResults, 'glossary_terms') },
      { label: 'Read Me', value: getSignalCoverage(assessment.useCaseResults, 'readme') },
    ]
  }, [assessment.useCaseResults])
  const assetsCovered = useMemo(
    () => Math.max(0, ...assessment.useCaseResults.map(getAssetTotal)),
    [assessment.useCaseResults],
  )

  const handleScopeSelect = (scopeId: string) => {
    setSelectedScopeId(scopeId)
    setSelectedResult(null)
  }

  const handleUseCaseSelect = (result: UseCaseResult) => {
    setSelectedResult(
      selectedResult?.useCase.id === result.useCase.id ? null : result,
    )
  }

  return (
    <div className="atlan-shell">
      <nav className="atlan-top-tabs" aria-label="Product Sections">
        {PRODUCT_TABS.map(tab => (
          <button
            key={tab.label}
            type="button"
            className={`atlan-top-tab ${tab.active ? 'is-active' : ''}`}
          >
            <CircleDot size={14} strokeWidth={1.75} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <header className="atlan-page-header">
        <div className="atlan-title-wrap">
          <button type="button" className="atlan-ghost-icon" aria-label="Back">
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1>AI Readiness Assessments</h1>
            <p>Track readiness signals across your governed metadata scope.</p>
          </div>
        </div>
        <div className="atlan-header-actions">
          <button
            type="button"
            className="atlan-btn atlan-btn-primary"
          >
            <Plus size={15} />
            <span>New assessment</span>
          </button>
          <button type="button" className="atlan-btn atlan-btn-secondary">
            <Upload size={14} />
            <span>Upload CSV</span>
          </button>
          <Link to="/settings" className="atlan-btn atlan-btn-icon" aria-label="Settings">
            <MoreHorizontal size={14} />
          </Link>
        </div>
      </header>

      <section className="atlan-toolbar">
        <div className="atlan-segmented">
          {BUCKET_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`atlan-segmented-btn ${bucketTab === tab.id ? 'is-active' : ''}`}
              onClick={() => setBucketTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="atlan-toolbar-right">
          <label className="atlan-search">
            <Search size={14} />
            <input
              type="search"
              placeholder="Search assessments..."
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
            />
          </label>

          <label className="atlan-select-wrap">
            <select
              value={
                selectedAssetTypes.length === ASSET_TYPE_OPTIONS.length
                  ? 'all'
                  : selectedAssetTypes[0] ?? 'all'
              }
              onChange={event => {
                const value = event.target.value
                if (value === 'all') {
                  setSelectedAssetTypes(ASSET_TYPE_OPTIONS.map(option => option.typeName))
                  return
                }
                setSelectedAssetTypes([value])
              }}
            >
              <option value="all">All asset types</option>
              {ASSET_TYPE_OPTIONS.map(option => (
                <option key={option.typeName} value={option.typeName}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="atlan-select-wrap">
            <select
              value={layer}
              onChange={event => setLayer(event.target.value as CatalogLayer)}
            >
              <option value="gold">Gold layer</option>
              <option value="bronze">Bronze layer</option>
            </select>
          </label>

          <label className="atlan-select-wrap atlan-scope-select">
            <select
              value={selectedScopeId}
              onChange={event => handleScopeSelect(event.target.value)}
            >
              {flattenedScopes.map(scope => (
                <option key={scope.id} value={scope.id}>
                  {scope.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="atlan-btn atlan-btn-icon"
            onClick={() => {
              setSelectedResult(null)
              setLiveStatus('checking')
            }}
            aria-label="Refresh assessment"
          >
            <RefreshCw size={14} />
          </button>

          <span className={`atlan-status atlan-status-${liveStatus}`}>
            {liveStatus === 'live' ? 'Live' : liveStatus === 'checking' ? 'Checking...' : 'Fallback'}
          </span>
        </div>
      </section>

      <main className="atlan-main-grid">
        <section className="atlan-list-panel" aria-label="Assessments list">
          {visibleUseCases.length === 0 && (
            <div className="atlan-empty-state">
              <h2>No assessments match this filter</h2>
              <p>Try changing tabs, filters, or search keywords.</p>
            </div>
          )}

          {visibleUseCases.map(result => {
            const metrics = getBucketMetrics(result)
            const isSelected = selectedResult?.useCase.id === result.useCase.id
            const assetCount = getAssetTotal(result)
            const activeSignalCount = result.signalScores.filter(signal => signal.score >= 50).length
            return (
              <button
                key={result.useCase.id}
                type="button"
                className={`bucket-card ${isSelected ? 'is-selected' : ''}`}
                onClick={() => handleUseCaseSelect(result)}
                style={{ '--bucket-accent': result.useCase.color } as React.CSSProperties}
              >
                <div className="bucket-card-header">
                  <div className="bucket-card-body">
                    <h3>{result.useCase.name}</h3>
                    <p>{result.useCase.description}</p>
                  </div>

                  <div className="bucket-badges">
                    <span>{assetCount.toLocaleString()} assets in scope</span>
                    <span>{activeSignalCount} signals passing</span>
                  </div>
                </div>

                <div className="bucket-metrics">
                  {metrics.map(metric => {
                    const tone = getTone(metric.value)
                    return (
                      <div key={metric.id} className="bucket-metric">
                        <span>{metric.label}</span>
                        <div className="bucket-metric-bar">
                          <div
                            className={`bucket-metric-fill tone-${tone}`}
                            style={{ width: `${metric.value}%` }}
                          />
                        </div>
                        <strong className={`tone-${tone}`}>{formatPercent(metric.value)}</strong>
                      </div>
                    )
                  })}
                </div>
              </button>
            )
          })}
        </section>

        <aside className="atlan-right-stack">
          <section className="atlan-side-card">
            <h2>At a glance</h2>

            <div className="atlan-side-stats">
              <div className="side-stat">
                <span>Active assessments</span>
                <strong>{visibleUseCases.length}</strong>
              </div>
              <div className="side-stat">
                <span>Assets in scope</span>
                <strong>{assetsCovered.toLocaleString()}</strong>
              </div>
            </div>

            <div className="side-divider" />

            <h3>Assessment Coverage</h3>
            <div className="side-coverage">
              {sideCoverage.map(item => {
                const tone = getTone(item.value)
                return (
                  <div key={item.label} className="side-coverage-row">
                    <div className="side-coverage-head">
                      <span>{item.label}</span>
                      <strong className={`tone-${tone}`}>{formatPercent(item.value)}</strong>
                    </div>
                    <div className="bucket-metric-bar">
                      <div className={`bucket-metric-fill tone-${tone}`} style={{ width: `${item.value}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="atlan-side-card">
            <h2>Activity</h2>
            <p className="side-activity-time">
              Last refreshed {new Date(assessment.timestamp).toLocaleString()}
            </p>
            <Link to="/results" className="side-activity-link">
              View assessment results
            </Link>
          </section>
        </aside>
      </main>

      {selectedResult && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/35"
            onClick={() => setSelectedResult(null)}
            aria-label="Close details"
          />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[560px] shadow-dropdown bg-atlan-surface">
          <EvidenceDrawer
            result={selectedResult}
            onClose={() => setSelectedResult(null)}
          />
          </div>
        </>
      )}
    </div>
  )
}

function matchesBucketTab(result: UseCaseResult, tab: BucketTab): boolean {
  if (tab === 'created') return result.compositeScore >= 65
  if (tab === 'archived') return result.compositeScore < 40
  return true
}

function getSignalLabel(signalId: SignalId): string {
  switch (signalId) {
    case 'glossary_terms':
      return 'Terms'
    case 'readme':
      return 'Read Me'
    case 'dq_checks':
      return 'DQ checks'
    case 'custom_metadata':
      return 'Metadata'
    case 'domain_assignment':
      return 'Domains'
    default:
      return signalId
        .replace(/_/g, ' ')
        .replace(/\b\w/g, character => character.toUpperCase())
  }
}

function getBucketMetrics(result: UseCaseResult): BucketMetric[] {
  const preferredIds: SignalId[] = ['description', 'glossary_terms', 'readme']
  const picked = new Set<SignalId>()
  const metrics: BucketMetric[] = []

  for (const signalId of preferredIds) {
    const signal = result.signalScores.find(entry => entry.signalId === signalId)
    if (!signal) continue
    picked.add(signalId)
    metrics.push({
      id: signalId,
      label: getSignalLabel(signalId),
      value: signal.score,
    })
  }

  if (metrics.length < 3) {
    const additional = [...result.signalScores]
      .sort((a, b) => b.score - a.score)
      .filter(signal => !picked.has(signal.signalId))
      .slice(0, 3 - metrics.length)
      .map(signal => ({
        id: signal.signalId,
        label: getSignalLabel(signal.signalId),
        value: signal.score,
      }))
    metrics.push(...additional)
  }

  return metrics
}

function getAssetTotal(result: UseCaseResult): number {
  return Math.max(0, ...result.signalScores.map(signal => signal.assetsTotal))
}

function getSignalCoverage(results: UseCaseResult[], signalId: SignalId): number {
  let passing = 0
  let total = 0

  for (const result of results) {
    const signal = result.signalScores.find(entry => entry.signalId === signalId)
    if (!signal) continue
    passing += signal.assetsPassing
    total += signal.assetsTotal
  }

  if (total === 0) return 0
  return (passing / total) * 100
}

function getTone(value: number): 'good' | 'warn' | 'bad' {
  if (value >= 70) return 'good'
  if (value >= 35) return 'warn'
  return 'bad'
}

function formatPercent(value: number): string {
  return `${Math.round(value * 10) / 10}%`
}

function findScopeById(nodes: ScopeNode[], id: string): ScopeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findScopeById(node.children, id)
      if (found) return found
    }
  }
  return null
}

function scopeToMockKey(scope: ScopeFilter): string {
  if (scope.databaseName) {
    return `${scope.connectorName}.${scope.databaseName}`
      .toLowerCase()
      .replace('_db', '')
  }
  if (scope.connectorName) return scope.connectorName.toLowerCase()
  return 'tenant'
}

function flattenScopes(nodes: ScopeNode[], depth = 0): ScopeNode[] {
  const flattened: ScopeNode[] = []
  for (const node of nodes) {
    const labelPrefix = depth > 0 ? `${'  '.repeat(depth)}↳ ` : ''
    flattened.push({ ...node, label: `${labelPrefix}${node.label}` })
    if (node.children) {
      flattened.push(...flattenScopes(node.children, depth + 1))
    }
  }
  return flattened
}
