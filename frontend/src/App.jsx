import { useEffect, useMemo, useState } from "react";
import { api } from "./api";

const MODULES = [
  {
    key: "employees",
    label: "HRM",
    hint: "Recruitment, payroll, attendance, performance",
    fields: [
      ["name", "Name", "text"],
      ["email", "Email", "email"],
      ["department", "Department", "text"],
      ["role", "Role", "text"],
      ["salary", "Salary", "number"],
      ["attendance_rate", "Attendance %", "number"],
      ["performance_score", "Performance", "number"],
      ["status", "Status", "select", ["Active", "On Leave", "Inactive"]],
    ],
  },
  {
    key: "customers",
    label: "CRM",
    hint: "Leads, customers, value, sales pipeline",
    fields: [
      ["name", "Name", "text"],
      ["email", "Email", "email"],
      ["phone", "Phone", "text"],
      ["company", "Company", "text"],
      ["lead_status", "Lead Status", "select", ["New", "Warm", "Hot", "Won", "Lost"]],
      ["lifetime_value", "Lifetime Value", "number"],
    ],
  },
  {
    key: "products",
    label: "Inventory",
    hint: "Stock, warehouses, reorder levels, valuation",
    fields: [
      ["sku", "SKU", "text"],
      ["name", "Name", "text"],
      ["category", "Category", "text"],
      ["stock", "Stock", "number"],
      ["reorder_level", "Reorder Level", "number"],
      ["unit_price", "Unit Price", "number"],
      ["status", "Status", "select", ["Active", "Paused", "Discontinued"]],
    ],
  },
  {
    key: "suppliers",
    label: "Suppliers",
    hint: "Vendor list used by procurement automation",
    fields: [
      ["name", "Name", "text"],
      ["email", "Email", "email"],
      ["phone", "Phone", "text"],
      ["rating", "Rating", "number"],
      ["category", "Category", "text"],
    ],
  },
  {
    key: "purchase_orders",
    label: "Procurement",
    hint: "Purchase orders and auto-reorder drafts",
    fields: [
      ["supplier_id", "Supplier ID", "text"],
      ["product_id", "Product ID", "text"],
      ["quantity", "Quantity", "number"],
      ["estimated_cost", "Estimated Cost", "number"],
      ["status", "Status", "select", ["Draft", "Pending", "Ordered", "Received", "Cancelled"]],
    ],
  },
  {
    key: "invoices",
    label: "Finance",
    hint: "Invoices, receivables, overdue detection",
    fields: [
      ["customer_id", "Customer ID", "text"],
      ["invoice_no", "Invoice No", "text"],
      ["amount", "Amount", "number"],
      ["due_date", "Due Date", "date"],
      ["status", "Status", "select", ["Unpaid", "Paid", "Overdue", "Cancelled"]],
    ],
  },
  {
    key: "sales_orders",
    label: "Sales",
    hint: "Orders connected to CRM and inventory",
    fields: [
      ["customer_id", "Customer ID", "text"],
      ["product_id", "Product ID", "text"],
      ["quantity", "Quantity", "number"],
      ["total_amount", "Total Amount", "number"],
      ["status", "Status", "select", ["New", "Confirmed", "Packed", "Delivered", "Cancelled"]],
    ],
  },
  {
    key: "work_orders",
    label: "Manufacturing",
    hint: "Production planning, scheduling, completion",
    fields: [
      ["product_id", "Product ID", "text"],
      ["planned_quantity", "Planned Qty", "number"],
      ["completed_quantity", "Completed Qty", "number"],
      ["status", "Status", "select", ["Planned", "Running", "Blocked", "Completed"]],
      ["due_date", "Due Date", "date"],
    ],
  },
  {
    key: "quality_checks",
    label: "Quality",
    hint: "QC created automatically after completed work orders",
    fields: [
      ["work_order_id", "Work Order ID", "text"],
      ["result", "Result", "select", ["Pending", "Pass", "Fail"]],
      ["defect_rate", "Defect Rate", "number"],
      ["notes", "Notes", "text"],
    ],
  },
  {
    key: "projects",
    label: "Projects",
    hint: "Budget, spending, deadlines, delivery risk",
    fields: [
      ["name", "Project Name", "text"],
      ["owner", "Owner", "text"],
      ["budget", "Budget", "number"],
      ["spent", "Spent", "number"],
      ["status", "Status", "select", ["Active", "Risk", "Done", "Paused"]],
      ["deadline", "Deadline", "date"],
    ],
  },
  {
    key: "tasks",
    label: "Tasks",
    hint: "Project tasks and assignments",
    fields: [
      ["project_id", "Project ID", "text"],
      ["title", "Title", "text"],
      ["assigned_to", "Assigned To", "text"],
      ["status", "Status", "select", ["Open", "Doing", "Blocked", "Done"]],
      ["due_date", "Due Date", "date"],
    ],
  },
  {
    key: "assets",
    label: "Assets",
    hint: "Fixed assets and service reminders",
    fields: [
      ["name", "Name", "text"],
      ["asset_tag", "Asset Tag", "text"],
      ["owner", "Owner", "text"],
      ["value", "Value", "number"],
      ["status", "Status", "select", ["Active", "Maintenance Due", "Retired"]],
      ["next_service_date", "Next Service Date", "date"],
    ],
  },
  {
    key: "integration_events",
    label: "Integrations",
    hint: "Webhook/API events from external systems",
    fields: [
      ["source", "Source", "text"],
      ["event_type", "Event Type", "text"],
      ["payload", "Payload", "text"],
      ["status", "Status", "select", ["Received", "Processed", "Failed"]],
    ],
  },
  {
    key: "audit_logs",
    label: "Audit Trail",
    hint: "System-managed logs for transparency and compliance",
    readonly: true,
    fields: [],
  },
];

function emptyForm(fields) {
  return Object.fromEntries(fields.map(([name]) => [name, ""]));
}

function pretty(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);

  const s = String(value);
  if (s.length > 42) return `${s.slice(0, 18)}…${s.slice(-10)}`;

  return s;
}

function MetricCard({ label, value }) {
  return (
    <div className="metric-card scanline">
      <span>{label}</span>
      <strong>{pretty(value)}</strong>
    </div>
  );
}

function DataTable({ rows, emptyText = "No records yet." }) {
  const columns = useMemo(() => {
    if (!rows?.length) return [];
    return Object.keys(rows[0]).slice(0, 8);
  }, [rows]);

  if (!rows?.length) {
    return <div className="empty-box">{emptyText}</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.id || JSON.stringify(row)}>
              {columns.map((col) => (
                <td key={col}>{pretty(row[col])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecordForm({ module, onCreate, busy }) {
  const [form, setForm] = useState(emptyForm(module.fields));

  useEffect(() => {
    setForm(emptyForm(module.fields));
  }, [module.key]);

  if (module.readonly) {
    return (
      <div className="empty-box">
        This module is system-managed. Run actions and inspect logs here.
      </div>
    );
  }

  function update(name, value, type) {
    setForm((old) => ({
      ...old,
      [name]: type === "number" && value !== "" ? Number(value) : value,
    }));
  }

  async function submit(event) {
    event.preventDefault();
    await onCreate(form);
    setForm(emptyForm(module.fields));
  }

  return (
    <form className="record-form" onSubmit={submit}>
      <div className="form-grid">
        {module.fields.map(([name, label, type, options]) => (
          <label key={name}>
            <span>{label}</span>

            {type === "select" ? (
              <select value={form[name]} onChange={(e) => update(name, e.target.value, type)}>
                <option value="">Select</option>
                {options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={form[name] ?? ""}
                type={type}
                placeholder={name.endsWith("_id") ? "Paste UUID from related table" : label}
                onChange={(e) => update(name, e.target.value, type)}
              />
            )}
          </label>
        ))}
      </div>

      <button className="primary-btn" disabled={busy}>
        {busy ? "Saving..." : `Create ${module.label} Record`}
      </button>
    </form>
  );
}

export default function App() {
  const [active, setActive] = useState("products");
  const [dashboard, setDashboard] = useState(null);
  const [rows, setRows] = useState([]);
  const [notice, setNotice] = useState("System initialized. Awaiting command.");
  const [busy, setBusy] = useState(false);

  const currentModule = MODULES.find((m) => m.key === active) || MODULES[0];

  async function loadDashboard() {
    const data = await api.dashboard();
    setDashboard(data);
  }

  async function loadRows(moduleKey = active) {
    const data = await api.list(moduleKey);
    setRows(data);
  }

  async function refresh(moduleKey = active) {
    try {
      setBusy(true);
      await Promise.all([loadDashboard(), loadRows(moduleKey)]);
      setNotice("Refresh complete. ERP data is synchronized.");
    } catch (err) {
      setNotice(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh(active);
  }, [active]);

  async function createRecord(data) {
    try {
      setBusy(true);
      await api.create(currentModule.key, data);
      await refresh(currentModule.key);
      setNotice(`${currentModule.label} record created and audit log updated.`);
    } catch (err) {
      setNotice(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function runAutomation() {
    try {
      setBusy(true);
      const result = await api.runAutomation();
      await refresh(active);
      setNotice(result.actions.map((a) => `> ${a.message}`).join("\n"));
    } catch (err) {
      setNotice(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  const metrics = dashboard?.metrics || {};

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">RF</div>

          <div>
            <h1>RetroFlow ERP</h1>
            <p>Automated enterprise control deck</p>
          </div>
        </div>

        <nav>
          {MODULES.map((module) => (
            <button
              key={module.key}
              className={active === module.key ? "active" : ""}
              onClick={() => setActive(module.key)}
            >
              <span>{module.label}</span>
              <small>{module.key}</small>
            </button>
          ))}
        </nav>
      </aside>

      <main>
        <section className="hero-panel scanline">
          <div>
            <p className="eyebrow">ERP / Command Center / Demo</p>
            <h2>
              Unified operations with automated finance, inventory, procurement,
              manufacturing, CRM, and audit workflows.
            </h2>
          </div>

          <div className="hero-actions">
            <button className="secondary-btn" onClick={() => refresh()} disabled={busy}>
              Refresh
            </button>

            <button className="primary-btn" onClick={runAutomation} disabled={busy}>
              {busy ? "Running..." : "Run Automation"}
            </button>
          </div>
        </section>

        <section className="metrics-grid">
          <MetricCard label="Employees" value={metrics.employees} />
          <MetricCard label="Customers" value={metrics.customers} />
          <MetricCard label="Paid Revenue" value={metrics.revenue} />
          <MetricCard label="Receivables" value={metrics.receivables} />
          <MetricCard label="Stock Value" value={metrics.stock_value} />
          <MetricCard label="Low Stock" value={metrics.low_stock} />
          <MetricCard label="Open POs" value={metrics.open_purchase_orders} />
          <MetricCard label="Work Orders" value={metrics.open_work_orders} />
        </section>

        <section className="work-grid">
          <div className="panel wide">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Module</p>
                <h3>{currentModule.label}</h3>
                <p>{currentModule.hint}</p>
              </div>
            </div>

            <RecordForm module={currentModule} onCreate={createRecord} busy={busy} />

            <DataTable rows={rows} />
          </div>

          <div className="panel terminal-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Automation Log</p>
                <h3>Terminal</h3>
              </div>
            </div>

            <pre>{notice}</pre>
          </div>
        </section>

        <section className="work-grid bottom-grid">
          <div className="panel">
            <div className="panel-head">
              <h3>Low Stock Watch</h3>
            </div>

            <DataTable rows={dashboard?.low_stock || []} emptyText="No low-stock items." />
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Invoice Watch</h3>
            </div>

            <DataTable rows={dashboard?.invoices || []} emptyText="No invoices." />
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Recent Audit Trail</h3>
            </div>

            <DataTable rows={dashboard?.recent_logs || []} emptyText="No audit logs." />
          </div>
        </section>
      </main>
    </div>
  );
}
