import { useEffect, useState, type FormEvent } from "react";
import FileManager from "./components/FileManager";
import "./App.css";

interface AuthUser {
    username: string;
    role: "admin" | "user";
}

export default function ClientApp() {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [showLogin, setShowLogin] = useState(false);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
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

    return (
        <main className="dashboard">
            <section className="main-content" style={{ marginLeft: 0 }}>
                <header className="topbar">
                    <div>
                        <small>HOMEHUB</small>
                        <h1>Library</h1>
                    </div>
                    {user ? (
                        <div className="connection">
                            <span>{user.username}</span>
                            <button className="fm-button" onClick={() => void logout()}>Logout</button>
                        </div>
                    ) : (
                        <button className="fm-button fm-primary" onClick={() => setShowLogin(true)}>
                            Login
                        </button>
                    )}
                </header>

                {showLogin && (
                    <section className="welcome" style={{ maxWidth: 520 }}>
                        <form onSubmit={login}>
                            <span className="eyebrow">WRITE ACCESS</span>
                            <h2>Sign in</h2>
                            <input aria-label="Username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={32} required />
                            <input aria-label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} required />
                            {error && <p role="alert">{error}</p>}
                            <button className="fm-button fm-primary" type="submit">Sign in</button>
                            <button className="fm-button" type="button" onClick={() => setShowLogin(false)}>Cancel</button>
                        </form>
                    </section>
                )}

                <FileManager readOnly={!user} />
            </section>
        </main>
    );
}
