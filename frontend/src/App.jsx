import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Check if user is already logged in when the app loads,
  // and keep listening for login/logout changes.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSignUp(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setMessage(`Signup failed: ${error.message}`);
    } else {
      setMessage("Signup successful! Check your email to confirm your account.");
    }
    setLoading(false);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(`Login failed: ${error.message}`);
    }
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  // If logged in, show a simple dashboard
  if (session) {
    return (
      <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
        <h1>E-Learning AI Tutor</h1>
        <p>Logged in as: <strong>{session.user.email}</strong></p>
        <button onClick={handleLogout}>Log Out</button>
      </div>
    );
  }

  // Otherwise, show the login/signup form
  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: "400px" }}>
      <h1>E-Learning AI Tutor</h1>
      <form>
        <div style={{ marginBottom: "1rem" }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: "0.5rem" }}
            required
          />
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <input
            type="password"
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: "0.5rem" }}
            required
          />
        </div>
        <button onClick={handleLogin} disabled={loading} style={{ marginRight: "0.5rem" }}>
          Log In
        </button>
        <button onClick={handleSignUp} disabled={loading}>
          Sign Up
        </button>
      </form>
      {message && <p style={{ marginTop: "1rem" }}>{message}</p>}
    </div>
  );
}

export default App;