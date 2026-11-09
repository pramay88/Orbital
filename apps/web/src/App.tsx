
import { useEffect, useState } from "react";
import "./App.css";

interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
  uptime: number;
}

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkHealth() {
      try {
        const response = await fetch("/api/health");

        if (!response.ok) {
          throw new Error("Server unavailable");
        }

        const data: HealthResponse = await response.json();

        if (active) {
          setHealth(data);
          setError(false);
        }
      } catch {
        if (active) {
          setError(true);
          setHealth(null);
        }
      }
    }

    checkHealth();

    const interval = setInterval(checkHealth, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const uptime = health
    ? `${Math.floor(health.uptime / 3600)}h ${Math.floor(
      (health.uptime % 3600) / 60
    )}m`
    : "--";

  return (
    <main className="dashboard">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">H</div>
          <span>HomeHub</span>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <nav>
          <a className="nav-item active">▦ Dashboard</a>
          <a className="nav-item">▤ Files</a>
          <a className="nav-item">▣ Media</a>
          <a className="nav-item">◉ Devices</a>
          <a className="nav-item">⌘ Applications</a>
          <a className="nav-item">◷ Activity</a>
        </nav>

        <div className="sidebar-footer">
          <div className="avatar">HH</div>
          <div>
            <strong>Home Server</strong>
            <small>Local instance</small>
          </div>
        </div>
      </aside>

      <section className="main-content">
        <header className="topbar">
          <div>
            <small>HOME / OVERVIEW</small>
            <h1>Dashboard</h1>
          </div>

          <div className="connection">
            <span className={health ? "dot online" : "dot offline"} />
            {health ? "Connected" : "Disconnected"}
          </div>
        </header>

        <section className="welcome">
          <div>
            <span className="eyebrow">PERSONAL INFRASTRUCTURE</span>
            <h2>Your home. Your server. Your data.</h2>
            <p>
              Manage your files, media, devices and applications
              from one place.
            </p>
          </div>
          <div className="welcome-icon">⌘</div>
        </section>

        <h3>System overview</h3>

        <section className="stats-grid">
          <StatCard
            label="Server status"
            value={health ? "Online" : "Offline"}
            detail={health?.service ?? "Waiting for connection"}
          />

          <StatCard
            label="Server uptime"
            value={uptime}
            detail="Since process started"
          />

          <StatCard
            label="CPU usage"
            value="--"
            detail="Metrics coming in M2"
          />

          <StatCard
            label="Memory usage"
            value="--"
            detail="Metrics coming in M2"
          />
        </section>

        <h3>Services</h3>

        <section className="services-grid">
          <ServiceCard
            icon="▤"
            title="File Server"
            description="Manage and share your files"
            status="Coming soon"
          />

          <ServiceCard
            icon="▣"
            title="Media Server"
            description="Stream your personal media"
            status="Coming soon"
          />

          <ServiceCard
            icon="◉"
            title="Device Manager"
            description="Manage connected devices"
            status="Coming soon"
          />

          <ServiceCard
            icon="⌘"
            title="Web Hosting"
            description="Host your local applications"
            status="Coming soon"
          />
        </section>

        <footer className="footer">
          HomeHub v0.1.0 · Local-first infrastructure
          {error && <span> · API connection failed</span>}
        </footer>
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function ServiceCard({
  icon,
  title,
  description,
  status,
}: {
  icon: string;
  title: string;
  description: string;
  status: string;
}) {
  return (
    <article className="service-card">
      <div className="service-icon">{icon}</div>
      <h4>{title}</h4>
      <p>{description}</p>
      <small>{status}</small>
    </article>
  );
}

export default App;
