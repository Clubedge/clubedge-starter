import { Button } from "@clubedge/ui/components/button";

const integrations = [
  { icon: "N", name: "Next.js", description: "App Router · TypeScript", status: "Ready" },
  { icon: "D", name: "Drizzle ORM", description: "PostgreSQL · migrations", status: "Ready" },
  { icon: "S", name: "Supabase Auth", description: "Cookie based SSR sessions", status: "Connect" },
  {
    icon: "R",
    name: "Redis",
    description: "Cache · rate limiting",
    status: "Optional",
    optional: true,
  },
];

const setup = [
  [
    "Add your environment values",
    "Copy .env.example to apps/web/.env.local and add your provider credentials.",
  ],
  ["Apply database migrations", "Run pnpm db:generate, then pnpm db:migrate."],
  ["Start building", "Your app code is ready in apps/web/src/app and apps/web/src/lib."],
];

export default function Home() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home">
          <span className="brand-mark">c</span>
          <span>
            clubedge<span style={{ color: "#899790", fontWeight: 500 }}> / starter</span>
          </span>
        </a>
        <div>
          <div className="workspace-label">Workspace</div>
          <nav className="nav" aria-label="Main navigation" style={{ marginTop: 12 }}>
            <a className="active" href="#overview">
              <span className="nav-icon">◫</span>Overview
            </a>
            <a href="#integrations">
              <span className="nav-icon">⌘</span>Integrations
            </a>
            <a href="#database">
              <span className="nav-icon">▤</span>Database
            </a>
            <a href="#security">
              <span className="nav-icon">◇</span>Security
            </a>
          </nav>
        </div>
        <div>
          <div className="workspace-label">Resources</div>
          <nav className="nav" aria-label="Resources" style={{ marginTop: 12 }}>
            <a href="#docs">
              <span className="nav-icon">▧</span>Documentation
            </a>
            <a href="https://github.com" target="_blank" rel="noreferrer">
              <span className="nav-icon">↗</span>GitHub repository
            </a>
          </nav>
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-card">
            <strong>Built for your next idea</strong>
            <p>
              Composable foundations that keep your product code independent from infrastructure
              providers.
            </p>
            <a href="#docs">Read the guide ↗</a>
          </div>
          <div style={{ padding: "18px 10px 0", color: "#9aa59f", fontSize: 10 }}>
            CLUBEDGE PLATFORM <span style={{ float: "right" }}>v1.0.0</span>
          </div>
        </div>
      </aside>

      <main className="main" id="home">
        <header className="topbar">
          <div className="crumbs">
            <span>Workspace</span>
            <span>/</span>
            <strong>Overview</strong>
          </div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Help">
              ?
            </button>
            <div className="avatar" aria-label="Starter account">
              CE
            </div>
          </div>
        </header>
        <div className="content" id="overview">
          <section className="welcome">
            <div>
              <div className="eyebrow">Your development platform</div>
              <h1 className="page-heading">A better place to start building.</h1>
              <p className="intro">
                Your Clubedge foundation is ready. Core tools are organized, provider integrations
                stay behind clean interfaces, and your next feature can start here.
              </p>
            </div>
            <Button asChild size="lg">
              <a href="#setup">
                Explore your starter <span className="button-arrow">↗</span>
              </a>
            </Button>
          </section>

          <div className="status-strip">
            <span className="status-label">
              <i className="status-dot" />
              Starter is ready
            </span>
            <span className="status-sep" />
            <span className="status-item">
              <b>Framework</b> Next.js 16
            </span>
            <span className="status-item">
              <b>Runtime</b> Node.js 22
            </span>
            <span className="status-item">
              <b>Mode</b> Development
            </span>
          </div>

          <section aria-labelledby="foundation-title">
            <div className="section-head">
              <div>
                <h2 className="section-title" id="foundation-title">
                  Your foundation
                </h2>
                <p className="section-subtitle">
                  The essentials are in place and ready to grow with you.
                </p>
              </div>
              <a className="text-link" href="#integrations">
                View integrations ↗
              </a>
            </div>
            <div className="metrics">
              <article className="metric-card">
                <div className="metric-top">
                  <span>Core modules</span>
                  <span className="metric-icon">◈</span>
                </div>
                <div className="metric-value">6</div>
                <div className="metric-caption">Connected to your application</div>
              </article>
              <article className="metric-card">
                <div className="metric-top">
                  <span>Provider adapters</span>
                  <span className="metric-icon">⌘</span>
                </div>
                <div className="metric-value">4</div>
                <div className="metric-caption">Swap services without rewrites</div>
              </article>
              <article className="metric-card">
                <div className="metric-top">
                  <span>Environment</span>
                  <span className="metric-icon">⌁</span>
                </div>
                <div className="metric-value" style={{ fontSize: 17, marginTop: 16 }}>
                  Validated
                </div>
                <div className="metric-caption">Zod checks configuration on startup</div>
              </article>
              <article className="metric-card">
                <div className="metric-top">
                  <span>Health check</span>
                  <span className="metric-icon">♥</span>
                </div>
                <div className="metric-value" style={{ fontSize: 17, marginTop: 16 }}>
                  Operational
                </div>
                <div className="metric-caption">
                  <a className="text-link" href="/api/health">
                    Open /api/health ↗
                  </a>
                </div>
              </article>
            </div>
          </section>

          <div className="lower-grid" id="integrations">
            <section className="panel" aria-labelledby="integration-title">
              <div className="panel-head">
                <h2 className="panel-title" id="integration-title">
                  Platform integrations
                </h2>
                <span className="panel-meta">4 modules</span>
              </div>
              {integrations.map((item) => (
                <div className="integration-row" key={item.name}>
                  <div className="integration-icon">{item.icon}</div>
                  <div>
                    <div className="integration-name">{item.name}</div>
                    <div className="integration-desc">{item.description}</div>
                  </div>
                  {item.status === "Connect" ? (
                    <a className="badge" href="/login">
                      Connect
                    </a>
                  ) : (
                    <span className={`badge${item.optional ? " optional" : ""}`}>
                      {item.status}
                    </span>
                  )}
                </div>
              ))}
            </section>
            <section className="panel" id="setup" aria-labelledby="setup-title">
              <div className="panel-head">
                <h2 className="panel-title" id="setup-title">
                  Get started
                </h2>
                <span className="panel-meta">3 simple steps</span>
              </div>
              <div className="checklist">
                {setup.map(([title, description], index) => (
                  <div className="check-row" key={title}>
                    <span className="checkmark">{index + 1}</span>
                    <div className="check-copy">
                      <strong>{title}</strong>
                      <span>{description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <p className="footer-note">
            A calm, consistent starting point from Clubedge Engineering.
          </p>
        </div>
      </main>
    </div>
  );
}
