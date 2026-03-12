import type { ScopeNode, ScopeSignalData } from '../../types/assessment'
import type { ScopeFilter, SignalId } from '../../types/scoring'

export type CatalogLayer = 'gold' | 'bronze'

const OVERVIEW_PATH = '/api/mdlh/overview'
const HEALTH_PATH = '/api/mdlh/health'
const SCOPES_PATH = '/api/mdlh/scopes'
const POLARIS_CONFIG_PATH = '/api/mdlh/config/polaris'
const DEFAULT_TIMEOUT_MS = 12_000
const HEAVY_QUERY_TIMEOUT_MS = 45_000

const SIGNAL_IDS: SignalId[] = [
  'description',
  'ownership',
  'lineage',
  'classifications',
  'freshness',
  'dq_checks',
  'readme',
  'glossary_terms',
  'custom_metadata',
  'certification',
  'domain_assignment',
  'popularity',
]

export interface PolarisConfigResponse {
  polaris_client_id: string
  polaris_oauth_uri: string
  polaris_endpoint: string
  catalog_name: string
  gold_namespace: string
  polaris_role_name: string
  is_configured: boolean
  missing_fields?: string[]
}

export interface PolarisConfigUpdate {
  polaris_client_id?: string
  polaris_client_secret?: string
  polaris_oauth_uri?: string
  polaris_endpoint?: string
  catalog_name?: string
  gold_namespace?: string
  polaris_role_name?: string
}

export interface PolarisUpdateResult {
  success: boolean
  message: string
  is_configured: boolean
  missing_fields?: string[]
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function getRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
  }

  if (!payload || typeof payload !== 'object') return []
  const candidate = payload as Record<string, unknown>

  const directRows = ['rows', 'data', 'result', 'results']
    .map(key => candidate[key])
    .find(value => Array.isArray(value))

  if (Array.isArray(directRows)) {
    const columns = Array.isArray(candidate.columns)
      ? (candidate.columns as unknown[]).filter((col): col is string => typeof col === 'string')
      : []

    if (directRows.length > 0 && Array.isArray(directRows[0]) && columns.length > 0) {
      return (directRows as unknown[][]).map(row =>
        Object.fromEntries(columns.map((column, index) => [column, row[index]])),
      )
    }

    return directRows.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
  }

  return []
}

function normalizeSignalMap(signals: Record<string, unknown>, total: number): ScopeSignalData {
  const normalized: ScopeSignalData = {}

  for (const signalId of SIGNAL_IDS) {
    const signal = signals[signalId]
    if (!signal || typeof signal !== 'object') continue

    const numeric = signal as Record<string, unknown>
    normalized[signalId] = {
      passing: toNumber(numeric.passing),
      total: toNumber(numeric.total) || total,
    }
  }

  return normalized
}

function parseOverviewPayload(payload: unknown): ScopeSignalData | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>

  const signalContainer =
    (record.signal_counts as Record<string, unknown> | undefined) ??
    (record.signalCounts as Record<string, unknown> | undefined) ??
    (record.signals as Record<string, unknown> | undefined)

  if (!signalContainer || typeof signalContainer !== 'object') return null

  const totalAssets =
    toNumber(record.total_assets) ||
    toNumber(record.totalAssets) ||
    1

  const normalized = normalizeSignalMap(signalContainer, totalAssets)
  return Object.keys(normalized).length > 0 ? normalized : null
}

function parseScopeTreePayload(payload: unknown): ScopeNode[] | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  if (!record.ok) return null
  if (!Array.isArray(record.tree)) return null
  return record.tree as ScopeNode[]
}

function quoteSql(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

type ColumnMap = Map<string, string>

function toColumnMap(columnNames: string[]): ColumnMap {
  const map = new Map<string, string>()
  for (const name of columnNames) {
    map.set(name.toLowerCase(), name)
  }
  return map
}

function pickColumn(columns: ColumnMap, ...candidates: string[]): string | null {
  for (const candidate of candidates) {
    const actual = columns.get(candidate.toLowerCase())
    if (actual) return quoteIdent(actual)
  }
  return null
}

function sqlNonEmpty(columnSql: string): string {
  return `${columnSql} IS NOT NULL AND trim(cast(${columnSql} as varchar)) NOT IN ('', '[]', 'null', 'NULL')`
}

function sqlTruthy(columnSql: string): string {
  return `upper(trim(cast(${columnSql} as varchar))) IN ('TRUE', 'T', '1')`
}

function sqlPositive(columnSql: string): string {
  return `try_cast(${columnSql} as double) > 0`
}

function joinWithOr(parts: string[]): string {
  return parts.length > 0 ? parts.map(p => `(${p})`).join(' OR ') : 'FALSE'
}

function buildScopeClause(
  scope: ScopeFilter,
  columns: ColumnMap,
  assetTypes?: string[],
): string {
  const clauses: string[] = []
  const effectiveTypes = assetTypes && assetTypes.length > 0
    ? assetTypes
    : ['Table', 'View', 'MaterializedView']

  const assetTypeCol = pickColumn(columns, 'ASSET_TYPE', 'typeName')
  const connectorCol = pickColumn(columns, 'CONNECTOR_NAME', 'connectorName')
  const connectionCol = pickColumn(columns, 'CONNECTION_QUALIFIED_NAME', 'connectionQualifiedName')
  const databaseCol = pickColumn(columns, 'DATABASE_NAME', 'databaseName', 'SCHEMA_DATABASE_NAME')
  const schemaCol = pickColumn(columns, 'SCHEMA_NAME', 'schemaName')

  if (assetTypeCol) {
    clauses.push(
      `upper(cast(${assetTypeCol} as varchar)) IN (${effectiveTypes.map(t => quoteSql(t.toUpperCase())).join(', ')})`,
    )
  }

  if (scope.connectorName && connectorCol) {
    clauses.push(`lower(cast(${connectorCol} as varchar)) = lower(${quoteSql(scope.connectorName)})`)
  }
  if (scope.connectionQualifiedName && connectionCol) {
    clauses.push(`cast(${connectionCol} as varchar) = ${quoteSql(scope.connectionQualifiedName)}`)
  }
  if (scope.databaseName && databaseCol) {
    clauses.push(`upper(cast(${databaseCol} as varchar)) = upper(${quoteSql(scope.databaseName)})`)
  }
  if (scope.schemaName && schemaCol) {
    clauses.push(`upper(cast(${schemaCol} as varchar)) = upper(${quoteSql(scope.schemaName)})`)
  }

  if (clauses.length === 0) return ''
  return `WHERE ${clauses.join(' AND ')}`
}

function buildSignalQuery(
  scope: ScopeFilter,
  columnNames: string[],
  assetTypes?: string[],
): string {
  const columns = toColumnMap(columnNames)
  const whereClause = buildScopeClause(scope, columns, assetTypes)

  const descCol = pickColumn(columns, 'DESCRIPTION', 'description')
  const userDescCol = pickColumn(columns, 'USER_DESCRIPTION', 'userDescription')
  const ownerUsersCol = pickColumn(columns, 'OWNER_USERS', 'ownerUsers')
  const ownerGroupsCol = pickColumn(columns, 'OWNER_GROUPS', 'ownerGroups')
  const lineageCol = pickColumn(columns, 'HAS_LINEAGE', 'hasLineage')
  const classificationsCol = pickColumn(columns, 'TAGS', '__traitNames')
  const freshnessCol = pickColumn(columns, 'SOURCE_UPDATED_AT', 'sourceUpdatedAt')
  const freshnessProxyCol = pickColumn(columns, 'UPDATED_AT', 'updatedAt')
  const readmeBoolCol = pickColumn(columns, 'HAS_README')
  const readmeRefCol = pickColumn(columns, 'README_GUID', 'readme', 'assetSourceReadme')
  const glossaryCol = pickColumn(columns, 'TERM_GUIDS', 'meanings')
  const certCol = pickColumn(columns, 'CERTIFICATE_STATUS', 'certificateStatus')
  const popularityCol = pickColumn(columns, 'POPULARITY_SCORE', 'popularityScore')
  const dqSodaCol = pickColumn(columns, 'assetSodaCheckCount', 'sodaCheckCount')
  const dqAnomaloCol = pickColumn(columns, 'assetAnomaloCheckCount', 'anomaloCheckCount')
  const dqMonitorCol = pickColumn(columns, 'assetMcIsMonitored', 'mcIsMonitored')
  const dqResultCol = pickColumn(columns, 'assetDQResult')
  const customMetaCol = pickColumn(columns, 'CUSTOM_METADATA', 'customMetadata', 'assetPolicyGUIDs')
  const customMetaCountCol = pickColumn(columns, 'assetPoliciesCount')
  const domainCol = pickColumn(columns, 'DOMAIN_GUIDS', 'domainGuids', 'domainGUIDs')

  const descriptionExpr = descCol && userDescCol
    ? `coalesce(nullif(trim(cast(${descCol} as varchar)), ''), nullif(trim(cast(${userDescCol} as varchar)), '')) IS NOT NULL`
    : descCol
      ? sqlNonEmpty(descCol)
      : userDescCol
        ? sqlNonEmpty(userDescCol)
        : 'FALSE'

  const ownershipExpr = joinWithOr(
    [ownerUsersCol, ownerGroupsCol].filter(Boolean).map(col => sqlNonEmpty(col!)),
  )
  const classificationsExpr = classificationsCol ? sqlNonEmpty(classificationsCol) : 'FALSE'
  const freshnessTarget = freshnessCol ?? freshnessProxyCol
  const freshnessExpr = freshnessTarget
    ? `try_cast(${freshnessTarget} as bigint) IS NOT NULL AND DATEDIFF('day', epoch_ms(try_cast(${freshnessTarget} as bigint)), CURRENT_DATE) <= 90`
    : 'FALSE'
  const readmeExpr = joinWithOr([
    readmeBoolCol ? sqlTruthy(readmeBoolCol) : '',
    readmeRefCol ? sqlNonEmpty(readmeRefCol) : '',
  ].filter(Boolean))
  const glossaryExpr = glossaryCol ? sqlNonEmpty(glossaryCol) : 'FALSE'
  const dqExpr = joinWithOr([
    dqSodaCol ? sqlPositive(dqSodaCol) : '',
    dqAnomaloCol ? sqlPositive(dqAnomaloCol) : '',
    dqMonitorCol ? sqlTruthy(dqMonitorCol) : '',
    dqResultCol ? sqlNonEmpty(dqResultCol) : '',
  ].filter(Boolean))
  const customMetaExpr = joinWithOr([
    customMetaCol ? sqlNonEmpty(customMetaCol) : '',
    customMetaCountCol ? sqlPositive(customMetaCountCol) : '',
  ].filter(Boolean))
  const domainExpr = domainCol ? sqlNonEmpty(domainCol) : 'FALSE'

  return `
WITH assets AS (
  SELECT *
  FROM ASSETS a
  ${whereClause}
)
SELECT
  (SELECT COUNT(*) FROM assets) AS total_assets,
  (SELECT COUNT(*) FROM assets WHERE ${descriptionExpr}) AS description_passing,
  (SELECT COUNT(*) FROM assets WHERE ${ownershipExpr}) AS ownership_passing,
  (SELECT COUNT(*) FROM assets WHERE ${lineageCol ? sqlTruthy(lineageCol) : 'FALSE'}) AS lineage_passing,
  (SELECT COUNT(*) FROM assets WHERE ${classificationsExpr}) AS classifications_passing,
  (SELECT COUNT(*) FROM assets WHERE ${freshnessExpr}) AS freshness_passing,
  (SELECT COUNT(*) FROM assets WHERE ${readmeExpr}) AS readme_passing,
  (SELECT COUNT(*) FROM assets WHERE ${glossaryExpr}) AS glossary_terms_passing,
  (SELECT COUNT(*) FROM assets WHERE ${certCol ? `upper(trim(cast(${certCol} as varchar))) = 'VERIFIED'` : 'FALSE'}) AS certification_passing,
  (SELECT COUNT(*) FROM assets WHERE ${popularityCol ? sqlPositive(popularityCol) : 'FALSE'}) AS popularity_passing,
  (SELECT COUNT(*) FROM assets WHERE ${dqExpr}) AS dq_checks_passing,
  (SELECT COUNT(*) FROM assets WHERE ${customMetaExpr}) AS custom_metadata_passing,
  (SELECT COUNT(*) FROM assets WHERE ${domainExpr}) AS domain_assignment_passing
`.trim()
}

function parseQueryPayload(payload: unknown): ScopeSignalData | null {
  const rows = getRows(payload)
  if (rows.length === 0) return null

  const row = rows[0]
  const total = toNumber(row.total_assets)
  if (total <= 0) return null

  const data: ScopeSignalData = {}
  for (const signalId of SIGNAL_IDS) {
    const passing = toNumber(row[`${signalId}_passing`])
    data[signalId] = { passing, total }
  }

  return data
}

function extractColumnNames(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return []
  const record = payload as Record<string, unknown>

  const directColumns = record.columns
  if (Array.isArray(directColumns)) {
    const names = directColumns
      .map(col => {
        if (typeof col === 'string') return col
        if (col && typeof col === 'object' && typeof (col as Record<string, unknown>).name === 'string') {
          return (col as Record<string, unknown>).name as string
        }
        return ''
      })
      .filter(Boolean)
    if (names.length > 0) return names
  }

  const rows = getRows(payload)
  if (rows.length === 0) return []
  return Object.keys(rows[0] ?? {})
}

async function fetchJson(path: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })

    const contentType = response.headers.get('content-type') || ''
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text()

    if (!response.ok) {
      const detail = typeof payload === 'object' && payload !== null
        ? (
            (payload as Record<string, unknown>).message ||
            (payload as Record<string, unknown>).error ||
            (payload as Record<string, unknown>).detail ||
            response.statusText
          )
        : (payload || response.statusText)
      throw new Error(`Request failed: ${response.status} ${String(detail)}`)
    }

    return payload
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function toOverviewQuery(
  scope: ScopeFilter,
  layer: CatalogLayer,
  assetTypes?: string[],
): string {
  const params = new URLSearchParams()
  params.set('layer', layer)

  if (scope.connectorName) params.set('connector', scope.connectorName)
  if (scope.connectionQualifiedName) params.set('connection', scope.connectionQualifiedName)
  if (scope.databaseName) params.set('database', scope.databaseName)
  if (scope.schemaName) params.set('schema', scope.schemaName)
  if (assetTypes && assetTypes.length > 0) {
    for (const assetType of assetTypes) {
      params.append('assetType', assetType)
    }
  }

  const qs = params.toString()
  return qs ? `${OVERVIEW_PATH}?${qs}` : OVERVIEW_PATH
}

function toScopesQuery(layer: CatalogLayer): string {
  const params = new URLSearchParams()
  params.set('layer', layer)
  return `${SCOPES_PATH}?${params.toString()}`
}

const scopeRequestInFlight = new Map<string, Promise<ScopeSignalData | null>>()

export async function checkMdlhHealth(): Promise<boolean> {
  try {
    await fetchJson(HEALTH_PATH, { method: 'GET' }, 8000)
    return true
  } catch {
    return false
  }
}

export async function getScopeSignalData(
  scope: ScopeFilter,
  layer: CatalogLayer = 'gold',
  assetTypes?: string[],
): Promise<ScopeSignalData | null> {
  const key = `${layer}:${JSON.stringify(scope)}:${JSON.stringify(assetTypes ?? [])}`
  const existing = scopeRequestInFlight.get(key)
  if (existing) return existing

  const request = (async () => {
    const overviewPayload = await fetchJson(
      toOverviewQuery(scope, layer, assetTypes),
      { method: 'GET' },
      HEAVY_QUERY_TIMEOUT_MS,
    )
    return parseOverviewPayload(overviewPayload)
  })()

  scopeRequestInFlight.set(key, request)
  try {
    return await request
  } finally {
    scopeRequestInFlight.delete(key)
  }
}

export async function getScopeTree(layer: CatalogLayer = 'gold'): Promise<ScopeNode[]> {
  const payload = await fetchJson(toScopesQuery(layer), { method: 'GET' }, HEAVY_QUERY_TIMEOUT_MS)
  const parsed = parseScopeTreePayload(payload)
  return parsed ?? []
}

export async function getPolarisConfig(): Promise<PolarisConfigResponse> {
  const payload = await fetchJson(POLARIS_CONFIG_PATH, { method: 'GET' }, 8000)
  return payload as PolarisConfigResponse
}

export async function updatePolarisConfig(
  update: PolarisConfigUpdate,
): Promise<PolarisUpdateResult> {
  const payload = await fetchJson(POLARIS_CONFIG_PATH, {
    method: 'PUT',
    body: JSON.stringify(update),
  }, 12000)
  return payload as PolarisUpdateResult
}

export async function testPolarisConnection(): Promise<PolarisUpdateResult> {
  const payload = await fetchJson(`${POLARIS_CONFIG_PATH}/test`, { method: 'POST' }, 12000)
  return payload as PolarisUpdateResult
}
