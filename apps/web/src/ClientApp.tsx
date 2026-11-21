import { useEffect, useState, type FormEvent } from "react";
import {
    Clock3,
    Files,
    Heart,
    Home,
    Library,
    Settings,
    Server,
} from "lucide-react";
import DirectoryExplorer from "./components/DirectoryExplorer";
import "./App.css";

type ClientSection = "Home" | "Files" | "Media Library" | "Recent" | "Favorites" | "Account";

interface AuthUser {
    username: string;
    role: "admin" | "user";
}

const navigation: Array<{
    label: ClientSection;
    icon: typeof Home;
}> = [
    { label: "Home", icon: Home },
    { label: "Files", icon: Files },
    { label: "Media Library", icon: Library },
    { label: "Recent", icon: Clock3 },
    { label: "Favorites", icon: Heart },
    { label: "Account", icon: Settings },
];

export default function ClientApp() {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [activeSection, setActiveSection] = useState<ClientSection>("Home");
    const [showLogin, setShowLogin] = useState(false);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [serverOnline, setServerOnline] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void fetch("/api/auth/me")
                .then(async (response) => {
                    if (!response.ok) {
                        setUser(null);
                        return;
                    }
                    const result = await response.json();
                    setUser(result.user as AuthUser);
                })
                .catch(() => setUser(null));

            void fetch("/api/health")
                .then((response) => setServerOnline(response.ok))
                .catch(() => setServerOnline(false));
        }, 0);

        return () => window.clearTimeout(timer);
    }, []);

    const login = async (event: FormEvent) => {
        event.preventDefault();
        setError("");

        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });

        if (!response.ok) {
            const result = await response.json().catch(() => null);
            setError(result?.error ?? "Login failed");
            return;
        }

        const result = await response.json();
        setUser(result.user as AuthUser);
        setPassword("");
        setShowLogin(false);
    };

    const logout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        setUser(null);
    };

    const sectionDescription =
        activeSection === "Home" ? "Your digital space. Your control." :
        activeSection === "Files" ? "Browse, upload, and organize your files." :
        activeSection === "Media Library" ? "Open supported media directly from your library." :
        activeSection === "Recent" ? "Files opened during this browser session." :
        activeSection === "Favorites" ? "Pinned files stored on this device." :
        "Manage your Orbital session.";

    return (
        <main className={`orbital-shell${sidebarCollapsed ? " orbital-shell-collapsed" : ""}`}>
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
                        <span>Your digital space</span>
                    </div>
                </div>

                <nav className="orbital-nav" aria-label="Client navigation">
                    {navigation.map((item) => {
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
                    <div className="orbital-avatar">
                        {user ? user.username.slice(0, 1).toUpperCase() : "G"}
                    </div>
                    <div className="orbital-account-copy">
                        <strong>{user?.username ?? "Guest"}</strong>
                        <span>{user ? "Signed in" : "Read access"}</span>
                    </div>
                    {user ? (
                        <button type="button" onClick={() => void logout()}>
                            Sign out
                        </button>
                    ) : (
                        <button type="button" onClick={() => setShowLogin(true)}>
                            Sign in
                        </button>
                    )}
                </div>
            </aside>

            <section className="orbital-main">
                <header className="orbital-header">
                    <div>
                        <span className="orbital-kicker">ORBITAL</span>
                        <h1>{activeSection}</h1>
                        <p>{sectionDescription}</p>
                    </div>
                    {user && <span className="orbital-role">{user.role}</span>}
                </header>

                {showLogin && (
                    <div
                        className="orbital-modal-backdrop"
                        role="presentation"
                        onMouseDown={() => setShowLogin(false)}
                    >
                        <form
                            className="orbital-modal"
                            onSubmit={login}
                            onMouseDown={(event) => event.stopPropagation()}
                        >
                            <span className="orbital-kicker">WRITE ACCESS</span>
                            <h2>Sign in</h2>
                            <input
                                aria-label="Username"
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                                maxLength={32}
                                required
                            />
                            <input
                                aria-label="Password"
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                maxLength={128}
                                required
                            />
                            {error && <p role="alert">{error}</p>}
                            <button type="submit" className="orbital-primary">Sign in</button>
                        </form>
                    </div>
                )}

                {activeSection === "Account" ? (
                    <section className="orbital-panel orbital-account-panel">
                        <div>
                            <span className="orbital-kicker">ACCOUNT & SETTINGS</span>
                            <h2>{user?.username ?? "Guest account"}</h2>
                            <p>
                                {user
                                    ? "Signed-in actions follow your server permissions."
                                    : "Read-only browsing is available. Sign in for write actions."}
                            </p>
                        </div>
                        {user ? (
                            <button type="button" className="orbital-secondary" onClick={() => void logout()}>
                                Sign out
                            </button>
                        ) : (
                            <button type="button" className="orbital-primary" onClick={() => setShowLogin(true)}>
                                Sign in
                            </button>
                        )}
                    </section>
                ) : activeSection === "Home" ? (
                    <section className="orbital-home">
                        <article className="orbital-home-status">
                            <div className="orbital-status-icon"><Server size={18} /></div>
                            <div>
                                <span>Orbital server</span>
                                <strong>{serverOnline ? "Online" : "Unavailable"}</strong>
                            </div>
                            <span className={serverOnline ? "orbital-status-dot online" : "orbital-status-dot"} />
                        </article>
                        <div className="orbital-home-grid">
                            {[
                                { label: "Files", description: "Browse your folders and documents", icon: Files },
                                { label: "Media Library", description: "Open supported media by file", icon: Library },
                                { label: "Recent", description: "Return to recently opened files", icon: Clock3 },
                                { label: "Favorites", description: "Open your locally pinned files", icon: Heart },
                            ].map((item) => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        type="button"
                                        key={item.label}
                                        className="orbital-home-card"
                                        onClick={() => setActiveSection(item.label as ClientSection)}
                                    >
                                        <Icon size={20} />
                                        <strong>{item.label}</strong>
                                        <span>{item.description}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                ) : (
                    <DirectoryExplorer
                        readOnly={!user}
                        section={activeSection}
                        initialPath={localStorage.getItem("orbital.folder") ?? ""}
                    />
                )}
            </section>
        </main>
    );
}
