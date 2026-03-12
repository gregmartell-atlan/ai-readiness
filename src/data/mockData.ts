import type { ScopeSignalData, ScopeNode } from '../types/assessment'
import type { ScopeFilter } from '../types/scoring'

/* ── Mock signal data per scope ─────────────────────────────── */

function s(passing: number, total: number) {
  return { passing, total }
}

export const MOCK_SIGNAL_DATA: Record<string, ScopeSignalData> = {
  tenant: {
    description: s(4200, 8500),
    ownership: s(5100, 8500),
    lineage: s(3400, 8500),
    classifications: s(2800, 8500),
    freshness: s(6100, 8500),
    dq_checks: s(0, 8500),
    readme: s(1200, 8500),
    glossary_terms: s(900, 8500),
    custom_metadata: s(600, 8500),
    certification: s(1800, 8500),
    domain_assignment: s(3200, 8500),
    popularity: s(5500, 8500),
  },
  snowflake: {
    description: s(2800, 4200),
    ownership: s(3400, 4200),
    lineage: s(2900, 4200),
    classifications: s(2100, 4200),
    freshness: s(3800, 4200),
    dq_checks: s(0, 4200),
    readme: s(800, 4200),
    glossary_terms: s(600, 4200),
    custom_metadata: s(400, 4200),
    certification: s(1200, 4200),
    domain_assignment: s(2200, 4200),
    popularity: s(3600, 4200),
  },
  'snowflake.analytics': {
    description: s(420, 500),
    ownership: s(480, 500),
    lineage: s(450, 500),
    classifications: s(380, 500),
    freshness: s(490, 500),
    dq_checks: s(0, 500),
    readme: s(200, 500),
    glossary_terms: s(150, 500),
    custom_metadata: s(120, 500),
    certification: s(350, 500),
    domain_assignment: s(400, 500),
    popularity: s(470, 500),
  },
  'snowflake.raw': {
    description: s(180, 1200),
    ownership: s(400, 1200),
    lineage: s(900, 1200),
    classifications: s(300, 1200),
    freshness: s(1100, 1200),
    dq_checks: s(0, 1200),
    readme: s(50, 1200),
    glossary_terms: s(20, 1200),
    custom_metadata: s(30, 1200),
    certification: s(100, 1200),
    domain_assignment: s(200, 1200),
    popularity: s(800, 1200),
  },
  databricks: {
    description: s(800, 2800),
    ownership: s(1000, 2800),
    lineage: s(300, 2800),
    classifications: s(400, 2800),
    freshness: s(1500, 2800),
    dq_checks: s(0, 2800),
    readme: s(200, 2800),
    glossary_terms: s(100, 2800),
    custom_metadata: s(80, 2800),
    certification: s(300, 2800),
    domain_assignment: s(500, 2800),
    popularity: s(1200, 2800),
  },
  powerbi: {
    description: s(600, 1500),
    ownership: s(700, 1500),
    lineage: s(200, 1500),
    classifications: s(300, 1500),
    freshness: s(800, 1500),
    dq_checks: s(0, 1500),
    readme: s(200, 1500),
    glossary_terms: s(200, 1500),
    custom_metadata: s(100, 1500),
    certification: s(300, 1500),
    domain_assignment: s(500, 1500),
    popularity: s(900, 1500),
  },
}

/* ── Scope navigation tree ──────────────────────────────────── */

function scope(level: ScopeFilter['level'], label: string, extra?: Partial<ScopeFilter>): ScopeFilter {
  return { level, label, ...extra }
}

export const SCOPE_TREE: ScopeNode[] = [
  {
    id: 'tenant',
    label: 'home.atlan.com (All Assets)',
    icon: 'Globe',
    scope: scope('tenant', 'home.atlan.com'),
    children: [
      {
        id: 'snowflake',
        label: 'Snowflake',
        icon: 'Snowflake',
        scope: scope('connector', 'Snowflake', { connectorName: 'snowflake' }),
        children: [
          {
            id: 'snowflake.analytics',
            label: 'ANALYTICS_DB',
            icon: 'Database',
            scope: scope('database', 'ANALYTICS_DB', { connectorName: 'snowflake', databaseName: 'ANALYTICS_DB' }),
          },
          {
            id: 'snowflake.raw',
            label: 'RAW_DB',
            icon: 'Database',
            scope: scope('database', 'RAW_DB', { connectorName: 'snowflake', databaseName: 'RAW_DB' }),
          },
        ],
      },
      {
        id: 'databricks',
        label: 'Databricks',
        icon: 'Zap',
        scope: scope('connector', 'Databricks', { connectorName: 'databricks' }),
      },
      {
        id: 'powerbi',
        label: 'Power BI',
        icon: 'BarChart3',
        scope: scope('connector', 'Power BI', { connectorName: 'powerbi' }),
      },
    ],
  },
]
