#!/usr/bin/env python3
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone


def emit(payload: dict) -> None:
    print(json.dumps(payload, default=str))


def read_payload() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


def to_safe_json(value):
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    if isinstance(value, (list, tuple)):
        return [to_safe_json(v) for v in value]
    if isinstance(value, dict):
        return {str(k): to_safe_json(v) for k, v in value.items()}
    return str(value)


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


CONFIG = {
    "client_id": env("POLARIS_CLIENT_ID", env("MDLH_CLIENT_ID")),
    "client_secret": env("POLARIS_CLIENT_SECRET", env("MDLH_CLIENT_SECRET")),
    "oauth_uri": env("POLARIS_OAUTH_URI", env("MDLH_OAUTH_URI")),
    "endpoint": env("POLARIS_ENDPOINT", env("MDLH_ENDPOINT")),
    "catalog_name": env("CATALOG_NAME", "atlan-wh"),
    "namespace": env("GOLD_NAMESPACE", "atlan-ns"),
    "role_name": env("POLARIS_ROLE_NAME", "ALL"),
    "assets_table_name": env("ASSETS_TABLE_NAME", ""),
    "bronze_table_name": env("BRONZE_TABLE_NAME", ""),
    "gold_tags_table_name": env("GOLD_TAGS_TABLE_NAME", ""),
    "bronze_tag_table_name": env("BRONZE_TAG_TABLE_NAME", ""),
    "query_max_rows": int(env("QUERY_MAX_ROWS", "2000")),
    "query_max_sql_length": int(env("QUERY_MAX_SQL_LENGTH", "20000")),
}

_ASSETS_TABLE_CACHE = None
_BRONZE_TABLE_CACHE = None
_GOLD_TAGS_TABLE_CACHE = None
_BRONZE_TAG_TABLE_CACHE = None
_GOLD_DQ_TABLE_CACHE = None

SCOREABLE_ASSET_TYPES = (
    "TABLE",
    "VIEW",
    "MATERIALIZEDVIEW",
    "MATERIALISEDVIEW",
    "CALCULATIONVIEW",
    "COLUMN",
)


def configured() -> bool:
    required = [
        CONFIG["client_id"],
        CONFIG["client_secret"],
        CONFIG["oauth_uri"],
        CONFIG["endpoint"],
        CONFIG["catalog_name"],
        CONFIG["namespace"],
    ]
    return all(required)


def require_deps():
    import duckdb  # noqa: F401
    from pyiceberg.catalog import load_catalog  # noqa: F401


def fetch_token() -> dict:
    import requests

    form = {
        "grant_type": "client_credentials",
        "client_id": CONFIG["client_id"],
        "client_secret": CONFIG["client_secret"],
        "scope": f"PRINCIPAL_ROLE:{CONFIG['role_name']}",
    }
    resp = requests.post(
        CONFIG["oauth_uri"],
        data=form,
        timeout=20,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    resp.raise_for_status()
    return resp.json()


def fetch_catalog_config(access_token: str) -> dict:
    import requests

    url = (
        CONFIG["endpoint"].rstrip("/") +
        "/v1/config?warehouse=" +
        requests.utils.quote(CONFIG["catalog_name"])
    )
    resp = requests.get(
        url,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json()


def get_catalog():
    from pyiceberg.catalog import load_catalog

    return load_catalog(
        "mdlh",
        type="rest",
        uri=CONFIG["endpoint"],
        warehouse=CONFIG["catalog_name"],
        credential=f"{CONFIG['client_id']}:{CONFIG['client_secret']}",
        scope=f"PRINCIPAL_ROLE:{CONFIG['role_name']}",
        oauth2_server_uri=CONFIG["oauth_uri"],
    )


def normalize_layer(raw_layer: str) -> str:
    return "bronze" if str(raw_layer or "").strip().lower() == "bronze" else "gold"


def load_assets_arrow(layer: str = "gold"):
    global _ASSETS_TABLE_CACHE, _BRONZE_TABLE_CACHE
    normalized_layer = normalize_layer(layer)
    catalog = get_catalog()
    if normalized_layer == "bronze":
        if _BRONZE_TABLE_CACHE is None:
            _BRONZE_TABLE_CACHE = resolve_bronze_table(catalog)
        table_name = _BRONZE_TABLE_CACHE
    else:
        if _ASSETS_TABLE_CACHE is None:
            _ASSETS_TABLE_CACHE = resolve_assets_table(catalog)
        table_name = _ASSETS_TABLE_CACHE

    table = catalog.load_table((CONFIG["namespace"], table_name))
    return table.scan().to_arrow()


def list_namespace_table_names(catalog):
    tables = catalog.list_tables((CONFIG["namespace"],))
    names = []
    for t in tables:
        if isinstance(t, tuple):
            names.append(t[-1])
        else:
            names.append(str(t).split(".")[-1])
    return names


def resolve_assets_table(catalog) -> str:
    if CONFIG["assets_table_name"]:
        return CONFIG["assets_table_name"]

    names = list_namespace_table_names(catalog)

    by_lower = {name.lower(): name for name in names}
    # Prefer curated Gold assets tables when available.
    for cand in ("gold_assets", "assets", "asset"):
        if cand in by_lower:
            return by_lower[cand]

    for name in names:
        if "asset" in name.lower():
            return name

    raise ValueError(
        f"Could not find ASSETS-like table in namespace '{CONFIG['namespace']}'. "
        "Set ASSETS_TABLE_NAME explicitly."
    )


def resolve_bronze_table(catalog) -> str:
    if CONFIG["bronze_table_name"]:
        return CONFIG["bronze_table_name"]

    names = list_namespace_table_names(catalog)

    by_lower = {name.lower(): name for name in names}
    for cand in ("table", "asset"):
        if cand in by_lower:
            return by_lower[cand]

    raise ValueError(
        f"Could not find Bronze asset-like table in namespace '{CONFIG['namespace']}'. "
        "Set BRONZE_TABLE_NAME explicitly."
    )


def resolve_gold_tags_table(catalog):
    if CONFIG["gold_tags_table_name"]:
        return CONFIG["gold_tags_table_name"]

    names = list_namespace_table_names(catalog)
    by_lower = {name.lower(): name for name in names}
    for cand in ("gold_tags", "tags"):
        if cand in by_lower:
            return by_lower[cand]

    for name in names:
        lower = name.lower()
        if lower.startswith("gold_") and "tag" in lower:
            return name

    return None


def resolve_bronze_tag_table(catalog):
    if CONFIG["bronze_tag_table_name"]:
        return CONFIG["bronze_tag_table_name"]

    names = list_namespace_table_names(catalog)
    by_lower = {name.lower(): name for name in names}
    for cand in ("tagrelationship", "tag_relationship"):
        if cand in by_lower:
            return by_lower[cand]

    for name in names:
        if "tagrelationship" in name.lower():
            return name

    return None


def resolve_gold_dq_table(catalog):
    names = list_namespace_table_names(catalog)
    by_lower = {name.lower(): name for name in names}
    for cand in ("gold_data_quality_details", "data_quality_details"):
        if cand in by_lower:
            return by_lower[cand]

    for name in names:
        lower = name.lower()
        if lower.startswith("gold_") and "data_quality" in lower:
            return name

    return None


def load_table_arrow(table_name: str):
    catalog = get_catalog()
    table = catalog.load_table((CONFIG["namespace"], table_name))
    return table.scan().to_arrow()


def register_assets(conn, layer: str = "gold"):
    global _GOLD_TAGS_TABLE_CACHE, _BRONZE_TAG_TABLE_CACHE, _GOLD_DQ_TABLE_CACHE

    normalized_layer = normalize_layer(layer)
    assets = load_assets_arrow(normalized_layer)
    conn.register("ASSETS", assets)
    registration = {
        "tags_view": None,
        "tags_table_name": None,
        "dq_view": None,
        "dq_table_name": None,
    }

    if normalized_layer == "gold":
        conn.execute("CREATE OR REPLACE VIEW GOLD_ASSETS AS SELECT * FROM ASSETS")
        if _GOLD_TAGS_TABLE_CACHE is None:
            _GOLD_TAGS_TABLE_CACHE = resolve_gold_tags_table(get_catalog())
        if _GOLD_TAGS_TABLE_CACHE:
            try:
                tags = load_table_arrow(_GOLD_TAGS_TABLE_CACHE)
                conn.register("GOLD_TAGS_RAW", tags)
                conn.execute("CREATE OR REPLACE VIEW GOLD_TAGS AS SELECT * FROM GOLD_TAGS_RAW")
                registration["tags_view"] = "GOLD_TAGS"
                registration["tags_table_name"] = _GOLD_TAGS_TABLE_CACHE
            except Exception:
                registration["tags_view"] = None
                registration["tags_table_name"] = None

        if _GOLD_DQ_TABLE_CACHE is None:
            _GOLD_DQ_TABLE_CACHE = resolve_gold_dq_table(get_catalog())
        if _GOLD_DQ_TABLE_CACHE:
            try:
                dq = load_table_arrow(_GOLD_DQ_TABLE_CACHE)
                conn.register("GOLD_DQ_RAW", dq)
                conn.execute(
                    "CREATE OR REPLACE VIEW GOLD_DATA_QUALITY_DETAILS "
                    "AS SELECT * FROM GOLD_DQ_RAW"
                )
                registration["dq_view"] = "GOLD_DATA_QUALITY_DETAILS"
                registration["dq_table_name"] = _GOLD_DQ_TABLE_CACHE
            except Exception:
                registration["dq_view"] = None
                registration["dq_table_name"] = None
    else:
        conn.execute("CREATE OR REPLACE VIEW BRONZE_ASSETS AS SELECT * FROM ASSETS")
        if _BRONZE_TAG_TABLE_CACHE is None:
            _BRONZE_TAG_TABLE_CACHE = resolve_bronze_tag_table(get_catalog())
        if _BRONZE_TAG_TABLE_CACHE:
            try:
                tags = load_table_arrow(_BRONZE_TAG_TABLE_CACHE)
                conn.register("BRONZE_TAG_REL_RAW", tags)
                conn.execute(
                    "CREATE OR REPLACE VIEW BRONZE_TAG_RELATIONSHIPS "
                    "AS SELECT * FROM BRONZE_TAG_REL_RAW"
                )
                registration["tags_view"] = "BRONZE_TAG_RELATIONSHIPS"
                registration["tags_table_name"] = _BRONZE_TAG_TABLE_CACHE
            except Exception:
                registration["tags_view"] = None
                registration["tags_table_name"] = None

    return registration


def col_map(conn) -> dict:
    rows = conn.execute("PRAGMA table_info('ASSETS')").fetchall()
    return {row[1].lower(): row[1] for row in rows}


def col_map_for_table(conn, table_name: str) -> dict:
    rows = conn.execute(f"PRAGMA table_info('{table_name}')").fetchall()
    return {row[1].lower(): row[1] for row in rows}


def pick_col(mapping: dict, *candidates):
    for cand in candidates:
        key = cand.lower()
        if key in mapping:
            return f'"{mapping[key]}"'
    return None


def sql_bool(col_sql: str) -> str:
    return f"upper(trim(cast({col_sql} as varchar))) IN ('TRUE','T','1')"


def sql_non_empty(col_sql: str) -> str:
    return (
        f"{col_sql} IS NOT NULL AND "
        f"trim(cast({col_sql} as varchar)) NOT IN ('', '[]', 'null', 'NULL')"
    )


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_only).strip("-").lower()
    return slug or "unknown"


def scope_asset_types(scope: dict) -> tuple[str, ...]:
    raw_types = scope.get("assetTypes")
    if isinstance(raw_types, str):
        candidates = [part.strip() for part in raw_types.split(",")]
    elif isinstance(raw_types, (list, tuple)):
        candidates = [str(part).strip() for part in raw_types]
    else:
        candidates = []

    normalized = []
    seen = set()
    for candidate in candidates:
        if not candidate:
            continue
        upper = candidate.upper()
        if upper in seen:
            continue
        seen.add(upper)
        normalized.append(upper)

    return tuple(normalized) if normalized else SCOREABLE_ASSET_TYPES


def build_scope_where(mapping: dict, scope: dict) -> str:
    clauses = []

    status_col = pick_col(mapping, "STATUS", "status", "__state")
    if status_col:
        clauses.append(f"upper(trim(cast({status_col} as varchar))) = 'ACTIVE'")

    asset_type_col = pick_col(mapping, "ASSET_TYPE", "assetType", "typeName", "__typeName")
    if asset_type_col:
        allowed_types = ", ".join(sql_literal(t) for t in scope_asset_types(scope))
        clauses.append(
            f"upper(trim(cast({asset_type_col} as varchar))) IN ({allowed_types})"
        )

    connector_col = pick_col(mapping, "connectorName", "CONNECTOR_NAME", "connector_name")
    connection_col = pick_col(mapping, "connectionQualifiedName", "CONNECTION_QUALIFIED_NAME")
    database_col = pick_col(
        mapping, "databaseName", "DATABASE_NAME", "SCHEMA_DATABASE_NAME"
    )
    schema_col = pick_col(mapping, "schemaName", "SCHEMA_NAME")
    qualified_col = pick_col(mapping, "qualifiedName", "QUALIFIED_NAME")

    def relative_path_expr():
        if not qualified_col:
            return None
        if connection_col:
            return (
                "CASE "
                f"WHEN {qualified_col} IS NULL THEN NULL "
                f"WHEN {connection_col} IS NOT NULL "
                f"AND cast({qualified_col} as varchar) "
                f"LIKE cast({connection_col} as varchar) || '/%' "
                f"THEN substr(cast({qualified_col} as varchar), "
                f"length(cast({connection_col} as varchar)) + 2) "
                f"ELSE cast({qualified_col} as varchar) "
                "END"
            )
        return f"cast({qualified_col} as varchar)"

    rel_path = relative_path_expr()
    if database_col:
        database_expr = f"cast({database_col} as varchar)"
    elif rel_path:
        database_expr = (
            "nullif(trim("
            "CASE "
            f"WHEN {rel_path} IS NULL THEN NULL "
            f"WHEN {rel_path} LIKE 'default/%/%/%' "
            f"THEN split_part({rel_path}, '/', 4) "
            f"ELSE split_part({rel_path}, '/', 1) "
            "END"
            "), '')"
        )
    else:
        database_expr = None

    if schema_col:
        schema_expr = f"cast({schema_col} as varchar)"
    elif rel_path:
        schema_expr = (
            "nullif(trim("
            "CASE "
            f"WHEN {rel_path} IS NULL THEN NULL "
            f"WHEN {rel_path} LIKE 'default/%/%/%' "
            f"THEN split_part({rel_path}, '/', 5) "
            f"ELSE split_part({rel_path}, '/', 2) "
            "END"
            "), '')"
        )
    else:
        schema_expr = None

    if scope.get("connectorName") and connector_col:
        clauses.append(f"lower(cast({connector_col} as varchar)) = lower({sql_literal(scope['connectorName'])})")
    if scope.get("connectionQualifiedName") and connection_col:
        clauses.append(f"cast({connection_col} as varchar) = {sql_literal(scope['connectionQualifiedName'])}")
    if scope.get("databaseName") and database_expr:
        clauses.append(
            f"upper({database_expr}) = upper({sql_literal(scope['databaseName'])})"
        )
    if scope.get("schemaName") and schema_expr:
        clauses.append(
            f"upper({schema_expr}) = upper({sql_literal(scope['schemaName'])})"
        )

    if not clauses:
        return ""
    return "WHERE " + " AND ".join(clauses)


def query_classifications_from_tags(conn, where_clause: str, layer: str, tags_view: str) -> int:
    asset_mapping = col_map(conn)
    guid_col = pick_col(asset_mapping, "GUID", "guid", "__guid")
    if not guid_col:
        return 0

    tags_mapping = col_map_for_table(conn, tags_view)
    if layer == "gold":
        tag_asset_guid_col = pick_col(tags_mapping, "ASSET_GUID", "asset_guid", "assetGuid")
        if not tag_asset_guid_col:
            return 0
        sql = f"""
        WITH scoped_assets AS (
          SELECT cast({guid_col} as varchar) AS asset_guid
          FROM ASSETS
          {where_clause}
        ),
        tag_assets AS (
          SELECT DISTINCT cast({tag_asset_guid_col} as varchar) AS asset_guid
          FROM {tags_view}
          WHERE {sql_non_empty(tag_asset_guid_col)}
        )
        SELECT COUNT(*) AS tagged_assets
        FROM scoped_assets s
        JOIN tag_assets t ON s.asset_guid = t.asset_guid
        """
        row = conn.execute(sql).fetchone()
        return int(row[0] or 0)

    entity_guid_col = pick_col(tags_mapping, "entityGuid", "ENTITY_GUID", "ASSET_GUID")
    if not entity_guid_col:
        return 0
    status_col = pick_col(tags_mapping, "status", "STATUS")
    from_status_col = pick_col(tags_mapping, "fromStatus", "FROM_STATUS")
    tag_name_col = pick_col(tags_mapping, "tagName", "TAG_NAME")

    tag_filters = [sql_non_empty(entity_guid_col)]
    if tag_name_col:
        tag_filters.append(sql_non_empty(tag_name_col))
    if status_col:
        tag_filters.append(f"upper(trim(cast({status_col} as varchar))) = 'ACTIVE'")
    if from_status_col:
        tag_filters.append(f"upper(trim(cast({from_status_col} as varchar))) = 'ACTIVE'")

    sql = f"""
    WITH scoped_assets AS (
      SELECT cast({guid_col} as varchar) AS asset_guid
      FROM ASSETS
      {where_clause}
    ),
    tag_assets AS (
      SELECT DISTINCT cast({entity_guid_col} as varchar) AS asset_guid
      FROM {tags_view}
      WHERE {' AND '.join(tag_filters)}
    )
    SELECT COUNT(*) AS tagged_assets
    FROM scoped_assets s
    JOIN tag_assets t ON s.asset_guid = t.asset_guid
    """
    row = conn.execute(sql).fetchone()
    return int(row[0] or 0)


def sql_positive_number(col_sql: str) -> str:
    return f"try_cast({col_sql} as double) > 0"


def query_dq_from_table(conn, where_clause: str, dq_view: str) -> int:
    asset_mapping = col_map(conn)
    guid_col = pick_col(asset_mapping, "GUID", "guid", "__guid")
    qualified_col = pick_col(
        asset_mapping, "QUALIFIED_NAME", "qualifiedName", "qualified_name"
    )
    if not guid_col:
        return 0

    dq_mapping = col_map_for_table(conn, dq_view)
    dq_asset_guid_col = pick_col(
        dq_mapping, "ASSET_GUID", "asset_guid", "assetGuid", "asset"
    )
    dq_asset_link_col = pick_col(
        dq_mapping, "ASSET_LINK", "asset_link", "assetLink", "QUALIFIED_NAME", "qualified_name"
    )
    if not dq_asset_guid_col and not dq_asset_link_col:
        return 0

    if dq_asset_guid_col:
        sql = f"""
    WITH scoped_assets AS (
      SELECT cast({guid_col} as varchar) AS asset_guid
      FROM ASSETS
      {where_clause}
    ),
    dq_assets AS (
      SELECT DISTINCT cast({dq_asset_guid_col} as varchar) AS asset_guid
      FROM {dq_view}
      WHERE {sql_non_empty(dq_asset_guid_col)}
    )
    SELECT COUNT(*) AS dq_assets
    FROM scoped_assets s
    JOIN dq_assets d ON s.asset_guid = d.asset_guid
    """
    elif qualified_col and dq_asset_link_col:
        sql = f"""
    WITH scoped_assets AS (
      SELECT cast({guid_col} as varchar) AS asset_guid,
             cast({qualified_col} as varchar) AS qualified_name
      FROM ASSETS
      {where_clause}
    ),
    dq_assets AS (
      SELECT DISTINCT cast({dq_asset_link_col} as varchar) AS asset_link
      FROM {dq_view}
      WHERE {sql_non_empty(dq_asset_link_col)}
    )
    SELECT COUNT(*) AS dq_assets
    FROM scoped_assets s
    JOIN dq_assets d ON s.qualified_name = d.asset_link
    """
    else:
        return 0

    row = conn.execute(sql).fetchone()
    return int(row[0] or 0)


def query_overview(scope: dict, layer: str = "gold") -> dict:
    import duckdb

    conn = duckdb.connect(":memory:")
    registration = register_assets(conn, layer)
    mapping = col_map(conn)
    where_clause = build_scope_where(mapping, scope)

    desc_col = pick_col(mapping, "description", "DESCRIPTION")
    user_desc_col = pick_col(mapping, "userDescription", "USER_DESCRIPTION")
    owner_users_col = pick_col(mapping, "ownerUsers", "OWNER_USERS")
    owner_groups_col = pick_col(mapping, "ownerGroups", "OWNER_GROUPS")
    lineage_col = pick_col(mapping, "hasLineage", "HAS_LINEAGE")
    classifications_col = pick_col(mapping, "__traitNames", "TAGS", "classifications")
    freshness_col = pick_col(mapping, "sourceUpdatedAt", "SOURCE_UPDATED_AT")
    updated_col = pick_col(mapping, "updatedAt", "UPDATED_AT")
    readme_bool_col = pick_col(mapping, "HAS_README")
    readme_ref_col = pick_col(mapping, "README_GUID", "readme", "assetSourceReadme")
    glossary_col = pick_col(mapping, "meanings", "TERM_GUIDS")
    custom_meta_col = pick_col(
        mapping, "customMetadata", "CUSTOM_METADATA", "assetPolicyGUIDs"
    )
    custom_meta_count_col = pick_col(mapping, "assetPoliciesCount")
    cert_col = pick_col(mapping, "certificateStatus", "CERTIFICATE_STATUS")
    domain_col = pick_col(
        mapping, "domainGuids", "domainGUIDs", "DOMAIN_GUIDS", "domain_assignment"
    )
    popularity_col = pick_col(mapping, "popularityScore", "POPULARITY_SCORE")
    dq_soda_count_col = pick_col(mapping, "assetSodaCheckCount", "sodaCheckCount")
    dq_anomalo_count_col = pick_col(mapping, "assetAnomaloCheckCount", "anomaloCheckCount")
    dq_mc_col = pick_col(mapping, "assetMcIsMonitored", "mcIsMonitored")
    dq_result_col = pick_col(mapping, "assetDQResult")

    description_expr = "FALSE"
    if desc_col and user_desc_col:
        description_expr = (
            "coalesce("
            f"nullif(trim(cast({desc_col} as varchar)), ''), "
            f"nullif(trim(cast({user_desc_col} as varchar)), '')"
            ") IS NOT NULL"
        )
    elif desc_col:
        description_expr = sql_non_empty(desc_col)
    elif user_desc_col:
        description_expr = sql_non_empty(user_desc_col)

    ownership_parts = []
    if owner_users_col:
        ownership_parts.append(f"({sql_non_empty(owner_users_col)})")
    if owner_groups_col:
        ownership_parts.append(f"({sql_non_empty(owner_groups_col)})")
    ownership_expr = " OR ".join(ownership_parts) if ownership_parts else "FALSE"

    lineage_expr = sql_bool(lineage_col) if lineage_col else "FALSE"
    classifications_expr = sql_non_empty(classifications_col) if classifications_col else "FALSE"
    freshness_target = freshness_col or updated_col
    freshness_expr = (
        f"try_cast({freshness_target} as bigint) IS NOT NULL AND "
        f"date_diff('day', to_timestamp(try_cast({freshness_target} as bigint) / 1000.0), current_timestamp) <= 90"
    ) if freshness_target else "FALSE"

    readme_parts = []
    if readme_bool_col:
        readme_parts.append(f"({sql_bool(readme_bool_col)})")
    if readme_ref_col:
        readme_parts.append(f"({sql_non_empty(readme_ref_col)})")
    readme_expr = " OR ".join(readme_parts) if readme_parts else "FALSE"

    glossary_expr = sql_non_empty(glossary_col) if glossary_col else "FALSE"
    custom_meta_parts = []
    if custom_meta_col:
        custom_meta_parts.append(f"({sql_non_empty(custom_meta_col)})")
    if custom_meta_count_col:
        custom_meta_parts.append(f"({sql_positive_number(custom_meta_count_col)})")
    custom_meta_expr = " OR ".join(custom_meta_parts) if custom_meta_parts else "FALSE"

    cert_expr = f"upper(trim(cast({cert_col} as varchar))) = 'VERIFIED'" if cert_col else "FALSE"
    domain_expr = sql_non_empty(domain_col) if domain_col else "FALSE"
    popularity_expr = f"try_cast({popularity_col} as double) > 0" if popularity_col else "FALSE"

    dq_parts = []
    if dq_soda_count_col:
        dq_parts.append(f"({sql_positive_number(dq_soda_count_col)})")
    if dq_anomalo_count_col:
        dq_parts.append(f"({sql_positive_number(dq_anomalo_count_col)})")
    if dq_mc_col:
        dq_parts.append(f"({sql_bool(dq_mc_col)})")
    if dq_result_col:
        dq_parts.append(f"({sql_non_empty(dq_result_col)})")
    dq_expr = " OR ".join(dq_parts) if dq_parts else "FALSE"

    sql = f"""
    SELECT
      COUNT(*) AS total_assets,
      SUM(CASE WHEN {description_expr} THEN 1 ELSE 0 END) AS description_passing,
      SUM(CASE WHEN {ownership_expr} THEN 1 ELSE 0 END) AS ownership_passing,
      SUM(CASE WHEN {lineage_expr} THEN 1 ELSE 0 END) AS lineage_passing,
      SUM(CASE WHEN {classifications_expr} THEN 1 ELSE 0 END) AS classifications_passing,
      SUM(CASE WHEN {freshness_expr} THEN 1 ELSE 0 END) AS freshness_passing,
      SUM(CASE WHEN {dq_expr} THEN 1 ELSE 0 END) AS dq_checks_passing,
      SUM(CASE WHEN {readme_expr} THEN 1 ELSE 0 END) AS readme_passing,
      SUM(CASE WHEN {glossary_expr} THEN 1 ELSE 0 END) AS glossary_terms_passing,
      SUM(CASE WHEN {custom_meta_expr} THEN 1 ELSE 0 END) AS custom_metadata_passing,
      SUM(CASE WHEN {cert_expr} THEN 1 ELSE 0 END) AS certification_passing,
      SUM(CASE WHEN {domain_expr} THEN 1 ELSE 0 END) AS domain_assignment_passing,
      SUM(CASE WHEN {popularity_expr} THEN 1 ELSE 0 END) AS popularity_passing
    FROM ASSETS
    {where_clause}
    """

    row = conn.execute(sql).fetchone()
    total = int(row[0] or 0)
    classifications_override = None
    if registration.get("tags_view"):
        try:
            classifications_override = query_classifications_from_tags(
                conn, where_clause, normalize_layer(layer), registration["tags_view"]
            )
        except Exception:
            classifications_override = None

    dq_override = None
    if registration.get("dq_view"):
        try:
            dq_override = query_dq_from_table(conn, where_clause, registration["dq_view"])
        except Exception:
            dq_override = None

    signal_ids = [
        "description", "ownership", "lineage", "classifications", "freshness",
        "dq_checks", "readme", "glossary_terms", "custom_metadata",
        "certification", "domain_assignment", "popularity",
    ]
    counts = {}
    for idx, signal_id in enumerate(signal_ids, start=1):
        passing = int(row[idx] or 0)
        if signal_id == "classifications" and classifications_override is not None:
            passing = max(passing, int(classifications_override or 0))
        if signal_id == "dq_checks" and dq_override is not None:
            passing = max(passing, int(dq_override or 0))
        counts[signal_id] = {"passing": passing, "total": total}

    return {
        "ok": True,
        "total_assets": total,
        "signal_counts": counts,
    }


def connector_icon(name: str) -> str:
    lower = (name or "").strip().lower()
    if "snowflake" in lower:
        return "Snowflake"
    if "databricks" in lower:
        return "Zap"
    if "power bi" in lower or "powerbi" in lower:
        return "BarChart3"
    return "Database"


def query_scope_tree(layer: str = "gold") -> dict:
    import duckdb

    conn = duckdb.connect(":memory:")
    register_assets(conn, layer)
    mapping = col_map(conn)

    connector_col = pick_col(mapping, "connectorName", "CONNECTOR_NAME", "connector_name")
    connection_col = pick_col(mapping, "connectionQualifiedName", "CONNECTION_QUALIFIED_NAME")
    database_col = pick_col(
        mapping, "databaseName", "DATABASE_NAME", "SCHEMA_DATABASE_NAME"
    )
    schema_col = pick_col(mapping, "schemaName", "SCHEMA_NAME")
    qualified_col = pick_col(mapping, "qualifiedName", "QUALIFIED_NAME")

    if not connector_col:
        return {
            "ok": True,
            "tree": [{
                "id": "tenant",
                "label": "home.atlan.com (All Assets)",
                "icon": "Globe",
                "scope": {"level": "tenant", "label": "home.atlan.com"},
                "children": [],
            }],
            "stats": {"connectors": 0, "connections": 0, "databases": 0, "schemas": 0},
        }

    connector_expr = f"nullif(trim(cast({connector_col} as varchar)), '')"
    connection_expr = (
        f"nullif(trim(cast({connection_col} as varchar)), '')"
        if connection_col else "NULL"
    )
    if database_col:
        database_expr = f"nullif(trim(cast({database_col} as varchar)), '')"
    elif qualified_col:
        rel_path_expr = (
            "CASE "
            f"WHEN {qualified_col} IS NULL THEN NULL "
            f"WHEN {connection_expr} IS NOT NULL "
            f"AND cast({qualified_col} as varchar) LIKE cast({connection_expr} as varchar) || '/%' "
            f"THEN substr(cast({qualified_col} as varchar), length(cast({connection_expr} as varchar)) + 2) "
            f"ELSE cast({qualified_col} as varchar) "
            "END"
        )
        database_expr = (
            "nullif(trim("
            "CASE "
            f"WHEN {rel_path_expr} IS NULL THEN NULL "
            f"WHEN {rel_path_expr} LIKE 'default/%/%/%' THEN split_part({rel_path_expr}, '/', 4) "
            f"ELSE split_part({rel_path_expr}, '/', 1) "
            "END"
            "), '')"
        )
    else:
        database_expr = "NULL"

    if schema_col:
        schema_expr = f"nullif(trim(cast({schema_col} as varchar)), '')"
    elif qualified_col:
        rel_path_expr = (
            "CASE "
            f"WHEN {qualified_col} IS NULL THEN NULL "
            f"WHEN {connection_expr} IS NOT NULL "
            f"AND cast({qualified_col} as varchar) LIKE cast({connection_expr} as varchar) || '/%' "
            f"THEN substr(cast({qualified_col} as varchar), length(cast({connection_expr} as varchar)) + 2) "
            f"ELSE cast({qualified_col} as varchar) "
            "END"
        )
        schema_expr = (
            "nullif(trim("
            "CASE "
            f"WHEN {rel_path_expr} IS NULL THEN NULL "
            f"WHEN {rel_path_expr} LIKE 'default/%/%/%' THEN split_part({rel_path_expr}, '/', 5) "
            f"ELSE split_part({rel_path_expr}, '/', 2) "
            "END"
            "), '')"
        )
    else:
        schema_expr = "NULL"

    where_parts = [f"{connector_expr} IS NOT NULL"]
    status_col = pick_col(mapping, "STATUS", "status", "__state")
    if status_col:
        where_parts.append(f"upper(trim(cast({status_col} as varchar))) = 'ACTIVE'")
    asset_type_col = pick_col(mapping, "ASSET_TYPE", "assetType", "typeName", "__typeName")
    if asset_type_col:
        allowed_types = ", ".join(sql_literal(t) for t in SCOREABLE_ASSET_TYPES)
        where_parts.append(
            f"upper(trim(cast({asset_type_col} as varchar))) IN ({allowed_types})"
        )

    sql = f"""
    SELECT DISTINCT
      {connector_expr} AS connector_name,
      {connection_expr} AS connection_qualified_name,
      {database_expr} AS database_name,
      {schema_expr} AS schema_name
    FROM ASSETS
    WHERE {' AND '.join(where_parts)}
    ORDER BY connector_name, connection_qualified_name, database_name, schema_name
    """
    rows = conn.execute(sql).fetchall()

    tenant = {
        "id": "tenant",
        "label": "home.atlan.com (All Assets)",
        "icon": "Globe",
        "scope": {"level": "tenant", "label": "home.atlan.com"},
        "children": [],
    }

    connectors = {}
    stats = {"connectors": 0, "connections": 0, "databases": 0, "schemas": 0}

    for row in rows:
        connector_name = str(row[0] or "").strip()
        if not connector_name:
            continue
        connection_qn = str(row[1] or "").strip()
        database_name = str(row[2] or "").strip()
        schema_name = str(row[3] or "").strip()

        connector_key = connector_name.lower()
        connector_ctx = connectors.get(connector_key)
        if connector_ctx is None:
            connector_node = {
                "id": f"connector:{slugify(connector_name)}",
                "label": connector_name,
                "icon": connector_icon(connector_name),
                "scope": {
                    "level": "connector",
                    "label": connector_name,
                    "connectorName": connector_name,
                },
                "children": [],
            }
            connector_ctx = {
                "node": connector_node,
                "connections": {},
                "databases": {},
            }
            connectors[connector_key] = connector_ctx
            tenant["children"].append(connector_node)
            stats["connectors"] += 1

        parent_ctx = connector_ctx
        parent_node = connector_ctx["node"]

        if connection_qn:
            conn_key = f"{connector_key}|{connection_qn.lower()}"
            connection_ctx = connector_ctx["connections"].get(conn_key)
            if connection_ctx is None:
                conn_label = connection_qn.split("/")[-1] or connection_qn
                connection_node = {
                    "id": f"connection:{slugify(connection_qn)}",
                    "label": conn_label,
                    "icon": "Link",
                    "scope": {
                        "level": "connection",
                        "label": conn_label,
                        "connectorName": connector_name,
                        "connectionQualifiedName": connection_qn,
                    },
                    "children": [],
                }
                connection_ctx = {"node": connection_node, "databases": {}}
                connector_ctx["connections"][conn_key] = connection_ctx
                connector_ctx["node"]["children"].append(connection_node)
                stats["connections"] += 1
            parent_ctx = connection_ctx
            parent_node = connection_ctx["node"]

        if database_name:
            db_map = parent_ctx["databases"]
            db_key = (
                f"{connector_key}|{connection_qn.lower()}|{database_name.lower()}"
                if connection_qn else f"{connector_key}|{database_name.lower()}"
            )
            db_ctx = db_map.get(db_key)
            if db_ctx is None:
                db_scope = {
                    "level": "database",
                    "label": database_name,
                    "connectorName": connector_name,
                    "databaseName": database_name,
                }
                if connection_qn:
                    db_scope["connectionQualifiedName"] = connection_qn

                db_node = {
                    "id": f"database:{slugify(connector_name)}:{slugify(database_name)}"
                    if not connection_qn
                    else f"database:{slugify(connection_qn)}:{slugify(database_name)}",
                    "label": database_name,
                    "icon": "Database",
                    "scope": db_scope,
                    "children": [],
                }
                db_ctx = {"node": db_node, "schemas": {}}
                db_map[db_key] = db_ctx
                parent_node["children"].append(db_node)
                stats["databases"] += 1

            if schema_name:
                schema_key = f"{db_key}|{schema_name.lower()}"
                if schema_key not in db_ctx["schemas"]:
                    schema_scope = {
                        "level": "schema",
                        "label": schema_name,
                        "connectorName": connector_name,
                        "databaseName": database_name,
                        "schemaName": schema_name,
                    }
                    if connection_qn:
                        schema_scope["connectionQualifiedName"] = connection_qn

                    schema_node = {
                        "id": f"schema:{slugify(db_ctx['node']['id'])}:{slugify(schema_name)}",
                        "label": schema_name,
                        "icon": "Database",
                        "scope": schema_scope,
                    }
                    db_ctx["schemas"][schema_key] = schema_node
                    db_ctx["node"]["children"].append(schema_node)
                    stats["schemas"] += 1

    return {
        "ok": True,
        "tree": [tenant],
        "stats": stats,
    }


READ_ONLY_DISALLOWED = re.compile(
    r"\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|REPLACE|MERGE|COPY|CALL|GRANT|REVOKE)\b",
    re.IGNORECASE,
)


def validate_query(query: str) -> str:
    q = query.strip()
    if not q:
        raise ValueError("Query is empty")
    if len(q) > CONFIG["query_max_sql_length"]:
        raise ValueError("Query exceeds maximum allowed length")
    if ";" in q.strip().rstrip(";"):
        raise ValueError("Multiple SQL statements are not allowed")
    if READ_ONLY_DISALLOWED.search(q):
        raise ValueError("Only read-only SQL is allowed")
    if not re.match(r"^\s*(SELECT|WITH)\b", q, flags=re.IGNORECASE):
        raise ValueError("Only SELECT/WITH queries are allowed")
    return q.rstrip(";")


def execute_query(query: str, layer: str = "gold") -> dict:
    import duckdb

    q = validate_query(query)
    conn = duckdb.connect(":memory:")
    normalized_layer = normalize_layer(layer)
    registration = register_assets(conn, normalized_layer)

    table_refs = re.findall(r"\b(?:from|join)\s+([A-Za-z_][\w.]*)", q, flags=re.IGNORECASE)
    disallowed = []
    allowed = {"assets"}
    supported_tables = "ASSETS, GOLD_ASSETS"
    if normalized_layer == "gold":
        allowed.add("gold_assets")
        if registration.get("tags_view") == "GOLD_TAGS":
            allowed.add("gold_tags")
            supported_tables = "ASSETS, GOLD_ASSETS, GOLD_TAGS"
    else:
        allowed.add("bronze_assets")
        if registration.get("tags_view") == "BRONZE_TAG_RELATIONSHIPS":
            allowed.add("bronze_tag_relationships")
            supported_tables = "ASSETS, BRONZE_ASSETS, BRONZE_TAG_RELATIONSHIPS"
        else:
            supported_tables = "ASSETS, BRONZE_ASSETS"
    for ref in table_refs:
        short = ref.split(".")[-1].lower()
        if short not in allowed:
            disallowed.append(ref)
    if disallowed:
        raise ValueError(
            f"Unsupported table reference(s): {', '.join(disallowed)}. "
            f"Supported tables: {supported_tables}"
        )

    wrapped = f"SELECT * FROM ({q}) AS _q LIMIT {CONFIG['query_max_rows']}"
    cursor = conn.execute(wrapped)
    cols = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()
    mapped_rows = []
    for row in rows:
        mapped_rows.append({
            cols[idx]: to_safe_json(row[idx])
            for idx in range(len(cols))
        })

    return {
        "ok": True,
        "columns": cols,
        "rows": mapped_rows,
    }


def list_tables() -> dict:
    catalog = get_catalog()
    tables = catalog.list_tables((CONFIG["namespace"],))
    names = []
    for t in tables:
        if isinstance(t, tuple):
            names.append(".".join(t))
        else:
            names.append(str(t))
    return {"ok": True, "namespace": CONFIG["namespace"], "tables": names}


def health() -> dict:
    global _ASSETS_TABLE_CACHE, _BRONZE_TABLE_CACHE
    if not configured():
        return {"ok": False, "error": "Polaris credentials are not configured"}

    token = fetch_token()
    access_token = token.get("access_token", "")
    if not access_token:
        return {"ok": False, "error": "OAuth succeeded but access_token is missing"}

    cfg = fetch_catalog_config(access_token)
    prefix = cfg.get("overrides", {}).get("prefix", CONFIG["catalog_name"])
    catalog = get_catalog()
    if _ASSETS_TABLE_CACHE is None:
        _ASSETS_TABLE_CACHE = resolve_assets_table(catalog)
    if _BRONZE_TABLE_CACHE is None:
        try:
            _BRONZE_TABLE_CACHE = resolve_bronze_table(catalog)
        except Exception:
            _BRONZE_TABLE_CACHE = ""
    return {
        "ok": True,
        "catalog_name": prefix,
        "namespace": CONFIG["namespace"],
        "assets_table_name": _ASSETS_TABLE_CACHE,
        "bronze_table_name": _BRONZE_TABLE_CACHE,
        "token_scope": token.get("scope", ""),
    }


def main():
    payload = read_payload()
    mode = payload.get("mode", "").strip().lower()
    layer = normalize_layer(payload.get("layer", "gold"))

    if not mode:
        emit({"ok": False, "error": "Missing mode"})
        sys.exit(1)

    try:
        require_deps()
    except Exception as err:
        emit({
            "ok": False,
            "error": "Missing Python dependencies. Install: pip install duckdb pyiceberg pyarrow",
            "details": str(err),
        })
        sys.exit(0)

    try:
        if mode == "health":
            emit(health())
            return
        if mode == "tables":
            emit(list_tables())
            return
        if mode == "query":
            emit(execute_query(str(payload.get("query", "")), layer))
            return
        if mode == "overview":
            scope = payload.get("scope") or {}
            emit(query_overview(scope, layer))
            return
        if mode == "scopes":
            emit(query_scope_tree(layer))
            return

        emit({"ok": False, "error": f"Unsupported mode: {mode}"})
        sys.exit(1)
    except Exception as err:
        emit({
            "ok": False,
            "error": str(err),
        })
        sys.exit(0)


if __name__ == "__main__":
    main()
