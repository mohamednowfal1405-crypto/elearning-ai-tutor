import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const API_URL = "http://127.0.0.1:8000";

function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploading, setUploading] = useState(false);

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

  async function handleFileUpload(e) {
    e.preventDefault();
    if (!selectedFile) {
      setUploadStatus("Please choose a PDF file first.");
      return;
    }

    setUploading(true);
    setUploadStatus("Uploading and processing...");

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch(
        `${API_URL}/upload?user_id=${session.user.id}`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setUploadStatus(`Upload failed: ${data.detail}`);
      } else {
        setUploadStatus(
          `Success! "${data.filename}" uploaded (${data.text_length} characters extracted).`
        );
        setSelectedFile(null);
      }
    } catch (err) {
      setUploadStatus(`Upload failed: could not reach the backend. Is it running?`);
    }

    setUploading(false);
  }

  if (session) {
    return (
      <div style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: "500px" }}>
        <h1>E-Learning AI Tutor</h1>
        <p>Logged in as: <strong>{session.user.email}</strong></p>
        <button onClick={handleLogout} style={{ marginBottom: "2rem" }}>Log Out</button>

        <h2>Upload your notes (PDF)</h2>
        <form onSubmit={handleFileUpload}>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setSelectedFile(e.target.files[0])}
            style={{ marginBottom: "1rem", display: "block" }}
          />
          <button type="submit" disabled={uploading}>
            {uploading ? "Uploading..." : "Upload PDF"}
          </button>
        </form>
        {uploadStatus && <p style={{ marginTop: "1rem" }}>{uploadStatus}</p>}
      </div>
    );
  }

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