import { useEffect, useState } from "react";
import "./App.css";

interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
  uptime: number;
}


interface SystemOverview {
  timestamp: string;

  cpu: {
    manufacturer: string;
    brand: string;
    physicalCores: number;
    logicalCores: number;
    speedGHz: number;
    usagePercent: number;
  };

  memory: {
    total: number;
    used: number;
    available: number;
    usagePercent: number;
  };

  disks: {
    filesystem: string;
    mount: string;
    type: string;
    total: number;
    used: number;
    available: number;
    usagePercent: number;
  }[];

  operatingSystem: {
    platform: string;
    distribution: string;
    release: string;
    architecture: string;
    hostname: string;
  };

  uptime: {
    systemSeconds: number;
    processSeconds: number;
  };

  network: {
    name: string;
    type: string;
    ipv4: string;
    ipv6: string;
    state: string;
    speedMbps: number;
    internal: boolean;
  }[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${(bytes / Math.pow(1024, index)).toFixed(2)} ${units[index]}`;
}


function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState(false);
  const [system, setSystem] = useState<SystemOverview | null>(null);
  const [systemError, setSystemError] = useState(false);

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


  useEffect(() => {
    let active = true;

    async function fetchSystemInfo() {
      try {
        const response = await fetch("/api/system/overview");

        if (!response.ok) {
          throw new Error("System API unavailable");
        }

        const result = await response.json();

        if (active) {
          setSystem(result.data);
          setSystemError(false);
        }
      } catch {
        if (active) {
          setSystemError(true);
        }
      }
    }

    fetchSystemInfo();

    const interval = setInterval(fetchSystemInfo, 5000);

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
            label="CPU usage"
            value={
              system ? `${system.cpu.usagePercent}%` : "--"
            }
            detail={
              system
                ? `${system.cpu.logicalCores} logical cores`
                : "Collecting metrics..."
            }
          />

          <StatCard
            label="Memory usage"
            value={
              system ? `${system.memory.usagePercent}%` : "--"
            }
            detail={
              system
                ? `${formatBytes(system.memory.used)} / ${formatBytes(system.memory.total)}`
                : "Collecting metrics..."
            }
          />

          <StatCard
            label="Storage usage"
            value={
              system?.disks[0]
                ? `${system.disks[0].usagePercent.toFixed(1)}%`
                : "--"
            }
            detail={
              system?.disks[0]
                ? `${formatBytes(system.disks[0].available)} available`
                : "Collecting metrics..."
            }
          />
        </section>


        <h3>Hardware & environment</h3>

        <section className="stats-grid">
          <StatCard
            label="Processor"
            value={system?.cpu.brand ?? "--"}
            detail={
              system
                ? `${system.cpu.physicalCores} physical / ${system.cpu.logicalCores} logical cores`
                : "Unavailable"
            }
          />

          <StatCard
            label="Operating system"
            value={system?.operatingSystem.distribution ?? "--"}
            detail={
              system
                ? `${system.operatingSystem.release} · ${system.operatingSystem.architecture}`
                : "Unavailable"
            }
          />

          <StatCard
            label="System uptime"
            value={
              system
                ? `${Math.floor(system.uptime.systemSeconds / 86400)}d ${Math.floor((system.uptime.systemSeconds % 86400) / 3600)}h`
                : "--"
            }
            detail="Host operating system"
          />

          <StatCard
            label="Hostname"
            value={system?.operatingSystem.hostname ?? "--"}
            detail="Machine identity"
          />
        </section>

        <h3>Network interfaces</h3>

        <section className="services-grid">
          {system?.network
            .filter((network) => !network.internal)
            .map((network) => (
              <article className="service-card" key={network.name}>
                <div className="service-icon">⌘</div>
                <h4>{network.name}</h4>
                <p>{network.ipv4 || "No IPv4 address"}</p>
                <small>
                  {network.state} · {network.type}
                </small>
              </article>
            ))}
        </section>

        {systemError && (
          <p role="alert">Unable to refresh system metrics.</p>
        )}



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
