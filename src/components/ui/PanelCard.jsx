export function PanelCard({ title, description, action, children, className = "", id }) {
  return (
    <section id={id} className={`panel-card ${className}`}>
      {(title || description || action) ? (
        <header className="panel-card-header">
          <div>
            {title ? <h2 className="panel-card-title">{title}</h2> : null}
            {description ? <p className="panel-card-desc">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function MetricCard({ label, value, hint, className = "" }) {
  return (
    <div className={`metric-card ${className}`}>
      <p className="metric-card-label">{label}</p>
      <p className="metric-card-value">{value}</p>
      {hint ? <p className="metric-card-hint">{hint}</p> : null}
    </div>
  );
}

export function DashboardTabs({ tabs, activeTab, onChange }) {
  return (
    <nav className="dashboard-tabs" aria-label="Navegação do painel">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={isActive ? "dashboard-tab dashboard-tab-active" : "dashboard-tab"}
          >
            {tab.icon ? <span className="dashboard-tab-icon" aria-hidden="true">{tab.icon}</span> : null}
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
