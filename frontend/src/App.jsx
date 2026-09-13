import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [activeDocument, setActiveDocument] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  const [course, setCourse] = useState(null);
  const [generatingCourse, setGeneratingCourse] = useState(false);
  const [courseError, setCourseError] = useState("");
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [lessonExplanation, setLessonExplanation] = useState("");
  const [loadingLesson, setLoadingLesson] = useState(false);

  const [quizQuestions, setQuizQuestions] = useState(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState("");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [quizScore, setQuizScore] = useState(0);

  const [lectureSlides, setLectureSlides] = useState(null);
  const [lectureLoading, setLectureLoading] = useState(false);
  const [lectureError, setLectureError] = useState("");
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lectureFinished, setLectureFinished] = useState(false);
  const [captionText, setCaptionText] = useState("");
  const [spokenWordStart, setSpokenWordStart] = useState(0);
  const [spokenWordEnd, setSpokenWordEnd] = useState(0);

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

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
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
    window.speechSynthesis.cancel();
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
      setUploadSuccess(false);
      return;
    }

    setUploading(true);
    setUploadStatus("Uploading and processing...");
    setUploadSuccess(false);
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
        setUploadSuccess(false);
      } else {
        setUploadStatus(
          `"${data.filename}" is ready — ${data.chunks_created} chunks indexed.`
        );
        setUploadSuccess(true);
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
      setUploadStatus("Upload failed: could not reach the backend. Is it running?");
      setUploadSuccess(false);
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

  function resetQuizState() {
    setQuizQuestions(null);
    setQuizError("");
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setAnswerRevealed(false);
    setQuizScore(0);
  }

  function resetLectureState() {
    window.speechSynthesis.cancel();
    setLectureSlides(null);
    setLectureError("");
    setCurrentSlideIndex(0);
    setIsPlaying(false);
    setLectureFinished(false);
    setCaptionText("");
    setSpokenWordStart(0);
    setSpokenWordEnd(0);
  }

  async function handleLessonClick(lesson) {
    setSelectedLesson(lesson);
    setLessonExplanation("");
    setLoadingLesson(true);
    resetQuizState();
    resetLectureState();

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

  async function handleStartQuiz() {
    if (!selectedLesson) return;

    resetQuizState();
    setQuizLoading(true);

    try {
      const params = new URLSearchParams({
        user_id: session.user.id,
        document_id: activeDocument.id,
        lesson_title: selectedLesson.title,
        lesson_summary: selectedLesson.summary,
      });
      const response = await fetch(`${API_URL}/lesson-quiz?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        setQuizError(`Quiz generation failed: ${data.detail}`);
      } else {
        setQuizQuestions(data.questions);
      }
    } catch (err) {
      setQuizError("Could not reach the backend. Is it running?");
    }

    setQuizLoading(false);
  }

  function handleSelectAnswer(index) {
    if (answerRevealed) return;
    setSelectedAnswer(index);
    setAnswerRevealed(true);

    const currentQuestion = quizQuestions[currentQuestionIndex];
    if (index === currentQuestion.correct_index) {
      setQuizScore((prev) => prev + 1);
    }
  }

  function handleNextQuestion() {
    setSelectedAnswer(null);
    setAnswerRevealed(false);
    setCurrentQuestionIndex((prev) => prev + 1);
  }

  async function handleStartLecture() {
    if (!selectedLesson) return;

    resetLectureState();
    setLectureLoading(true);

    try {
      const params = new URLSearchParams({
        user_id: session.user.id,
        document_id: activeDocument.id,
        lesson_title: selectedLesson.title,
        lesson_summary: selectedLesson.summary,
      });
      const response = await fetch(`${API_URL}/lecture-script?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        setLectureError(`Lecture generation failed: ${data.detail}`);
      } else {
        setLectureSlides(data.slides);
      }
    } catch (err) {
      setLectureError("Could not reach the backend. Is it running?");
    }

    setLectureLoading(false);
  }

  function speakSlide(index, slides) {
    window.speechSynthesis.cancel();

    if (index >= slides.length) {
      setIsPlaying(false);
      setLectureFinished(true);
      setCaptionText("");
      return;
    }

    const narration = slides[index].narration;
    setCaptionText(narration);
    setSpokenWordStart(0);
    setSpokenWordEnd(0);

    const utterance = new SpeechSynthesisUtterance(narration);
    utterance.rate = 1;

    utterance.onboundary = (event) => {
      if (event.name === "word" || event.charIndex !== undefined) {
        const start = event.charIndex;
        const rest = narration.slice(start);
        const match = rest.match(/^\S+/);
        const wordLength = match ? match[0].length : 0;
        setSpokenWordStart(start);
        setSpokenWordEnd(start + wordLength);
      }
    };

    utterance.onend = () => {
      setCurrentSlideIndex((prevIndex) => {
        const nextIndex = prevIndex + 1;
        speakSlide(nextIndex, slides);
        return nextIndex;
      });
    };

    window.speechSynthesis.speak(utterance);
  }

  function handlePlayLecture() {
    if (!lectureSlides) return;
    setIsPlaying(true);
    setLectureFinished(false);
    speakSlide(currentSlideIndex, lectureSlides);
  }

  function handlePauseLecture() {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
  }

  function handleReplayLecture() {
    setCurrentSlideIndex(0);
    setLectureFinished(false);
    setIsPlaying(true);
    speakSlide(0, lectureSlides);
  }

  if (session) {
    const currentQuestion =
      quizQuestions && currentQuestionIndex < quizQuestions.length
        ? quizQuestions[currentQuestionIndex]
        : null;
    const quizFinished = quizQuestions && currentQuestionIndex >= quizQuestions.length;
    const currentSlide =
      lectureSlides && currentSlideIndex < lectureSlides.length
        ? lectureSlides[currentSlideIndex]
        : null;

    return (
      <div className="app-shell">
        <div className="dashboard">
          <h1 className="app-title">E-Learning AI Tutor</h1>
          <p className="session-line">
            Logged in as <strong>{session.user.email}</strong>
          </p>
          <button className="secondary" onClick={handleLogout} style={{ marginBottom: "2rem" }}>
            Log Out
          </button>

          <div className="upload-block">
            <h2 className="section-title">Upload your notes</h2>
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
            {uploadStatus && (
              <p className={`upload-status ${uploadSuccess ? "success" : ""}`}>{uploadStatus}</p>
            )}
          </div>

          {activeDocument && (
            <>
              <div className="course-block">
                <h2 className="section-title">Course</h2>
                {!course && (
                  <button onClick={handleGenerateCourse} disabled={generatingCourse}>
                    {generatingCourse ? "Designing your course..." : "Generate Course from this document"}
                  </button>
                )}
                {courseError && <p className="error-text">{courseError}</p>}

                {course && (
                  <div className="course-columns">
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontFamily: "Fraunces, serif", marginTop: 0 }}>{course.title}</h3>
                      <ul className="lesson-list">
                        {course.lessons.map((lesson) => (
                          <li
                            key={lesson.lesson_number}
                            onClick={() => handleLessonClick(lesson)}
                            className={`lesson-item ${
                              selectedLesson?.lesson_number === lesson.lesson_number ? "selected" : ""
                            }`}
                          >
                            <p className="lesson-item-title">{lesson.title}</p>
                            <p className="lesson-item-summary">{lesson.summary}</p>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {selectedLesson && (
                      <div className="lesson-panel">
                        <h4>{selectedLesson.title}</h4>

                        {loadingLesson ? (
                          <p className="muted-italic">Preparing your lesson...</p>
                        ) : (
                          <p className="lesson-panel-text">{lessonExplanation}</p>
                        )}

                        {!loadingLesson && (
                          <>
                            <div className="quiz-block">
                              {!lectureSlides && !lectureLoading && (
                                <button className="secondary" onClick={handleStartLecture}>
                                  Start AI Lecture
                                </button>
                              )}
                              {lectureLoading && (
                                <p className="muted-italic">Preparing your lecture...</p>
                              )}
                              {lectureError && <p className="error-text">{lectureError}</p>}

                              {currentSlide && (
                                <div className="lecture-slide">
                                  <p className="quiz-progress">
                                    Slide {currentSlideIndex + 1} of {lectureSlides.length}
                                  </p>
                                  <h5 className="lecture-slide-title">{currentSlide.slide_title}</h5>
                                  <ul className="lecture-bullets">
                                    {currentSlide.bullets.map((bullet, i) => (
                                      <li key={i}>{bullet}</li>
                                    ))}
                                  </ul>

                                  {captionText && (
                                    <p className="lecture-caption">
                                      {captionText.slice(0, spokenWordStart)}
                                      <span className="caption-highlight">
                                        {captionText.slice(spokenWordStart, spokenWordEnd)}
                                      </span>
                                      {captionText.slice(spokenWordEnd)}
                                    </p>
                                  )}

                                  <div className="lecture-controls">
                                    {!isPlaying ? (
                                      <button onClick={handlePlayLecture}>
                                        {currentSlideIndex === 0 ? "Play Lecture" : "Resume"}
                                      </button>
                                    ) : (
                                      <button className="secondary" onClick={handlePauseLecture}>
                                        Pause
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}

                              {lectureFinished && (
                                <div className="lecture-slide">
                                  <p className="quiz-score">Lecture complete!</p>
                                  <div className="lecture-controls">
                                    <button className="secondary" onClick={handleReplayLecture}>
                                      Replay Lecture
                                    </button>
                                    {!quizQuestions && !quizLoading && (
                                      <button onClick={handleStartQuiz}>Take the Quiz</button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="quiz-block">
                              {!quizQuestions && !quizLoading && !lectureFinished && (
                                <button className="secondary" onClick={handleStartQuiz}>
                                  Take a Quiz on this Lesson
                                </button>
                              )}
                              {quizLoading && <p className="muted-italic">Writing your quiz...</p>}
                              {quizError && <p className="error-text">{quizError}</p>}

                              {currentQuestion && (
                                <div>
                                  <p className="quiz-progress">
                                    Question {currentQuestionIndex + 1} of {quizQuestions.length}
                                  </p>
                                  <p className="quiz-question">{currentQuestion.question}</p>

                                  {currentQuestion.options.map((option, i) => {
                                    let optionClass = "quiz-option";
                                    if (answerRevealed) {
                                      optionClass += " locked";
                                      if (i === currentQuestion.correct_index) optionClass += " correct";
                                      else if (i === selectedAnswer) optionClass += " incorrect";
                                    }
                                    return (
                                      <div
                                        key={i}
                                        onClick={() => handleSelectAnswer(i)}
                                        className={optionClass}
                                      >
                                        {option}
                                      </div>
                                    );
                                  })}

                                  {answerRevealed && (
                                    <div>
                                      <p className="quiz-explanation">{currentQuestion.explanation}</p>
                                      <button onClick={handleNextQuestion}>
                                        {currentQuestionIndex + 1 < quizQuestions.length
                                          ? "Next Question"
                                          : "See Score"}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}

                              {quizFinished && (
                                <p className="quiz-score">
                                  You scored {quizScore} / {quizQuestions.length}
                                </p>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="chat-block">
                <h2 className="section-title">Chat with your tutor</h2>
                <p className="chat-subtitle">
                  Discussing: <strong>{activeDocument.filename}</strong>
                </p>

                <div className="chat-window">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`chat-row ${msg.role}`}>
                      <span className={`chat-bubble ${msg.role}`}>{msg.text}</span>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="chat-row tutor">
                      <span className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </span>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleSendChatMessage} className="chat-form">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask a question about your document..."
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
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="auth-card">
        <h1 className="app-title" style={{ fontSize: "1.6rem" }}>
          E-Learning AI Tutor
        </h1>
        <p className="session-line">Sign in to start learning from your own notes.</p>
        <form>
          <div className="auth-field">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="auth-field">
            <input
              type="password"
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="auth-actions">
            <button onClick={handleLogin} disabled={loading}>
              Log In
            </button>
            <button className="secondary" onClick={handleSignUp} disabled={loading}>
              Sign Up
            </button>
          </div>
        </form>
        {message && <p className="auth-message">{message}</p>}
      </div>
    </div>
  );
}

export default App;