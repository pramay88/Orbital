import { useCallback, useEffect, useState, type ReactNode } from "react";

interface AuthUser {
    id: string;
    username: string;
    role: "admin" | "user";
}

export default function AuthGate({
    children,
    requiredRole,
}: {
    children: ReactNode;
    requiredRole: "admin" | "user";
}) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [setupRequired, setSetupRequired] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    const refresh = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const statusResponse = await fetch("/api/auth/setup/status");
            const status = await statusResponse.json();
            setSetupRequired(Boolean(status.setupRequired));

            const meResponse = await fetch("/api/auth/me");
            if (meResponse.ok) {
                const result = await meResponse.json();
                setUser(result.user as AuthUser);
            } else {
                setUser(null);
            }
        } catch {
            setError("Unable to reach HomeHub");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void refresh();
        }, 0);

        return () => window.clearTimeout(timer);
    }, [refresh]);

    const submitSetup = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");

        const response = await fetch("/api/auth/setup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });

        if (!response.ok) {
            const result = await response.json().catch(() => null);
            setError(result?.error ?? "Setup failed");
            return;
        }

        setPassword("");
        await refresh();
    };

    const submitLogin = async (event: React.FormEvent) => {
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

        await refresh();
    };

    if (loading) {
        return <main className="dashboard"><p className="empty-state">Connecting...</p></main>;
    }

    if (setupRequired) {
        return (
            <main className="dashboard">
                <section className="welcome" style={{ margin: "10vh auto", maxWidth: 520 }}>
                    <form onSubmit={submitSetup}>
                        <span className="eyebrow">INITIAL SETUP</span>
                        <h2>Create the administrator</h2>
                        <input aria-label="Username" value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} maxLength={32} required />
                        <input aria-label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} maxLength={128} required />
                        {error && <p role="alert">{error}</p>}
                        <button className="fm-button fm-primary" type="submit">Create administrator</button>
                    </form>
                </section>
            </main>
        );
    }

    if (!user) {
        return (
            <main className="dashboard">
                <section className="welcome" style={{ margin: "10vh auto", maxWidth: 520 }}>
                    <form onSubmit={submitLogin}>
                        <span className="eyebrow">HOMEHUB</span>
                        <h2>Sign in</h2>
                        <input aria-label="Username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={32} required />
                        <input aria-label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} required />
                        {error && <p role="alert">{error}</p>}
                        <button className="fm-button fm-primary" type="submit">Sign in</button>
                    </form>
                </section>
            </main>
        );
    }

    if (requiredRole === "admin" && user.role !== "admin") {
        return <main className="dashboard"><p role="alert">Administrator access required.</p></main>;
    }

    return <>{children}</>;
}
