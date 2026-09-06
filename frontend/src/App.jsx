import { useState, useEffect } from "react";

const API_URL = "http://127.0.0.1:8000";

function App() {
  const [backendStatus, setBackendStatus] = useState("checking...");

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => res.json())
      .then((data) => setBackendStatus(data.status))
      .catch(() => setBackendStatus("backend not reachable"));
  }, []);

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>E-Learning AI Tutor</h1>
      <p>Backend status: <strong>{backendStatus}</strong></p>
    </div>
  );
}

export default App;