import { useEffect, useState } from "react";
import Dashboard from "./Dashboard";
import "./App.css";

const AUTH = import.meta.env.PROD
  ? "/api/auth"
  : "http://localhost:5000/api/auth";

async function authRequest(path, options = {}) {
  const response = await fetch(`${AUTH}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Request failed.");
    error.status = response.status;
    throw error;
  }

  return result.data;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const data = await authRequest("/me");

        if (!cancelled) {
          setUser(data.user);
          setConnectionFailed(false);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setUser(null);
          setConnectionFailed(err.status !== 401);
          setError(
            err.status === 401
              ? ""
              : "Cannot connect to the server. Please retry."
          );
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    loadSession();

    return () => {
      cancelled = true;
    };
  }, [retry]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (new TextEncoder().encode(password).length > 72) {
      setError("Password must be at most 72 bytes.");
      return;
    }

    setBusy(true);

    try {
      if (mode === "register") {
        await authRequest("/register", {
          method: "POST",
          body: JSON.stringify({ name, email, password }),
        });

        setMode("login");
        setPassword("");
        setMessage("Account created. Log in with your email and password.");
      } else {
        const data = await authRequest("/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });

        setUser(data.user);
        setPassword("");
        setConnectionFailed(false);
      }
    } catch (err) {
      setError(err.message || "Unable to connect. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      await authRequest("/logout", { method: "POST" });
      setUser(null);
      setPassword("");
      setMode("login");
      setMessage("You have logged out.");
    } catch {
      setError("Logout failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setMode((current) => current === "login" ? "register" : "login");
    setPassword("");
    setError("");
    setMessage("");
  }

  if (checking) {
    return (
      <main className="auth-page">
        <p role="status">Checking your session...</p>
      </main>
    );
  }

  if (user) {
    return (
      <>
        <div className="account-bar">
          <span>
            Signed in as <strong>{user.name}</strong>
          </span>
          <button
            className="secondary"
            onClick={handleLogout}
            disabled={busy}
          >
            {busy ? "Logging out..." : "Log out"}
          </button>
        </div>

        {error && (
          <p className="error account-error" role="alert">{error}</p>
        )}

        <Dashboard key={user.id} />
      </>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-layout">
        <div className="auth-story">
          <a className="brand" href="/">
            <span className="logo">J</span>
            Jobfolio
          </a>

          <p className="eyebrow">YOUR NEXT CHAPTER</p>
          <h1>Every application.<br />One clear direction.</h1>
          <p>
            Organize opportunities, track interviews and stay on top
            of your next follow-up.
          </p>

          <div className="auth-highlights">
            <span>Application tracking</span>
            <span>Status timelines</span>
            <span>Follow-up reminders</span>
          </div>
        </div>

        <div className="auth-card">
          <p className="eyebrow">
            {mode === "login" ? "WELCOME BACK" : "GET STARTED"}
          </p>
          <h2>
            {mode === "login" ? "Log in to Jobfolio" : "Create your account"}
          </h2>
          <p className="muted">
            {mode === "login"
              ? "Your opportunities are waiting for you."
              : "Start organizing your job search today."}
          </p>

          {connectionFailed ? (
            <>
              <p className="error" role="alert">{error}</p>
              <button
                className="primary"
                onClick={() => {
                  setChecking(true);
                  setRetry((current) => current + 1);
                }}
              >
                Retry connection
              </button>
            </>
          ) : (
            <>
              <form onSubmit={handleSubmit}>
                <fieldset disabled={busy} className="auth-fields">
                  {mode === "register" && (
                    <label>
                      Full name
                      <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        autoComplete="name"
                        maxLength={100}
                        required
                      />
                    </label>
                  )}

                  <label>
                    Email address
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="username"
                      maxLength={254}
                      required
                    />
                  </label>

                  <label>
                    Password
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      minLength={mode === "register" ? 8 : undefined}
                      required
                    />
                  </label>

                  {mode === "register" && (
                    <small>Use at least 8 characters, up to 72 bytes.</small>
                  )}

                  <button className="primary" type="submit">
                    {busy
                      ? "Please wait..."
                      : mode === "login"
                        ? "Log in"
                        : "Create account"}
                  </button>
                </fieldset>
              </form>

              {error && <p className="error" role="alert">{error}</p>}
              {message && <p className="success" role="status">{message}</p>}

              <button
                className="auth-switch"
                onClick={switchMode}
                disabled={busy}
              >
                {mode === "login"
                  ? "New here? Create an account"
                  : "Already registered? Log in"}
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}