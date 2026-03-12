/* ── MDLH Gold Layer Schema Types ───────────────────────────── */

export interface GoldAsset {
  GUID: string
  QUALIFIED_NAME: string
  NAME: string
  DISPLAY_NAME: string | null
  ASSET_TYPE: string
  CONNECTOR_NAME: string
  CONNECTION_QUALIFIED_NAME: string
  DATABASE_NAME: string | null
  SCHEMA_NAME: string | null
  DESCRIPTION: string | null
  USER_DESCRIPTION: string | null
  OWNER_USERS: string[]
  OWNER_GROUPS: string[]
  CERTIFICATE_STATUS: string | null
  CERTIFICATE_STATUS_MESSAGE: string | null
  HAS_LINEAGE: boolean
  HAS_README: boolean
  README_GUID: string | null
  TAGS: string[]
  TERM_GUIDS: string[]
  POPULARITY_SCORE: number
  SOURCE_UPDATED_AT: number | null
  UPDATED_AT: number
  CREATED_AT: number
  DOMAIN_GUIDS: string[]
  PRODUCT_GUIDS: string[]
}

export interface GoldTag {
  ASSET_GUID: string
  TAG_NAME: string
  TAG_VALUE: string | null
  TAG_SOURCE: string
  PROPAGATED: boolean
}

export interface GoldLineage {
  START_GUID: string
  RELATED_GUID: string
  DIRECTION: 'upstream' | 'downstream'
  LEVEL: number
}

export interface GoldDataQuality {
  ASSET_GUID: string
  CHECK_NAME: string
  CHECK_STATUS: string
  CHECK_TYPE: string
  LAST_SCAN_AT: number | null
  SOURCE_TOOL: string
}

export interface GoldReadme {
  GUID: string
  ASSET_GUID: string
  DESCRIPTION: string
}

export interface GoldCustomMetadata {
  ASSET_GUID: string
  CUSTOM_METADATA_NAME: string
  ATTRIBUTE_NAME: string
  ATTRIBUTE_VALUE: string
}

export interface GoldTermAssignment {
  ASSET_GUID: string
  TERM_GUID: string
  TERM_NAME: string
  TERM_DESCRIPTION: string | null
}

export interface GoldDomainAsset {
  ASSET_GUID: string
  DOMAIN_GUID: string
  DOMAIN_NAME: string
  PRODUCT_GUID: string | null
  PRODUCT_NAME: string | null
}

/* ── MDLH Gold Layer Table Definitions ──────────────────────── */

export interface GoldColumnDef {
  name: string
  type: string
  description: string
  nullable: boolean
}

export interface GoldTableDef {
  table: string
  description: string
  columns: GoldColumnDef[]
}

export const GOLD_SCHEMA: GoldTableDef[] = [
  {
    table: 'GOLD_ASSETS',
    description: 'Central fact table — one row per cataloged asset with all inline signals',
    columns: [
      { name: 'GUID', type: 'VARCHAR', description: 'Unique asset identifier', nullable: false },
      { name: 'QUALIFIED_NAME', type: 'VARCHAR', description: 'Full asset path', nullable: false },
      { name: 'NAME', type: 'VARCHAR', description: 'Asset short name', nullable: false },
      { name: 'DISPLAY_NAME', type: 'VARCHAR', description: 'Human-readable display name', nullable: true },
      { name: 'ASSET_TYPE', type: 'VARCHAR', description: 'Entity type: Table, Column, View, etc.', nullable: false },
      { name: 'CONNECTOR_NAME', type: 'VARCHAR', description: 'Source connector (snowflake, databricks, etc.)', nullable: false },
      { name: 'CONNECTION_QUALIFIED_NAME', type: 'VARCHAR', description: 'Connection path', nullable: false },
      { name: 'DATABASE_NAME', type: 'VARCHAR', description: 'Database name', nullable: true },
      { name: 'SCHEMA_NAME', type: 'VARCHAR', description: 'Schema name', nullable: true },
      { name: 'DESCRIPTION', type: 'VARCHAR', description: 'System-populated description', nullable: true },
      { name: 'USER_DESCRIPTION', type: 'VARCHAR', description: 'User-authored description', nullable: true },
      { name: 'OWNER_USERS', type: 'ARRAY<VARCHAR>', description: 'Owning user emails', nullable: true },
      { name: 'OWNER_GROUPS', type: 'ARRAY<VARCHAR>', description: 'Owning group names', nullable: true },
      { name: 'CERTIFICATE_STATUS', type: 'VARCHAR', description: 'VERIFIED, DRAFT, DEPRECATED, or null', nullable: true },
      { name: 'HAS_LINEAGE', type: 'BOOLEAN', description: 'Whether lineage exists for this asset', nullable: false },
      { name: 'HAS_README', type: 'BOOLEAN', description: 'Whether documentation exists', nullable: false },
      { name: 'README_GUID', type: 'VARCHAR', description: 'Linked readme GUID', nullable: true },
      { name: 'TAGS', type: 'ARRAY<VARCHAR>', description: 'Classification tag names', nullable: true },
      { name: 'TERM_GUIDS', type: 'ARRAY<VARCHAR>', description: 'Linked glossary term GUIDs', nullable: true },
      { name: 'POPULARITY_SCORE', type: 'DOUBLE', description: 'Usage popularity score', nullable: false },
      { name: 'SOURCE_UPDATED_AT', type: 'BIGINT', description: 'Source system last update (epoch ms)', nullable: true },
      { name: 'UPDATED_AT', type: 'BIGINT', description: 'Atlan last update (epoch ms)', nullable: false },
      { name: 'CREATED_AT', type: 'BIGINT', description: 'Atlan creation time (epoch ms)', nullable: false },
      { name: 'DOMAIN_GUIDS', type: 'ARRAY<VARCHAR>', description: 'Domain GUIDs', nullable: true },
      { name: 'PRODUCT_GUIDS', type: 'ARRAY<VARCHAR>', description: 'Data product GUIDs', nullable: true },
    ],
  },
  {
    table: 'GOLD_TAGS',
    description: 'Classification details — one row per asset×tag relationship',
    columns: [
      { name: 'ASSET_GUID', type: 'VARCHAR', description: 'Owning asset GUID', nullable: false },
      { name: 'TAG_NAME', type: 'VARCHAR', description: 'Classification/tag name', nullable: false },
      { name: 'TAG_VALUE', type: 'VARCHAR', description: 'Tag value (if enum)', nullable: true },
      { name: 'TAG_SOURCE', type: 'VARCHAR', description: 'Where tag originated', nullable: false },
      { name: 'PROPAGATED', type: 'BOOLEAN', description: 'Whether tag was propagated via lineage', nullable: false },
    ],
  },
  {
    table: 'GOLD_LINEAGE',
    description: 'Multi-hop lineage traversal — one row per asset→related asset edge',
    columns: [
      { name: 'START_GUID', type: 'VARCHAR', description: 'Origin asset GUID', nullable: false },
      { name: 'RELATED_GUID', type: 'VARCHAR', description: 'Related asset GUID', nullable: false },
      { name: 'DIRECTION', type: 'VARCHAR', description: 'upstream or downstream', nullable: false },
      { name: 'LEVEL', type: 'INT', description: 'Hop distance from origin', nullable: false },
    ],
  },
  {
    table: 'GOLD_DATA_QUALITY_DETAILS',
    description: 'DQ check results — one row per asset×check (Soda, Anomalo, Monte Carlo)',
    columns: [
      { name: 'ASSET_GUID', type: 'VARCHAR', description: 'Target asset GUID', nullable: false },
      { name: 'CHECK_NAME', type: 'VARCHAR', description: 'Check name', nullable: false },
      { name: 'CHECK_STATUS', type: 'VARCHAR', description: 'pass, fail, warn, error', nullable: false },
      { name: 'CHECK_TYPE', type: 'VARCHAR', description: 'Check category', nullable: true },
      { name: 'LAST_SCAN_AT', type: 'BIGINT', description: 'Last check run (epoch ms)', nullable: true },
      { name: 'SOURCE_TOOL', type: 'VARCHAR', description: 'Soda, Anomalo, MonteCarlo', nullable: false },
    ],
  },
  {
    table: 'GOLD_README',
    description: 'Documentation content — one row per readme',
    columns: [
      { name: 'GUID', type: 'VARCHAR', description: 'Readme GUID', nullable: false },
      { name: 'ASSET_GUID', type: 'VARCHAR', description: 'Owning asset GUID', nullable: false },
      { name: 'DESCRIPTION', type: 'VARCHAR', description: 'Readme markdown content', nullable: false },
    ],
  },
  {
    table: 'GOLD_CUSTOM_METADATA',
    description: 'Custom metadata attributes — one row per asset×attribute',
    columns: [
      { name: 'ASSET_GUID', type: 'VARCHAR', description: 'Target asset GUID', nullable: false },
      { name: 'CUSTOM_METADATA_NAME', type: 'VARCHAR', description: 'CM set name', nullable: false },
      { name: 'ATTRIBUTE_NAME', type: 'VARCHAR', description: 'Attribute key', nullable: false },
      { name: 'ATTRIBUTE_VALUE', type: 'VARCHAR', description: 'Attribute value', nullable: false },
    ],
  },
  {
    table: 'GOLD_TERM_ASSIGNMENTS',
    description: 'Glossary term → asset mappings',
    columns: [
      { name: 'ASSET_GUID', type: 'VARCHAR', description: 'Target asset GUID', nullable: false },
      { name: 'TERM_GUID', type: 'VARCHAR', description: 'Glossary term GUID', nullable: false },
      { name: 'TERM_NAME', type: 'VARCHAR', description: 'Term display name', nullable: false },
      { name: 'TERM_DESCRIPTION', type: 'VARCHAR', description: 'Term description', nullable: true },
    ],
  },
  {
    table: 'GOLD_DOMAIN_ASSETS',
    description: 'Domain → Product → Asset mapping',
    columns: [
      { name: 'ASSET_GUID', type: 'VARCHAR', description: 'Target asset GUID', nullable: false },
      { name: 'DOMAIN_GUID', type: 'VARCHAR', description: 'Domain GUID', nullable: false },
      { name: 'DOMAIN_NAME', type: 'VARCHAR', description: 'Domain display name', nullable: false },
      { name: 'PRODUCT_GUID', type: 'VARCHAR', description: 'Data product GUID', nullable: true },
      { name: 'PRODUCT_NAME', type: 'VARCHAR', description: 'Data product name', nullable: true },
    ],
  },
]

/* ── Bronze Layer Key Attributes ────────────────────────────── */

export interface BronzeAttributeDef {
  attribute: string
  entityTables: string[]
  type: string
  description: string
  mapsToGoldColumn: string
}

export const BRONZE_KEY_ATTRIBUTES: BronzeAttributeDef[] = [
  { attribute: 'description', entityTables: ['Table', 'Column', 'View', 'MaterializedView'], type: 'string', description: 'System-populated description from source', mapsToGoldColumn: 'DESCRIPTION' },
  { attribute: 'userDescription', entityTables: ['Table', 'Column', 'View', 'MaterializedView'], type: 'string', description: 'User-authored description in Atlan', mapsToGoldColumn: 'USER_DESCRIPTION' },
  { attribute: 'ownerUsers', entityTables: ['*'], type: 'array<string>', description: 'Owner user emails', mapsToGoldColumn: 'OWNER_USERS' },
  { attribute: 'ownerGroups', entityTables: ['*'], type: 'array<string>', description: 'Owner group names', mapsToGoldColumn: 'OWNER_GROUPS' },
  { attribute: 'hasLineage', entityTables: ['*'], type: 'boolean', description: 'Whether lineage exists', mapsToGoldColumn: 'HAS_LINEAGE' },
  { attribute: '__traitNames', entityTables: ['*'], type: 'array<string>', description: 'Directly applied classification names', mapsToGoldColumn: 'TAGS' },
  { attribute: '__propagatedTraitNames', entityTables: ['*'], type: 'array<string>', description: 'Lineage-propagated classification names', mapsToGoldColumn: 'TAGS' },
  { attribute: 'sourceUpdatedAt', entityTables: ['*'], type: 'long (epoch ms)', description: 'Last update in source system', mapsToGoldColumn: 'SOURCE_UPDATED_AT' },
  { attribute: 'certificateStatus', entityTables: ['*'], type: 'string', description: 'VERIFIED / DRAFT / DEPRECATED', mapsToGoldColumn: 'CERTIFICATE_STATUS' },
  { attribute: 'popularityScore', entityTables: ['*'], type: 'double', description: 'Usage-based popularity', mapsToGoldColumn: 'POPULARITY_SCORE' },
  { attribute: 'meanings', entityTables: ['*'], type: 'array<AtlasGlossaryTerm>', description: 'Linked glossary term refs', mapsToGoldColumn: 'TERM_GUIDS' },
  { attribute: 'readme', entityTables: ['*'], type: 'array<Readme>', description: 'Linked readme GUIDs', mapsToGoldColumn: 'HAS_README / README_GUID' },
]
