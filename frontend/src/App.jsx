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
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Course-related state
  const [course, setCourse] = useState(null); // { title, lessons: [...] }
  const [generatingCourse, setGeneratingCourse] = useState(false);
  const [courseError, setCourseError] = useState("");
  const [selectedLesson, setSelectedLesson] = useState(null); // the lesson object
  const [lessonExplanation, setLessonExplanation] = useState("");
  const [loadingLesson, setLoadingLesson] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

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
    setCourse(null);
    setSelectedLesson(null);
  }

  async function handleFileUpload(e) {
    e.preventDefault();
    if (!selectedFile) {
      setUploadStatus("Please choose a PDF file first.");
      return;
    }

    setUploading(true);
    setUploadStatus("Uploading and processing...");
    setCourse(null);
    setSelectedLesson(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch(
        `${API_URL}/upload?user_id=${session.user.id}`,
        { method: "POST", body: formData }
      );
      const data = await response.json();

      if (!response.ok) {
        setUploadStatus(`Upload failed: ${data.detail}`);
      } else {
        setUploadStatus(
          `Success! "${data.filename}" is ready (${data.chunks_created} chunks indexed).`
        );
        setSelectedFile(null);
        setActiveDocument({ id: data.document_id, filename: data.filename });
        setChatMessages([
          {
            role: "tutor",
            text: `I've read through "${data.filename}". Ask me anything about it, or generate a course below!`,
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

  async function handleGenerateCourse() {
    if (!activeDocument) return;

    setGeneratingCourse(true);
    setCourseError("");
    setCourse(null);
    setSelectedLesson(null);

    try {
      const params = new URLSearchParams({
        user_id: session.user.id,
        document_id: activeDocument.id,
      });
      const response = await fetch(`${API_URL}/generate-course?${params.toString()}`, {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        setCourseError(`Course generation failed: ${data.detail}`);
      } else {
        setCourse({ title: data.title, lessons: data.lessons });
      }
    } catch (err) {
      setCourseError("Could not reach the backend. Is it running?");
    }

    setGeneratingCourse(false);
  }

  async function handleLessonClick(lesson) {
    setSelectedLesson(lesson);
    setLessonExplanation("");
    setLoadingLesson(true);

    try {
      const params = new URLSearchParams({
        user_id: session.user.id,
        document_id: activeDocument.id,
        lesson_title: lesson.title,
        lesson_summary: lesson.summary,
      });
      const response = await fetch(`${API_URL}/lesson-detail?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        setLessonExplanation(`Something went wrong: ${data.detail}`);
      } else {
        setLessonExplanation(data.explanation);
      }
    } catch (err) {
      setLessonExplanation("Could not reach the backend. Is it running?");
    }

    setLoadingLesson(false);
  }

  if (session) {
    return (
      <div style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: "700px", margin: "0 auto" }}>
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
          <>
            {/* Course generation section */}
            <div style={{ marginTop: "2rem" }}>
              <h2>Course</h2>
              {!course && (
                <button onClick={handleGenerateCourse} disabled={generatingCourse}>
                  {generatingCourse ? "Designing your course..." : "Generate Course from this document"}
                </button>
              )}
              {courseError && <p style={{ color: "red" }}>{courseError}</p>}

              {course && (
                <div style={{ display: "flex", gap: "1.5rem", marginTop: "1rem" }}>
                  {/* Lesson list */}
                  <div style={{ flex: "1" }}>
                    <h3>{course.title}</h3>
                    <ol style={{ paddingLeft: "1.2rem" }}>
                      {course.lessons.map((lesson) => (
                        <li
                          key={lesson.lesson_number}
                          onClick={() => handleLessonClick(lesson)}
                          style={{
                            cursor: "pointer",
                            marginBottom: "0.75rem",
                            padding: "0.5rem",
                            borderRadius: "6px",
                            backgroundColor:
                              selectedLesson?.lesson_number === lesson.lesson_number
                                ? "#e0f0ff"
                                : "transparent",
                          }}
                        >
                          <strong>{lesson.title}</strong>
                          <p style={{ margin: "0.25rem 0 0", fontSize: "0.9rem", color: "#555" }}>
                            {lesson.summary}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Lesson detail panel */}
                  {selectedLesson && (
                    <div
                      style={{
                        flex: "1.3",
                        border: "1px solid #ddd",
                        borderRadius: "8px",
                        padding: "1rem",
                        maxHeight: "500px",
                        overflowY: "auto",
                      }}
                    >
                      <h4>{selectedLesson.title}</h4>
                      {loadingLesson ? (
                        <p style={{ color: "#888", fontStyle: "italic" }}>Preparing your lesson...</p>
                      ) : (
                        <p style={{ whiteSpace: "pre-wrap" }}>{lessonExplanation}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Chat section */}
            <div style={{ marginTop: "2.5rem" }}>
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
          </>
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