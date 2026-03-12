import type { SignalDefinition, MaturityConfig, SignalId } from '../types/scoring'

export const SIGNALS: SignalDefinition[] = [
  {
    id: 'description',
    name: 'Description',
    category: 'Semantic',
    iso25012: ['Understandability', 'Completeness'],
    damaDmbok: 'Completeness',
    goldTable: 'GOLD_ASSETS',
    goldColumns: ['DESCRIPTION', 'USER_DESCRIPTION'],
    bronzeSource: ['description', 'userDescription'],
    passCondition: 'COALESCE(DESCRIPTION, USER_DESCRIPTION) is non-null and non-empty',
    sqlFragment: `COUNT(CASE WHEN COALESCE(DESCRIPTION, USER_DESCRIPTION) IS NOT NULL
  AND COALESCE(DESCRIPTION, USER_DESCRIPTION) != '' THEN 1 END)`,
    fallbackTo: [],
    availabilityThreshold: 0,
  },
  {
    id: 'ownership',
    name: 'Ownership',
    category: 'Operational',
    iso25012: ['Credibility', 'Traceability'],
    damaDmbok: 'Completeness',
    goldTable: 'GOLD_ASSETS',
    goldColumns: ['OWNER_USERS[]', 'OWNER_GROUPS[]'],
    bronzeSource: ['ownerUsers', 'ownerGroups'],
    passCondition: 'OWNER_USERS is non-null and len > 0',
    sqlFragment: `COUNT(CASE WHEN OWNER_USERS IS NOT NULL
  AND len(OWNER_USERS) > 0 THEN 1 END)`,
    fallbackTo: [],
    availabilityThreshold: 0,
  },
  {
    id: 'lineage',
    name: 'Lineage',
    category: 'Traceability',
    iso25012: ['Traceability'],
    damaDmbok: 'Consistency',
    goldTable: 'GOLD_ASSETS',
    goldColumns: ['HAS_LINEAGE'],
    bronzeSource: ['hasLineage'],
    passCondition: 'HAS_LINEAGE = TRUE',
    sqlFragment: `COUNT(CASE WHEN HAS_LINEAGE = TRUE THEN 1 END)`,
    fallbackTo: [],
    availabilityThreshold: 0,
  },
  {
    id: 'classifications',
    name: 'Classifications',
    category: 'Trust',
    iso25012: ['Compliance', 'Confidentiality'],
    damaDmbok: 'Validity',
    goldTable: 'GOLD_ASSETS / GOLD_TAGS',
    goldColumns: ['TAGS[]', 'TAG_NAME'],
    bronzeSource: ['__traitNames', 'TagRelationship'],
    passCondition: 'TAGS is non-null and len > 0',
    sqlFragment: `COUNT(CASE WHEN TAGS IS NOT NULL
  AND len(TAGS) > 0 THEN 1 END)`,
    fallbackTo: [],
    availabilityThreshold: 0,
  },
  {
    id: 'freshness',
    name: 'Freshness',
    category: 'Operational',
    iso25012: ['Currentness'],
    damaDmbok: 'Timeliness',
    goldTable: 'GOLD_ASSETS',
    goldColumns: ['SOURCE_UPDATED_AT'],
    bronzeSource: ['sourceUpdatedAt'],
    passCondition: 'SOURCE_UPDATED_AT within last 90 days',
    sqlFragment: `COUNT(CASE WHEN DATEDIFF('day',
  epoch_ms(SOURCE_UPDATED_AT), CURRENT_DATE) <= 90 THEN 1 END)`,
    fallbackTo: [],
    availabilityThreshold: 0,
  },
  {
    id: 'dq_checks',
    name: 'Data Quality Checks',
    category: 'Safety',
    iso25012: ['Accuracy'],
    damaDmbok: 'Accuracy',
    goldTable: 'GOLD_DATA_QUALITY_DETAILS',
    goldColumns: ['CHECK_STATUS', 'LAST_SCAN_AT'],
    bronzeSource: ['SodaCheck', 'AnomaloCheck', 'MonteCarloCheck'],
    passCondition: 'Asset has ≥1 row in GOLD_DATA_QUALITY_DETAILS',
    sqlFragment: `COUNT(DISTINCT dq.ASSET_GUID)`,
    fallbackTo: [
      { signalId: 'freshness', weightShare: 0.6, reason: 'Freshness approximates "pipeline is alive" (ISO 25012 Currentness)' },
      { signalId: 'popularity', weightShare: 0.4, reason: 'Popular data gets noticed faster—consumption acts as implicit quality gate (Wang & Strong contextual quality)' },
    ],
    availabilityThreshold: 0.05,
  },
  {
    id: 'readme',
    name: 'README / Documentation',
    category: 'Contextual',
    iso25012: ['Understandability'],
    damaDmbok: 'Completeness',
    goldTable: 'GOLD_ASSETS + GOLD_README',
    goldColumns: ['HAS_README', 'README_GUID'],
    bronzeSource: ['readme'],
    passCondition: 'HAS_README = TRUE',
    sqlFragment: `COUNT(CASE WHEN HAS_README = TRUE THEN 1 END)`,
    fallbackTo: [
      { signalId: 'description', weightShare: 1.0, reason: 'Description serves as minimal documentation when README absent' },
    ],
    availabilityThreshold: 0.03,
  },
  {
    id: 'glossary_terms',
    name: 'Glossary Terms',
    category: 'Semantic',
    iso25012: ['Understandability', 'Consistency'],
    damaDmbok: 'Consistency',
    goldTable: 'GOLD_ASSETS + GOLD_TERM_ASSIGNMENTS',
    goldColumns: ['TERM_GUIDS[]'],
    bronzeSource: ['meanings'],
    passCondition: 'TERM_GUIDS is non-null and len > 0',
    sqlFragment: `COUNT(CASE WHEN TERM_GUIDS IS NOT NULL
  AND len(TERM_GUIDS) > 0 THEN 1 END)`,
    fallbackTo: [
      { signalId: 'description', weightShare: 0.7, reason: 'Description text provides semantic context in absence of formal glossary' },
      { signalId: 'classifications', weightShare: 0.3, reason: 'Tags provide categorical semantics as weak glossary proxy' },
    ],
    availabilityThreshold: 0.05,
  },
  {
    id: 'custom_metadata',
    name: 'Custom Metadata / Policies',
    category: 'Compliance',
    iso25012: ['Compliance'],
    damaDmbok: 'Validity',
    goldTable: 'GOLD_CUSTOM_METADATA',
    goldColumns: ['CUSTOM_METADATA_NAME', 'ATTRIBUTE_NAME', 'ATTRIBUTE_VALUE'],
    bronzeSource: ['CustomMetadataRelationship'],
    passCondition: 'Asset has ≥1 row in GOLD_CUSTOM_METADATA',
    sqlFragment: `COUNT(DISTINCT cm.ASSET_GUID)`,
    fallbackTo: [
      { signalId: 'classifications', weightShare: 0.7, reason: 'Tags capture policy-adjacent metadata (PII, GDPR, Confidential)' },
      { signalId: 'ownership', weightShare: 0.3, reason: 'Ownership implies policy accountability even without explicit policy metadata' },
    ],
    availabilityThreshold: 0.05,
  },
  {
    id: 'certification',
    name: 'Certification',
    category: 'Trust',
    iso25012: ['Credibility'],
    damaDmbok: 'Validity',
    goldTable: 'GOLD_ASSETS',
    goldColumns: ['CERTIFICATE_STATUS'],
    bronzeSource: ['certificateStatus'],
    passCondition: "CERTIFICATE_STATUS = 'VERIFIED'",
    sqlFragment: `COUNT(CASE WHEN CERTIFICATE_STATUS = 'VERIFIED' THEN 1 END)`,
    fallbackTo: [
      { signalId: 'ownership', weightShare: 0.5, reason: 'Ownership signals accountability—proxy for trust without formal certification' },
      { signalId: 'description', weightShare: 0.5, reason: 'Well-documented assets are more trustworthy even uncertified' },
    ],
    availabilityThreshold: 0.03,
  },
  {
    id: 'domain_assignment',
    name: 'Domain Assignment',
    category: 'Organizational',
    iso25012: ['Consistency'],
    damaDmbok: 'Completeness',
    goldTable: 'GOLD_DOMAIN_ASSETS',
    goldColumns: ['DOMAIN_GUID', 'DOMAIN_NAME'],
    bronzeSource: ['DataDomain', 'DataProduct'],
    passCondition: 'Asset exists in GOLD_DOMAIN_ASSETS',
    sqlFragment: `COUNT(DISTINCT da.ASSET_GUID)`,
    fallbackTo: [
      { signalId: 'ownership', weightShare: 1.0, reason: 'Owner-based organization proxies domain assignment in flat catalogs' },
    ],
    availabilityThreshold: 0.05,
  },
  {
    id: 'popularity',
    name: 'Popularity',
    category: 'Contextual',
    iso25012: ['Accessibility'],
    damaDmbok: 'Timeliness',
    goldTable: 'GOLD_ASSETS',
    goldColumns: ['POPULARITY_SCORE'],
    bronzeSource: ['popularityScore'],
    passCondition: 'POPULARITY_SCORE > 0',
    sqlFragment: `COUNT(CASE WHEN POPULARITY_SCORE > 0 THEN 1 END)`,
    fallbackTo: [
      { signalId: 'freshness', weightShare: 1.0, reason: 'Freshness signals activity when usage data unavailable' },
    ],
    availabilityThreshold: 0,
  },
]

export const MATURITY_BANDS: MaturityConfig[] = [
  { band: 'critical', label: 'Critical', emoji: '🔵', min: 0, max: 25, color: '#3C71DF', bgColor: '#F4F6FD', action: 'Focus on ownership + descriptions first' },
  { band: 'developing', label: 'Developing', emoji: '🟠', min: 26, max: 50, color: '#F97316', bgColor: 'rgba(249,115,22,0.12)', action: 'Prioritize high-popularity assets' },
  { band: 'defined', label: 'Defined', emoji: '🟡', min: 51, max: 75, color: '#FBBF24', bgColor: 'rgba(251,191,36,0.12)', action: 'Expand lineage, glossary, DQ coverage' },
  { band: 'managed', label: 'Managed', emoji: '🟢', min: 76, max: 90, color: '#34D399', bgColor: 'rgba(52,211,153,0.12)', action: 'Automate enrichment, monitor drift' },
  { band: 'optimized', label: 'Optimized', emoji: '🔵', min: 91, max: 100, color: '#818CF8', bgColor: 'rgba(129,140,248,0.12)', action: 'AI-driven enrichment feedback loops' },
]

export function getSignalById(id: SignalId): SignalDefinition {
  return SIGNALS.find(s => s.id === id)!
}

export interface AssetTypeOption {
  typeName: string
  label: string
  defaultIncluded: boolean
}

export const ASSET_TYPE_OPTIONS: AssetTypeOption[] = [
  { typeName: 'Table', label: 'Table', defaultIncluded: true },
  { typeName: 'View', label: 'View', defaultIncluded: true },
  { typeName: 'MaterializedView', label: 'Materialized View', defaultIncluded: true },
  { typeName: 'MaterialisedView', label: 'Materialised View', defaultIncluded: true },
  { typeName: 'Column', label: 'Column', defaultIncluded: false },
]

export function getDefaultAssetTypes(): string[] {
  return ASSET_TYPE_OPTIONS
    .filter(option => option.defaultIncluded)
    .map(option => option.typeName)
}
