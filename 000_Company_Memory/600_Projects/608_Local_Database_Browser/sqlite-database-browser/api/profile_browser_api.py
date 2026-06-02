import json
import os
import sqlite3
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


def resolve_path(env_key: str, default_path: Path) -> Path:
    explicit = os.environ.get(env_key)
    if explicit:
        return Path(explicit).expanduser().resolve()
    return default_path.expanduser().resolve()


DATABASES: dict[str, dict[str, Any]] = {
    "crm": {
        "label": "CRM",
        "description": "Attio CRM mirror",
        "path": resolve_path(
            "PULSEOS_DB_BROWSER_CRM_DB_PATH",
            Path.home() / ".pulseos" / "crm" / "databases" / "attio_crm.db",
        ),
    },
    "research_agent": {
        "label": "Research Agent",
        "description": "GTM research agent runtime",
        "path": resolve_path(
            "PULSEOS_DB_BROWSER_RESEARCH_AGENT_DB_PATH",
            Path.home() / ".pulseos" / "research-agent" / "databases" / "research_agent.db",
        ),
    },
    "tintto_investors": {
        "label": "Tintto Investors",
        "description": "Tintto fundraising investor CRM",
        "path": resolve_path(
            "PULSEOS_DB_BROWSER_TINTTO_INVESTORS_DB_PATH",
            Path.home()
            / "DevProjects"
            / "tintto - GTM Sales"
            / "11_Fundraising"
            / "11.3_Investor_CRM"
            / "data"
            / "tintto_investors.db",
        ),
    },
}

# Runtime-registered custom databases (persists for the lifetime of the server process)
CUSTOM_DATABASES: dict[str, dict[str, Any]] = {}

app = FastAPI(title="PulseOS Local Database Browser API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def get_database_config(database: str) -> dict[str, Any]:
    all_databases = {**DATABASES, **CUSTOM_DATABASES}
    if database not in all_databases:
        raise HTTPException(status_code=404, detail=f'Database "{database}" is not configured')
    return all_databases[database]


def get_db(database: str) -> sqlite3.Connection:
    config = get_database_config(database)
    db_path = config["path"]
    if not db_path.exists():
        raise HTTPException(status_code=500, detail=f"Database not found at {db_path}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def table_exists(conn: sqlite3.Connection, table: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name=?",
        (table,),
    ).fetchone() is not None


def list_table_names(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        """
        SELECT name
        FROM sqlite_master
        WHERE type IN ('table', 'view')
          AND name NOT LIKE 'sqlite_%'
          AND name NOT LIKE 'v_%'
        ORDER BY type, name
        """
    ).fetchall()
    return [row["name"] for row in rows]


# Patterns that indicate a column should be hidden by default
_HIDDEN_SUFFIXES = ("_id", "_uuid", "_hash", "_token", "_key", "_fk")
_HIDDEN_EXACT = {
    "id", "uuid", "hash", "token", "key",
    "created_at", "updated_at", "deleted_at",
    "inserted_at", "modified_at", "timestamp",
    "created_date", "updated_date",
    "row_version", "etag", "checksum",
    "embedding", "vector",
}
_HIDDEN_CONTAINS = ("_embedding", "_vector", "raw_json", "raw_data")

# Patterns that indicate a column is useful and should be visible by default
_VISIBLE_TOKENS = (
    "name", "title", "label", "status", "stage", "type", "kind",
    "email", "phone", "url", "website", "domain", "linkedin",
    "city", "region", "country", "location",
    "score", "rating", "rank", "priority", "confidence",
    "amount", "raised", "revenue", "budget",
    "category", "tag", "source",
    "summary", "description", "notes", "content", "text", "reason",
    "match", "research", "completion", "progress",
    "date", "at",  # e.g. last_researched_at, published_date (but NOT created_at — handled above)
)


def _should_be_visible_by_default(col: dict, col_index: int, total_cols: int) -> bool:
    """Return True if a column should be visible by default in the table view."""
    name = col["name"]
    lowered = name.lower()

    # Always hide exact matches to known noise columns
    if lowered in _HIDDEN_EXACT:
        return False

    # Hide columns ending with ID/UUID/hash suffixes (foreign keys, surrogate keys)
    if any(lowered.endswith(suffix) for suffix in _HIDDEN_SUFFIXES):
        return False

    # Hide columns that contain embedding/vector/raw data patterns
    if any(pattern in lowered for pattern in _HIDDEN_CONTAINS):
        return False

    # Show if the column name contains a useful semantic token
    if any(token in lowered for token in _VISIBLE_TOKENS):
        # But skip created_at / updated_at even if they contain "at"
        if lowered in _HIDDEN_EXACT:
            return False
        return True

    # For small tables (≤6 columns), show everything that isn't explicitly hidden
    if total_cols <= 6:
        return True

    return False


def get_table_fields(table: str, conn: sqlite3.Connection):
    cursor = conn.execute(f"PRAGMA table_info({quote_identifier(table)})")
    columns = [dict(row) for row in cursor.fetchall()]
    total_cols = len(columns)

    fields = []
    for col in columns:
        name = col["name"]
        default_visible = _should_be_visible_by_default(col, len(fields), total_cols)
        fields.append({
            "key": name,
            "label": name.replace("_", " ").title(),
            "defaultVisible": default_visible,
            "sortable": True,
        })

    # Safety net: if nothing would be visible (e.g. a table with only id + timestamps),
    # make the first non-hidden column visible so the table isn't completely blank.
    if not any(f["defaultVisible"] for f in fields) and fields:
        fields[0]["defaultVisible"] = True

    return fields


def get_table_column_info(table: str, conn: sqlite3.Connection) -> list[dict[str, Any]]:
    cursor = conn.execute(f"PRAGMA table_info({quote_identifier(table)})")
    return [dict(row) for row in cursor.fetchall()]


def get_primary_key_column(table: str, conn: sqlite3.Connection) -> str:
    columns = get_table_column_info(table, conn)
    primary_key = next((column["name"] for column in columns if column.get("pk")), None)
    if primary_key:
        return str(primary_key)
    if any(column["name"] == "id" for column in columns):
        return "id"
    raise HTTPException(status_code=400, detail=f'Table "{table}" has no editable primary key column')


def normalize_cell_value(raw_value: Any, declared_type: str) -> Any:
    if raw_value == "":
        return None

    declared = (declared_type or "").upper()
    if "INT" in declared:
        if raw_value is None:
            return None
        return int(raw_value)
    if any(token in declared for token in ["REAL", "FLOA", "DOUB", "NUM"]):
        if raw_value is None:
            return None
        return float(raw_value)
    if "BOOL" in declared:
        if raw_value is None:
            return None
        if isinstance(raw_value, bool):
            return int(raw_value)
        return 1 if str(raw_value).strip().lower() in {"1", "true", "yes"} else 0

    return None if raw_value is None else str(raw_value)


class CellUpdateRequest(BaseModel):
    database: str = "crm"
    table: str
    rowId: Any
    field: str
    value: Any | None


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


class RegisterDatabaseRequest(BaseModel):
    key: str
    label: str
    path: str
    description: str = "Custom database"


@app.get("/api/databases")
def list_databases() -> list[dict[str, Any]]:
    sources = []
    all_databases = {**DATABASES, **CUSTOM_DATABASES}
    for key, config in all_databases.items():
        db_path = config["path"] if isinstance(config["path"], Path) else Path(config["path"]).expanduser().resolve()
        source = {
            "key": key,
            "label": config["label"],
            "description": config.get("description", "Custom database"),
            "path": str(db_path),
            "exists": db_path.exists(),
            "tableCount": 0,
        }
        if db_path.exists():
            try:
                with sqlite3.connect(db_path) as conn:
                    source["tableCount"] = conn.execute(
                        """
                        SELECT COUNT(*)
                        FROM sqlite_master
                        WHERE type IN ('table', 'view')
                          AND name NOT LIKE 'sqlite_%'
                        """
                    ).fetchone()[0]
            except sqlite3.Error:
                source["tableCount"] = 0
        sources.append(source)
    return sources


VIEWS_PATH = Path.home() / ".pulseos" / "db-browser" / "views.json"

@app.get("/api/views")
def get_views() -> list[dict[str, Any]]:
    if not VIEWS_PATH.exists():
        return []
    try:
        with open(VIEWS_PATH, "r") as f:
            return json.load(f)
    except Exception:
        return []

@app.post("/api/views")
def save_views(views: list[dict[str, Any]]) -> dict[str, str]:
    VIEWS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(VIEWS_PATH, "w") as f:
        json.dump(views, f, indent=2)
    return {"status": "ok"}

@app.post("/api/databases")
def register_database(payload: RegisterDatabaseRequest) -> dict[str, Any]:
    """Register a custom SQLite database for the current server session."""
    if payload.key in DATABASES:
        raise HTTPException(status_code=409, detail=f'Database key "{payload.key}" is reserved.')
    db_path = Path(payload.path).expanduser().resolve()
    CUSTOM_DATABASES[payload.key] = {
        "label": payload.label,
        "description": payload.description,
        "path": db_path,
    }
    table_count = 0
    if db_path.exists():
        try:
            with sqlite3.connect(db_path) as conn:
                table_count = conn.execute(
                    """
                    SELECT COUNT(*)
                    FROM sqlite_master
                    WHERE type IN ('table', 'view')
                      AND name NOT LIKE 'sqlite_%'
                    """
                ).fetchone()[0]
        except sqlite3.Error:
            table_count = 0

    return {
        "key": payload.key,
        "label": payload.label,
        "description": payload.description,
        "path": str(db_path),
        "exists": db_path.exists(),
        "tableCount": table_count,
    }


@app.get("/api/tables")
def list_tables(database: str = "crm") -> list[dict[str, Any]]:
    with get_db(database) as conn:
        tables = []
        for name in list_table_names(conn):
            try:
                count = conn.execute(f"SELECT COUNT(*) FROM {quote_identifier(name)}").fetchone()[0]
                tables.append({"name": name, "rowCount": count})
            except sqlite3.Error:
                continue
        return tables


@app.get("/api/fields")
def get_fields(database: str = "crm", table: str = "Companies") -> dict[str, Any]:
    with get_db(database) as conn:
        if not table_exists(conn, table):
            return {"fields": [], "facets": {}}

        fields = get_table_fields(table, conn)
        facets: dict[str, list[str]] = {}
        for field in fields:
            name = field["key"]
            try:
                count_distinct = conn.execute(
                    f"SELECT COUNT(DISTINCT {quote_identifier(name)}) FROM {quote_identifier(table)}"
                ).fetchone()[0]
                if 0 < count_distinct < 30:
                    rows = conn.execute(
                        f"""
                        SELECT DISTINCT {quote_identifier(name)}
                        FROM {quote_identifier(table)}
                        WHERE {quote_identifier(name)} IS NOT NULL
                        ORDER BY {quote_identifier(name)}
                        """
                    ).fetchall()
                    facets[name] = [str(row[0]) for row in rows if row[0] != ""]
            except sqlite3.Error:
                continue

    return {"fields": fields, "facets": facets}


@app.get("/api/profiles")
def get_profiles(
    request: Request,
    database: str = "crm",
    table: str = "Companies",
    query: str = "",
    page: int = Query(1, ge=1),
    pageSize: int = Query(100, ge=1, le=250),
    sortBy: str = "id",
    sortDirection: Literal["asc", "desc"] = "desc",
) -> dict[str, Any]:
    with get_db(database) as conn:
        if not table_exists(conn, table):
            return {"profiles": [], "total": 0, "page": page, "pageSize": pageSize, "mode": "list"}

        fields = get_table_fields(table, conn)
        col_names = [field["key"] for field in fields]

        clauses = []
        params = []
        if query:
            search_clauses = []
            for col in col_names:
                search_clauses.append(f"CAST({quote_identifier(col)} AS TEXT) LIKE ?")
                params.append(f"%{query}%")
            if search_clauses:
                clauses.append(f"({' OR '.join(search_clauses)})")

        for key, value in request.query_params.items():
            if "__" not in key:
                continue
            col, op = key.rsplit("__", 1)
            if col not in col_names:
                continue
            
            if op == "eq":
                clauses.append(f"{quote_identifier(col)} = ?")
                params.append(value)
            elif op == "contains":
                clauses.append(f"CAST({quote_identifier(col)} AS TEXT) LIKE ?")
                params.append(f"%{value}%")
            elif op == "empty":
                clauses.append(f"({quote_identifier(col)} IS NULL OR {quote_identifier(col)} = '')")
            elif op == "not_empty":
                clauses.append(f"({quote_identifier(col)} IS NOT NULL AND {quote_identifier(col)} != '')")

        where_sql = "WHERE " + " AND ".join(clauses) if clauses else ""
        total = conn.execute(f"SELECT COUNT(*) FROM {quote_identifier(table)} {where_sql}", params).fetchone()[0]

        if sortBy not in col_names:
            sortBy = "id" if "id" in col_names else col_names[0]

        order_direction = "DESC" if sortDirection.lower() == "desc" else "ASC"
        offset = (page - 1) * pageSize

        rows = conn.execute(
            f"""
            SELECT *
            FROM {quote_identifier(table)}
            {where_sql}
            ORDER BY {quote_identifier(sortBy)} {order_direction}
            LIMIT ? OFFSET ?
            """,
            params + [pageSize, offset],
        ).fetchall()
        profiles = [dict(row) for row in rows]

    return {"profiles": profiles, "total": total, "page": page, "pageSize": pageSize, "mode": "list", "fields": fields}


@app.patch("/api/cells")
def update_cell(payload: CellUpdateRequest) -> dict[str, Any]:
    with get_db(payload.database) as conn:
        if not table_exists(conn, payload.table):
            raise HTTPException(status_code=404, detail=f'Table "{payload.table}" not found')

        columns = get_table_column_info(payload.table, conn)
        column_map = {str(column["name"]): column for column in columns}
        if payload.field not in column_map:
            raise HTTPException(status_code=404, detail=f'Field "{payload.field}" not found on table "{payload.table}"')

        primary_key = get_primary_key_column(payload.table, conn)
        normalized_value = normalize_cell_value(payload.value, str(column_map[payload.field].get("type") or ""))

        conn.execute(
            f"""
            UPDATE {quote_identifier(payload.table)}
            SET {quote_identifier(payload.field)} = ?
            WHERE {quote_identifier(primary_key)} = ?
            """,
            (normalized_value, payload.rowId),
        )
        conn.commit()

        updated_row = conn.execute(
            f"""
            SELECT *
            FROM {quote_identifier(payload.table)}
            WHERE {quote_identifier(primary_key)} = ?
            """,
            (payload.rowId,),
        ).fetchone()

        if updated_row is None:
            raise HTTPException(status_code=404, detail=f'Row "{payload.rowId}" not found on table "{payload.table}"')

        return {"row": dict(updated_row)}
