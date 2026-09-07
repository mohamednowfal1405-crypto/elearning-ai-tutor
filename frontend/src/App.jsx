import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";

const API_URL = "http://127.0.0.1:8000";

function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Upload-related state
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploading, setUploading] = useState(false);

  // Active document (the one we're tutoring on) + chat state
  const [activeDocument, setActiveDocument] = useState(null); // { id, filename }
  const [chatMessages, setChatMessages] = useState([]); // { role: "user" | "tutor", text }
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Auto-scroll to the latest chat message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

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
    setActiveDocument(null);
    setChatMessages([]);
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
          `Success! "${data.filename}" is ready (${data.chunks_created} chunks indexed).`
        );
        setSelectedFile(null);

        // Set this as the active document and reset the chat for it
        setActiveDocument({ id: data.document_id, filename: data.filename });
        setChatMessages([
          {
            role: "tutor",
            text: `I've read through "${data.filename}". Ask me anything about it!`,
          },
        ]);
      }
    } catch (err) {
      setUploadStatus(`Upload failed: could not reach the backend. Is it running?`);
    }

    setUploading(false);
  }

  async function handleSendChatMessage(e) {
    e.preventDefault();
    const question = chatInput.trim();
    if (!question || !activeDocument) return;

    // Add the user's message to the chat immediately
    setChatMessages((prev) => [...prev, { role: "user", text: question }]);
    setChatInput("");
    setChatLoading(true);

    try {
      const params = new URLSearchParams({
        user_id: session.user.id,
        document_id: activeDocument.id,
        question: question,
      });

      const response = await fetch(`${API_URL}/chat?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        setChatMessages((prev) => [
          ...prev,
          { role: "tutor", text: `Sorry, something went wrong: ${data.detail}` },
        ]);
      } else {
        setChatMessages((prev) => [...prev, { role: "tutor", text: data.answer }]);
      }
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: "tutor", text: "Sorry, I couldn't reach the backend. Is it running?" },
      ]);
    }

    setChatLoading(false);
  }

  if (session) {
    return (
      <div style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: "600px", margin: "0 auto" }}>
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

        {activeDocument && (
          <div style={{ marginTop: "2rem" }}>
            <h2>Chat with your tutor</h2>
            <p style={{ color: "#666", fontSize: "0.9rem" }}>
              Discussing: <strong>{activeDocument.filename}</strong>
            </p>

            <div
              style={{
                border: "1px solid #ccc",
                borderRadius: "8px",
                height: "350px",
                overflowY: "auto",
                padding: "1rem",
                marginBottom: "1rem",
                backgroundColor: "#fafafa",
              }}
            >
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: "0.75rem",
                    textAlign: msg.role === "user" ? "right" : "left",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "12px",
                      maxWidth: "80%",
                      whiteSpace: "pre-wrap",
                      backgroundColor: msg.role === "user" ? "#0084ff" : "#e5e5ea",
                      color: msg.role === "user" ? "white" : "black",
                    }}
                  >
                    {msg.text}
                  </span>
                </div>
              ))}
              {chatLoading && (
                <div style={{ textAlign: "left", color: "#888", fontStyle: "italic" }}>
                  Tutor is thinking...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSendChatMessage} style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask a question about your document..."
                style={{ flex: 1, padding: "0.5rem" }}
                disabled={chatLoading}
              />
              <button type="submit" disabled={chatLoading || !chatInput.trim()}>
                Send
              </button>
            </form>
          </div>
        )}
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