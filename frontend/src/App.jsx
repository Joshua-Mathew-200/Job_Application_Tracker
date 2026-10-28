import { useEffect, useState } from "react";
import "./App.css";

const API = import.meta.env.PROD
  ? "/api/applications"
  : "http://localhost:5000/api/applications";
const statuses = [
  "Applied", "Interview", "Offer",
  "Rejected", "Accepted", "Declined",
];

function today() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function emptyForm() {
  return {
    company: "",
    role: "",
    jobType: "Full-time",
    appliedDate: today(),
    salary: "",
    notes: "",
  };
}

async function request(path = "", options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Request failed.");
  }

  return result.data;
}

export default function App() {
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      setLoading(true);

      try {
        const params = new URLSearchParams({
          search,
          status: filter,
        });

        const data = await request(`?${params}`);

        if (!cancelled) {
          setItems(data.applications);
          setCounts(data.counts);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, filter, reload]);

  function openAdd() {
    setForm(emptyForm());
    setEditing(null);
    setFormError("");
    setShowForm(true);
  }

  function openEdit(item) {
    setForm({
      company: item.company,
      role: item.role,
      jobType: item.jobType,
      appliedDate: item.appliedDate,
      salary: item.salary ?? "",
      notes: item.notes,
    });
    setEditing(item);
    setFormError("");
    setSelected(null);
    setShowForm(true);
  }

  function changeField(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function saveApplication(event) {
    event.preventDefault();
    setFormError("");

    if (!/^[A-Za-z]{3}/.test(form.company.trim())) {
      setFormError("Company must begin with at least three English letters.");
      return;
    }

    if (!editing && form.appliedDate > today()) {
      setFormError("Applied date cannot be in the future.");
      return;
    }

    if (
      form.salary !== "" &&
      (!Number.isFinite(Number(form.salary)) || Number(form.salary) < 0)
    ) {
      setFormError("Enter a valid non-negative salary.");
      return;
    }

    setBusy(true);

    try {
      const payload = {
        company: form.company,
        role: form.role,
        jobType: form.jobType,
        salary: form.salary,
        notes: form.notes,
      };

      if (!editing) payload.appliedDate = form.appliedDate;

      await request(editing ? `/${editing._id}` : "", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      setMessage(editing ? "Application updated." : "Application added.");
      setShowForm(false);
      setReload((value) => value + 1);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function openDetails(id) {
    setBusy(true);
    setError("");

    try {
      setSelected(await request(`/${id}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(item, status) {
    if (!status) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const updated = await request(`/${item._id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });

      if (selected?._id === item._id) setSelected(updated);
      setMessage(`Status changed to ${status}.`);
      setReload((value) => value + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteApplication(item) {
    if (!window.confirm(`Delete ${item.applicationId} at ${item.company}?`)) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await request(`/${item._id}`, { method: "DELETE" });
      if (selected?._id === item._id) setSelected(null);
      setMessage("Application deleted.");
      setReload((value) => value + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const total = Object.values(counts).reduce(
    (sum, count) => sum + count, 0
  );

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="logo">J</span>
          Jobfolio
        </a>
        <span className="header-note">Your next chapter starts here</span>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow">JOB APPLICATION TRACKER</p>
          <h1>A clearer view of your career.</h1>
          <p className="subtitle">
            Keep every opportunity, next step and follow-up in one place.
          </p>
        </div>
        <button className="primary" onClick={openAdd} disabled={busy}>
          + Add application
        </button>
      </section>

      <section className="stats" aria-label="Application counts">
        <div className="stat total">
          <span>Total applications</span>
          <strong>{total}</strong>
        </div>
        {statuses.map((status) => (
          <div className="stat" key={status}>
            <span>{status}</span>
            <strong>{counts[status] || 0}</strong>
          </div>
        ))}
      </section>

      {message && <p className="success" role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <section className="workspace">
        <div className="section-heading">
          <div>
            <h2>Your applications</h2>
            <p>Track progress from the first application to the final decision.</p>
          </div>
          <button
            className="secondary"
            onClick={() => setReload((value) => value + 1)}
            disabled={loading || busy}
          >
            Refresh
          </button>
        </div>

        <div className="filters">
          <label>
            Search company
            <input
              type="search"
              placeholder="Search by company name..."
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <label>
            Status
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="">All statuses</option>
              {statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="empty" role="status">Loading applications...</p>
        ) : error ? (
          <p className="empty">Unable to load applications. Click Refresh to retry.</p>
        ) : items.length === 0 ? (
          <div className="empty">
            <h3>No applications found</h3>
            <p>Add your first opportunity or adjust your search.</p>
          </div>
        ) : (
          <div className="cards">
            {items.map((item) => (
              <article className="application-card" key={item._id}>
                <div className="card-top">
                  <span className="application-id">{item.applicationId}</span>
                  <span className={`badge ${item.status.toLowerCase()}`}>
                    {item.status}
                  </span>
                </div>

                <h3>{item.company}</h3>
                <p className="role">{item.role}</p>

                <div className="metadata">
                  <span>{item.jobType}</span>
                  <span>Applied {item.appliedDate}</span>
                </div>

                {item.isOverdue && (
                  <p className="overdue">Follow-up Overdue</p>
                )}

                <label className="status-control">
                  Next status
                  <select
                    value=""
                    disabled={busy || item.nextStatuses.length === 0}
                    onChange={(event) =>
                      changeStatus(item, event.target.value)
                    }
                  >
                    <option value="">
                      {item.nextStatuses.length ? "Change status..." : "Final status"}
                    </option>
                    {item.nextStatuses.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </label>

                <div className="card-actions">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => openDetails(item._id)}
                  >
                    Details
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => openEdit(item)}
                  >
                    Edit
                  </button>
                  <button
                    className="danger"
                    disabled={busy || !item.canDelete}
                    title={
                      item.canDelete
                        ? "Delete application"
                        : "Cannot delete during Interview or Offer"
                    }
                    onClick={() => deleteApplication(item)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {showForm && (
        <div className="overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-title"
          >
            <div className="modal-heading">
              <h2 id="form-title">
                {editing ? "Edit application" : "Add application"}
              </h2>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setShowForm(false)}
              >
                Close
              </button>
            </div>

            {editing && (
              <p className="muted">
                {editing.applicationId} · ID and applied date are fixed.
              </p>
            )}

            <form onSubmit={saveApplication}>
              <fieldset disabled={busy}>
                <div className="form-grid">
                  <label>
                    Company name *
                    <input
                      name="company"
                      value={form.company}
                      onChange={changeField}
                      maxLength={100}
                      required
                    />
                  </label>
                  <label>
                    Job role *
                    <input
                      name="role"
                      value={form.role}
                      onChange={changeField}
                      maxLength={100}
                      required
                    />
                  </label>
                  <label>
                    Job type *
                    <select
                      name="jobType"
                      value={form.jobType}
                      onChange={changeField}
                    >
                      <option>Full-time</option>
                      <option>Internship</option>
                      <option>Contract</option>
                    </select>
                  </label>
                  <label>
                    Applied date *
                    <input
                      type="date"
                      name="appliedDate"
                      value={form.appliedDate}
                      max={today()}
                      onChange={changeField}
                      disabled={Boolean(editing)}
                      required
                    />
                  </label>
                  <label className="full">
                    Expected salary
                    <input
                      type="number"
                      name="salary"
                      value={form.salary}
                      onChange={changeField}
                      min="0"
                      step="any"
                      placeholder="Optional"
                    />
                  </label>
                  <label className="full">
                    Notes
                    <textarea
                      name="notes"
                      value={form.notes}
                      onChange={changeField}
                      maxLength={2000}
                      rows={4}
                      placeholder="Contacts, interview notes or useful details..."
                    />
                  </label>
                </div>

                {formError && (
                  <p className="error" role="alert">{formError}</p>
                )}

                <button className="primary save" type="submit">
                  {busy ? "Saving..." : "Save application"}
                </button>
              </fieldset>
            </form>
          </section>
        </div>
      )}

      {selected && (
        <div className="overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="details-title"
          >
            <div className="modal-heading">
              <h2 id="details-title">{selected.company}</h2>
              <button
                className="secondary"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>

            <p className="application-id">{selected.applicationId}</p>
            <p className="role">{selected.role}</p>
            <span className={`badge ${selected.status.toLowerCase()}`}>
              {selected.status}
            </span>

            {selected.isOverdue && (
              <p className="overdue">Follow-up Overdue</p>
            )}

            <dl className="details-grid">
              <div><dt>Job type</dt><dd>{selected.jobType}</dd></div>
              <div><dt>Applied date</dt><dd>{selected.appliedDate}</dd></div>
              <div><dt>Follow-up date</dt><dd>{selected.followUpDate}</dd></div>
              <div>
                <dt>Expected salary</dt>
                <dd>
                  {selected.salary == null
                    ? "Not specified"
                    : selected.salary.toLocaleString("en-IN")}
                </dd>
              </div>
            </dl>

            <h3>Notes</h3>
            <p className="notes">{selected.notes || "No notes added."}</p>

            <h3>Status history</h3>
            <ol className="timeline">
              {selected.history.map((entry, index) => (
                <li key={`${entry.changedAt}-${index}`}>
                  <strong>{entry.status}</strong>
                  <time dateTime={entry.changedAt}>
                    {new Date(entry.changedAt).toLocaleString("en-IN")}
                  </time>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      <footer>Jobfolio · Built with MongoDB, Express, React and Node.js</footer>
    </main>
  );
}