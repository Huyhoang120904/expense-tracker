import { useEffect, useState } from "react";

type ApiState = "checking" | "online" | "offline";

const currentMonth = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
}).format(new Date());

function App() {
  const [apiState, setApiState] = useState<ApiState>("checking");

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/health", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Health request failed");
        const result = (await response.json()) as { status?: string };
        if (result.status !== "ok") throw new Error("Worker is not healthy");
        setApiState("online");
      })
      .catch(() => {
        if (!controller.signal.aborted) setApiState("offline");
      });

    return () => controller.abort();
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Expense tracker home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 36 36" fill="none">
              <rect width="36" height="36" rx="12" fill="currentColor" />
              <path d="M11 12.5h14M11 18h9M11 23.5h7" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="25" cy="23.5" r="4" fill="#B8E4C7" />
            </svg>
          </span>
          <span className="brand-copy">
            <strong>Expense tracker</strong>
            <small>PERSONAL</small>
          </span>
        </a>

        <p className="sidebar-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          <a className="nav-link is-active" href="#overview" aria-current="page">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="3" y="3" width="5.5" height="6" rx="1.5" fill="currentColor" />
              <rect x="11.5" y="3" width="5.5" height="3.5" rx="1.2" fill="currentColor" opacity=".55" />
              <rect x="11.5" y="8.5" width="5.5" height="8.5" rx="1.5" fill="currentColor" opacity=".55" />
              <rect x="3" y="11" width="5.5" height="6" rx="1.5" fill="currentColor" opacity=".55" />
            </svg>
            Overview
          </a>
        </nav>

        <div className="sidebar-footer">
          <span className={`status-dot status-${apiState}`} aria-hidden="true" />
          <div>
            <strong>Local API</strong>
            <span aria-live="polite">
              {apiState === "checking" && "Checking connection"}
              {apiState === "online" && "Connected"}
              {apiState === "offline" && "Not running"}
            </span>
          </div>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <span className="breadcrumb">Personal space <span>/</span> Overview</span>
          <span className="local-badge"><span /> LOCAL VIEW</span>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <p className="eyebrow">YOUR MONEY, IN VIEW</p>
              <h1>Overview</h1>
              <p className="subheading">A simple snapshot of your monthly finances.</p>
            </div>
            <div className="month-picker" aria-label={`Showing ${currentMonth}`}>
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect x="3" y="4.5" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M6.5 3v3M13.5 3v3M3 8h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {currentMonth}
              <span className="chevron" aria-hidden="true">⌄</span>
            </div>
          </section>

          <section className="metric-grid" aria-label="Monthly summary">
            <Metric title="Income" accent="mint" icon="↗" />
            <Metric title="Spending" accent="peach" icon="↘" />
            <Metric title="Available" accent="lavender" icon="=" />
          </section>

          <section className="content-grid">
            <article className="panel spending-panel">
              <div className="panel-heading">
                <div>
                  <h2>Monthly spending</h2>
                  <p>See where your money goes</p>
                </div>
              </div>
              <div className="chart-empty">
                <div className="chart-decoration" aria-hidden="true">
                  <span /><span /><span /><span /><span /><span /><span />
                </div>
                <div className="empty-copy">
                  <span className="empty-icon" aria-hidden="true">↗</span>
                  <strong>Your monthly summary will appear here</strong>
                  <span>Connect the ledger to see spending and income.</span>
                </div>
              </div>
            </article>

            <article className="panel activity-panel">
              <div className="panel-heading">
                <div>
                  <h2>Recent activity</h2>
                  <p>Your latest transactions</p>
                </div>
              </div>
              <div className="activity-empty">
                <span className="activity-illustration" aria-hidden="true">
                  <svg viewBox="0 0 48 48" fill="none">
                    <rect x="8" y="10" width="32" height="28" rx="7" fill="#EDF3EE" />
                    <path d="M16 19h16M16 24h10M16 29h7" stroke="#71877A" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="34" cy="32" r="7" fill="#D2E8D8" stroke="white" strokeWidth="2" />
                    <path d="M34 28.5v7M31.5 32h5" stroke="#2F6446" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                <strong>No activity to show yet</strong>
                <span>Your transactions will show up here once the ledger is connected.</span>
              </div>
            </article>
          </section>

          <footer className="page-footer">
            <span>Private by design</span>
            <span className="footer-separator">·</span>
            <span>Running on your computer</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function Metric({ title, accent, icon }: { title: string; accent: string; icon: string }) {
  return (
    <article className="metric-card">
      <div className="metric-topline">
        <span>{title}</span>
        <span className={`metric-icon ${accent}`} aria-hidden="true">{icon}</span>
      </div>
      <div className="metric-value">—</div>
      <div className="metric-note">Monthly totals will appear when the ledger is connected</div>
    </article>
  );
}

export default App;
