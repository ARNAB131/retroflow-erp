import os
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Dict, List

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

app = FastAPI(title="RetroFlow ERP API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RecordPayload(BaseModel):
    data: Dict[str, Any]


TABLES: Dict[str, List[str]] = {
    "employees": ["name", "email", "department", "role", "salary", "attendance_rate", "performance_score", "status"],
    "customers": ["name", "email", "phone", "company", "lead_status", "lifetime_value"],
    "products": ["sku", "name", "category", "stock", "reorder_level", "unit_price", "status"],
    "suppliers": ["name", "email", "phone", "rating", "category"],
    "purchase_orders": ["supplier_id", "product_id", "quantity", "estimated_cost", "status"],
    "invoices": ["customer_id", "invoice_no", "amount", "due_date", "status"],
    "sales_orders": ["customer_id", "product_id", "quantity", "total_amount", "status"],
    "work_orders": ["product_id", "planned_quantity", "completed_quantity", "status", "due_date"],
    "projects": ["name", "owner", "budget", "spent", "status", "deadline"],
    "tasks": ["project_id", "title", "assigned_to", "status", "due_date"],
    "assets": ["name", "asset_tag", "owner", "value", "status", "next_service_date"],
    "quality_checks": ["work_order_id", "result", "defect_rate", "notes"],
    "integration_events": ["source", "event_type", "payload", "status"],
    "audit_logs": ["actor", "module", "action", "entity_type", "entity_id", "metadata"],
}

READ_ONLY_TABLES = {"audit_logs"}


@contextmanager
def db_cursor(commit: bool = False):
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is missing. Add it to backend/.env or Render env vars.")

    conn = psycopg2.connect(DATABASE_URL, sslmode="require")
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            yield cur
        if commit:
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def fetch_all(query: str, params: tuple = (), commit: bool = False) -> List[Dict[str, Any]]:
    with db_cursor(commit=commit) as cur:
        cur.execute(query, params)
        return [dict(row) for row in cur.fetchall()]


def fetch_one(query: str, params: tuple = ()) -> Dict[str, Any] | None:
    with db_cursor() as cur:
        cur.execute(query, params)
        row = cur.fetchone()
        return dict(row) if row else None


def execute(query: str, params: tuple = ()) -> Dict[str, Any] | None:
    with db_cursor(commit=True) as cur:
        cur.execute(query, params)
        if cur.description:
            row = cur.fetchone()
            return dict(row) if row else None
        return None


def ensure_table(table: str):
    if table not in TABLES:
        raise HTTPException(status_code=404, detail=f"Unknown ERP module: {table}")


def clean_payload(table: str, data: Dict[str, Any]) -> Dict[str, Any]:
    allowed = set(TABLES[table])
    cleaned = {k: v for k, v in data.items() if k in allowed and v != ""}
    if not cleaned:
        raise HTTPException(status_code=400, detail="No valid fields were provided.")
    return cleaned


def write_audit(
    module: str,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    metadata: Dict[str, Any] | None = None,
):
    execute(
        """
        INSERT INTO audit_logs(actor, module, action, entity_type, entity_id, metadata)
        VALUES (%s, %s, %s, %s, %s, %s::jsonb)
        RETURNING id
        """,
        ("demo-admin", module, action, entity_type, entity_id, psycopg2.extras.Json(metadata or {})),
    )


@app.get("/")
def root():
    return {"name": "RetroFlow ERP", "status": "online", "docs": "/docs"}


@app.get("/health")
def health():
    try:
        now = fetch_one("SELECT NOW() AS now")
        return {"ok": True, "database_time": now["now"]}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/dashboard")
def dashboard():
    metrics = fetch_one(
        """
        SELECT
          (SELECT COUNT(*) FROM employees) AS employees,
          (SELECT COUNT(*) FROM customers) AS customers,
          COALESCE((SELECT SUM(amount) FROM invoices WHERE status = 'Paid'), 0) AS revenue,
          COALESCE((SELECT SUM(amount) FROM invoices WHERE status <> 'Paid'), 0) AS receivables,
          COALESCE((SELECT SUM(stock * unit_price) FROM products), 0) AS stock_value,
          (SELECT COUNT(*) FROM products WHERE stock <= reorder_level) AS low_stock,
          (SELECT COUNT(*) FROM purchase_orders WHERE status IN ('Draft','Pending','Ordered')) AS open_purchase_orders,
          (SELECT COUNT(*) FROM work_orders WHERE status IN ('Planned','Running','Blocked')) AS open_work_orders,
          (SELECT COUNT(*) FROM projects WHERE status IN ('Active','Risk')) AS active_projects,
          (SELECT COUNT(*) FROM assets WHERE status IN ('Active','Maintenance Due')) AS active_assets
        """
    )

    recent_logs = fetch_all("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 8")
    low_stock = fetch_all(
        "SELECT id, sku, name, stock, reorder_level FROM products WHERE stock <= reorder_level ORDER BY stock ASC LIMIT 8"
    )
    invoices = fetch_all("SELECT invoice_no, amount, due_date, status FROM invoices ORDER BY due_date ASC LIMIT 8")

    return {
        "metrics": metrics,
        "recent_logs": recent_logs,
        "low_stock": low_stock,
        "invoices": invoices,
    }


@app.get("/api/{table}")
def list_records(table: str, limit: int = Query(100, ge=1, le=500)):
    ensure_table(table)
    return fetch_all(f"SELECT * FROM {table} ORDER BY created_at DESC LIMIT %s", (limit,))


@app.post("/api/{table}")
def create_record(table: str, payload: RecordPayload):
    ensure_table(table)

    if table in READ_ONLY_TABLES:
        raise HTTPException(status_code=403, detail="This module is system-managed.")

    data = clean_payload(table, payload.data)
    cols = list(data.keys())
    placeholders = ", ".join(["%s"] * len(cols))
    col_sql = ", ".join(cols)

    sql = f"INSERT INTO {table} ({col_sql}) VALUES ({placeholders}) RETURNING *"
    row = execute(sql, tuple(data[c] for c in cols))

    write_audit(table, "CREATE", table[:-1], str(row["id"]), {"fields": cols})
    return row


@app.patch("/api/{table}/{record_id}")
def update_record(table: str, record_id: str, payload: RecordPayload):
    ensure_table(table)

    if table in READ_ONLY_TABLES:
        raise HTTPException(status_code=403, detail="This module is system-managed.")

    data = clean_payload(table, payload.data)
    assignments = ", ".join([f"{col} = %s" for col in data.keys()])

    sql = f"UPDATE {table} SET {assignments}, updated_at = NOW() WHERE id = %s RETURNING *"
    row = execute(sql, tuple(data.values()) + (record_id,))

    if not row:
        raise HTTPException(status_code=404, detail="Record not found.")

    write_audit(table, "UPDATE", table[:-1], record_id, {"fields": list(data.keys())})
    return row


@app.delete("/api/{table}/{record_id}")
def delete_record(table: str, record_id: str):
    ensure_table(table)

    if table in READ_ONLY_TABLES:
        raise HTTPException(status_code=403, detail="This module is system-managed.")

    row = execute(f"DELETE FROM {table} WHERE id = %s RETURNING id", (record_id,))

    if not row:
        raise HTTPException(status_code=404, detail="Record not found.")

    write_audit(table, "DELETE", table[:-1], record_id, {})
    return {"deleted": True, "id": record_id}


@app.post("/api/automation/run")
def run_automation():
    actions: List[Dict[str, Any]] = []

    # 1. Procurement automation:
    # If stock is below reorder level and there is no open PO,
    # create a draft purchase order automatically.
    low_products = fetch_all(
        """
        SELECT p.*
        FROM products p
        WHERE p.stock <= p.reorder_level
          AND NOT EXISTS (
            SELECT 1 FROM purchase_orders po
            WHERE po.product_id = p.id AND po.status IN ('Draft','Pending','Ordered')
          )
        """
    )

    supplier = fetch_one("SELECT id FROM suppliers ORDER BY rating DESC NULLS LAST, created_at ASC LIMIT 1")

    for product in low_products:
        if not supplier:
            actions.append(
                {
                    "type": "procurement_skipped",
                    "message": f"No supplier exists for {product['name']}",
                }
            )
            continue

        qty = max((int(product["reorder_level"] or 0) * 2) - int(product["stock"] or 0), 1)
        estimated = round(float(product["unit_price"] or 0) * qty * 0.75, 2)

        po = execute(
            """
            INSERT INTO purchase_orders(supplier_id, product_id, quantity, estimated_cost, status)
            VALUES (%s, %s, %s, %s, 'Draft')
            RETURNING *
            """,
            (supplier["id"], product["id"], qty, estimated),
        )

        write_audit(
            "procurement",
            "AUTO_REORDER",
            "purchase_order",
            str(po["id"]),
            {"product": product["name"], "qty": qty},
        )

        actions.append(
            {
                "type": "auto_reorder",
                "message": f"Draft PO created for {product['name']}",
                "record": po,
            }
        )

    # 2. Finance automation:
    # Mark unpaid invoices as overdue if the due date has passed.
    overdue = fetch_all(
        """
        UPDATE invoices
        SET status = 'Overdue', updated_at = NOW()
        WHERE due_date < CURRENT_DATE AND status NOT IN ('Paid','Overdue')
        RETURNING id, invoice_no, amount
        """,
        commit=True,
    )

    for inv in overdue:
        write_audit(
            "finance",
            "MARK_OVERDUE",
            "invoice",
            str(inv["id"]),
            {"invoice_no": inv["invoice_no"]},
        )

        actions.append(
            {
                "type": "invoice_overdue",
                "message": f"Invoice {inv['invoice_no']} marked overdue",
            }
        )

    # 3. Manufacturing + quality automation:
    # Completed work orders automatically get a pending quality check.
    completed_without_qc = fetch_all(
        """
        SELECT wo.id
        FROM work_orders wo
        WHERE wo.status = 'Completed'
          AND NOT EXISTS (
            SELECT 1 FROM quality_checks qc WHERE qc.work_order_id = wo.id
          )
        """
    )

    for wo in completed_without_qc:
        qc = execute(
            """
            INSERT INTO quality_checks(work_order_id, result, defect_rate, notes)
            VALUES (%s, 'Pending', 0, 'Auto-created after work order completion')
            RETURNING *
            """,
            (wo["id"],),
        )

        write_audit(
            "quality",
            "AUTO_QC_CREATED",
            "quality_check",
            str(qc["id"]),
            {"work_order_id": str(wo["id"])},
        )

        actions.append(
            {
                "type": "quality_check",
                "message": "Pending QC created for completed work order",
            }
        )

    # 4. Asset automation:
    # Assets due for service within 7 days are flagged.
    due_assets = fetch_all(
        """
        UPDATE assets
        SET status = 'Maintenance Due', updated_at = NOW()
        WHERE next_service_date <= CURRENT_DATE + INTERVAL '7 days'
          AND status = 'Active'
        RETURNING id, name, next_service_date
        """,
        commit=True,
    )

    for asset in due_assets:
        write_audit(
            "assets",
            "MAINTENANCE_DUE",
            "asset",
            str(asset["id"]),
            {"next_service_date": str(asset["next_service_date"])},
        )

        actions.append(
            {
                "type": "asset_service",
                "message": f"{asset['name']} marked maintenance due",
            }
        )

    if not actions:
        write_audit(
            "automation",
            "NO_ACTION",
            "system",
            None,
            {"checked_at": datetime.utcnow().isoformat()},
        )

        actions.append(
            {
                "type": "no_action",
                "message": "Automation completed. No new action was required.",
            }
        )

    return {
        "ran_at": datetime.utcnow().isoformat(),
        "actions": actions,
    }
