import { useEffect, useState } from "react";
import {
    Activity,
    Archive,
    Database,
    HardDrive,
    Layers3,
    Logs,
    Network,
    Server,
    Settings,
    ShieldCheck,
    Users,
} from "lucide-react";
import "./App.css";
import MetricChart from "./components/MetricChart";
import DirectoryExplorer from "./components/DirectoryExplorer";
import type { MetricsSnapshot } from "./types/system";

interface HealthResponse {
    status: string;
    service: string;
    timestamp: string;
    uptime: number;
}

interface SystemOverview {
    timestamp: string;
    cpu: {
        brand: string;
        physicalCores: number;
        logicalCores: number;
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

type AdminSection =
    | "Overview"
    | "Monitoring"
    | "Storage"
    | "Media Management"
    | "Devices & Network"
    | "Sessions"
    | "Background Jobs"
    | "Logs"
    | "Services"
    | "Backups"
    | "Settings";

const adminNavigation: Array<{
    label: AdminSection;
    icon: typeof Activity;
}> = [
    { label: "Overview", icon: Activity },
    { label: "Monitoring", icon: Server },
    { label: "Storage", icon: HardDrive },
    { label: "Media Management", icon: Layers3 },
    { label: "Devices & Network", icon: Network },
    { label: "Sessions", icon: Users },
    { label: "Background Jobs", icon: Database },
    { label: "Logs", icon: Logs },
    { label: "Services", icon: ShieldCheck },
    { label: "Backups", icon: Archive },
    { label: "Settings", icon: Settings },
];

function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "--";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1,
    );
    return `${(bytes / 1024 ** index).toFixed(2)} ${units[index]}`;
}

function formatUptime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "--";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
}

function App() {
    const [activeSection, setActiveSection] = useState<AdminSection>("Overview");
    const [health, setHealth] = useState<HealthResponse | null>(null);
    const [system, setSystem] = useState<SystemOverview | null>(null);
    const [history, setHistory] = useState<MetricsSnapshot[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    useEffect(() => {
        let active = true;

        async function refresh(): Promise<void> {
            try {
                const [healthResponse, systemResponse, historyResponse] = await Promise.all([
                    fetch("/api/health"),
                    fetch("/api/system/overview"),
                    fetch("/api/system/history"),
                ]);

                if (!healthResponse.ok || !systemResponse.ok || !historyResponse.ok) {
                    throw new Error("Unable to load server information");
                }

                const [healthData, systemData, historyData] = await Promise.all([
                    healthResponse.json(),
                    systemResponse.json(),
                    historyResponse.json(),
                ]);

                if (active) {
                    setHealth(healthData as HealthResponse);
                    setSystem((systemData as { data: SystemOverview }).data);
                    setHistory(
                        (historyData as { data: MetricsSnapshot[] }).data.slice(-150),
                    );
                    setError("");
                }
            } catch (caught) {
                if (active) {
                    setError(
                        caught instanceof Error
                            ? caught.message
                            : "Unable to load server information",
                    );
                }
            } finally {
                if (active) setLoading(false);
            }
        }

        void refresh();
        const timer = window.setInterval(() => void refresh(), 5000);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, []);

    const availableSection =
        activeSection === "Overview" ||
        activeSection === "Monitoring" ||
        activeSection === "Storage";

    const primaryDisk = system?.disks[0];

    return (
        <main className={`orbital-shell orbital-admin${sidebarCollapsed ? " orbital-shell-collapsed" : ""}`}>
            <aside className="orbital-sidebar">
                <div className="orbital-brand">
                    <button
                        type="button"
                        className="orbital-brand-mark"
                        aria-label="Collapse sidebar"
                        onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
                    >
                        O
                    </button>
                    <div className="orbital-brand-copy">
                        <strong>Orbital</strong>
                        <span>Server console</span>
                    </div>
                </div>

                <nav className="orbital-nav admin-nav" aria-label="Administrator navigation">
                    {adminNavigation.map((item) => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.label}
                                type="button"
                                className={activeSection === item.label ? "active" : ""}
                                onClick={() => setActiveSection(item.label)}
                                title={sidebarCollapsed ? item.label : undefined}
                            >
                                <Icon size={17} strokeWidth={1.8} />
                                <span>{item.label}</span>
                            </button>
                        );
                    })}
                </nav>

                <div className="orbital-account">
                    <div className="orbital-avatar">AS</div>
                    <div className="orbital-account-copy">
                        <strong>Administrator</strong>
                        <span>Local server</span>
                    </div>
                </div>
            </aside>

            <section className="orbital-main">
                <header className="orbital-header">
                    <div>
                        <span className="orbital-kicker">ORBITAL / ADMIN</span>
                        <h1>{activeSection}</h1>
                        <p>
                            {activeSection === "Overview"
                                ? "Current server health and resource usage."
                                : activeSection === "Monitoring"
                                    ? "Recent CPU and memory performance."
                                    : activeSection === "Storage"
                                        ? "Filesystem capacity reported by the server."
                                        : "This management capability is not available in the current backend."}
                        </p>
                    </div>
                    <div className={`orbital-server-status${health ? " online" : ""}`}>
                        <span />
                        {health ? "Server online" : "Unavailable"}
                    </div>
                </header>

                {error && <div className="orbital-alert" role="alert">{error}</div>}

                {loading ? (
                    <div className="orbital-loading">Loading server information...</div>
                ) : activeSection === "Storage" ? (
                    <section className="orbital-storage-grid">
                        {system?.disks.map((disk) => (
                            <article className="orbital-storage-card" key={`${disk.filesystem}-${disk.mount}`}>
                                <div className="orbital-card-heading">
                                    <div>
                                        <span>Disk</span>
                                        <strong>{disk.mount}</strong>
                                    </div>
                                    <HardDrive size={18} />
                                </div>
                                <div className="orbital-storage-bar">
                                    <span style={{ width: `${disk.usagePercent}%` }} />
                                </div>
                                <div className="orbital-storage-meta">
                                    <strong>{disk.usagePercent.toFixed(1)}% used</strong>
                                    <span>{formatBytes(disk.available)} available</span>
                                </div>
                            </article>
                        ))}
                        {(!system?.disks || system.disks.length === 0) && (
                            <div className="orbital-empty">No disk information is available.</div>
                        )}
                    </section>
                ) : !availableSection ? (
                    <section className="orbital-panel orbital-unavailable">
                        <div className="orbital-panel-icon"><Server size={22} /></div>
                        <h2>{activeSection}</h2>
                        <p>This backend module has not been implemented, so no server data is displayed here.</p>
                    </section>
                ) : activeSection === "Monitoring" ? (
                    history.length === 0 ? (
                        <div className="orbital-empty">Performance history is not available yet.</div>
                    ) : (
                        <section className="orbital-monitor-grid">
                            <MetricChart
                                title="CPU utilization"
                                data={history.map((item) => ({
                                    timestamp: item.timestamp,
                                    value: item.cpu.usagePercent,
                                }))}
                            />
                            <MetricChart
                                title="Memory utilization"
                                data={history.map((item) => ({
                                    timestamp: item.timestamp,
                                    value: item.memory.usagePercent,
                                }))}
                            />
                        </section>
                    )
                ) : (
                    <>
                        <section className="orbital-kpi-grid">
                            <article className="orbital-kpi">
                                <span>CPU</span>
                                <strong>{system ? `${system.cpu.usagePercent.toFixed(1)}%` : "--"}</strong>
                                <small>{system ? `${system.cpu.logicalCores} logical cores` : "Unavailable"}</small>
                            </article>
                            <article className="orbital-kpi">
                                <span>Memory</span>
                                <strong>{system ? `${system.memory.usagePercent.toFixed(1)}%` : "--"}</strong>
                                <small>{system ? `${formatBytes(system.memory.used)} of ${formatBytes(system.memory.total)}` : "Unavailable"}</small>
                            </article>
                            <article className="orbital-kpi">
                                <span>Storage</span>
                                <strong>{primaryDisk ? `${primaryDisk.usagePercent.toFixed(1)}%` : "--"}</strong>
                                <small>{primaryDisk ? `${formatBytes(primaryDisk.available)} available` : "Unavailable"}</small>
                            </article>
                            <article className="orbital-kpi">
                                <span>Uptime</span>
                                <strong>{system ? formatUptime(system.uptime.systemSeconds) : "--"}</strong>
                                <small>{system?.operatingSystem.hostname ?? "Hostname unavailable"}</small>
                            </article>
                        </section>

                        <section className="orbital-dashboard-grid">
                            <article className="orbital-panel">
                                <div className="orbital-card-heading">
                                    <div>
                                        <span>System</span>
                                        <strong>Host information</strong>
                                    </div>
                                    <Server size={18} />
                                </div>
                                <dl className="orbital-details">
                                    <div><dt>Processor</dt><dd>{system?.cpu.brand ?? "--"}</dd></div>
                                    <div><dt>Platform</dt><dd>{system ? `${system.operatingSystem.distribution} ${system.operatingSystem.release}` : "--"}</dd></div>
                                    <div><dt>Process uptime</dt><dd>{system ? formatUptime(system.uptime.processSeconds) : "--"}</dd></div>
                                </dl>
                            </article>

                            <article className="orbital-panel">
                                <div className="orbital-card-heading">
                                    <div>
                                        <span>Network</span>
                                        <strong>Active interfaces</strong>
                                    </div>
                                    <Network size={18} />
                                </div>
                                <div className="orbital-network-list">
                                    {system?.network.filter((network) => !network.internal).map((network) => (
                                        <div key={network.name}>
                                            <span className="orbital-network-dot" />
                                            <strong>{network.name}</strong>
                                            <small>{network.ipv4 || "No IPv4"}</small>
                                        </div>
                                    ))}
                                    {(!system?.network || system.network.filter((network) => !network.internal).length === 0) && (
                                        <span className="orbital-muted">No external interfaces reported.</span>
                                    )}
                                </div>
                            </article>
                        </section>

                        <section className="orbital-files-panel">
                            <DirectoryExplorer readOnly={false} section="Files" />
                        </section>
                    </>
                )}
            </section>
        </main>
    );
}

export default App;
