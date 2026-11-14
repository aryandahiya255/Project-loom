let quizQuestions = [];
const quizDurationMs = 10 * 60 * 1000;
const attemptStorageKey = "loom.student.backendQuizAttempt";
const backendBadgeName = "Verified Backend";
const assessmentTestId = "backend-fundamentals";
const assessmentTestName = "REST APIs and database structures";

const quizForm = document.querySelector("#quiz-form");
const questionList = document.querySelector("#question-list");
const timerDisplay = document.querySelector("#quiz-timer");
const questionCountDisplay = document.querySelector(".question-count");
const assessmentMessage = document.querySelector("#assessment-message");
const startButton = document.querySelector("#start-quiz");
const submitButton = document.querySelector("#submit-quiz");
const resultPanel = document.querySelector("#quiz-result");

let deadline = null;
let timerInterval = null;
let quizStarted = false;
let quizSubmitted = false;
let completedResult = null;

async function loadQuizQuestions() {
  const questions = await window.loomApi.request(
    `/assessments/questions?test_id=${encodeURIComponent(assessmentTestId)}`
  );
  if (
    !Array.isArray(questions)
    || questions.length === 0
    || questions.some((question) => (
      !question
      || typeof question.question !== "string"
      || !Array.isArray(question.options)
      || question.options.length < 2
      || question.options.some((option) => typeof option !== "string")
      || !Number.isInteger(question.answer)
      || question.answer < 0
      || question.answer >= question.options.length
    ))
  ) {
    throw new Error("The assessment API returned invalid questions.");
  }
  return questions;
}

function renderQuestions() {
  const fragment = document.createDocumentFragment();

  quizQuestions.forEach((question, questionIndex) => {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "quiz-question";
    fieldset.disabled = true;

    const legend = document.createElement("legend");
    legend.textContent = `${String(questionIndex + 1).padStart(2, "0")}  ${question.question}`;
    fieldset.append(legend);

    question.options.forEach((option, optionIndex) => {
      const label = document.createElement("label");
      label.className = "quiz-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `question-${questionIndex}`;
      input.value = String(optionIndex);
      const text = document.createElement("span");
      text.textContent = option;
      label.append(input, text);
      fieldset.append(label);
    });

    fragment.append(fieldset);
  });

  questionList.replaceChildren(fragment);
}

function formatTime(milliseconds) {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function collectAnswers() {
  return quizQuestions.map((question, index) => {
    const selected = quizForm.querySelector(`input[name="question-${index}"]:checked`);
    return selected ? Number(selected.value) : null;
  });
}

function persistAttempt() {
  try {
    sessionStorage.setItem(attemptStorageKey, JSON.stringify({
      status: quizSubmitted ? "submitted" : "active",
      deadline,
      answers: collectAnswers(),
      result: completedResult
    }));
    return true;
  } catch {
    return false;
  }
}

async function restoreAttempt() {
  let savedAttempt;
  try {
    const serializedAttempt = sessionStorage.getItem(attemptStorageKey);
    if (!serializedAttempt) {
      return;
    }

    savedAttempt = JSON.parse(serializedAttempt);
  } catch {
    assessmentMessage.textContent = "Could not restore your saved assessment. Starting a new attempt will replace it.";
    return;
  }

  if (
    !savedAttempt ||
    !Array.isArray(savedAttempt.answers) ||
    savedAttempt.answers.length !== quizQuestions.length ||
    savedAttempt.answers.some((answer, index) => (
      answer !== null && (!Number.isInteger(answer) || answer < 0 || answer >= quizQuestions[index].options.length)
    ))
  ) {
    assessmentMessage.textContent = "Saved assessment data is invalid. Start a new attempt to replace it.";
    return;
  }

  savedAttempt.answers.forEach((answer, index) => {
    if (answer !== null) {
      const input = quizForm.querySelector(`input[name="question-${index}"][value="${answer}"]`);
      input.checked = true;
    }
  });

  if (savedAttempt.status === "submitted") {
    const result = savedAttempt.result;
    if (
      !result ||
      !Number.isInteger(result.score) ||
      result.score < 0 ||
      result.score > 100 ||
      typeof result.passed !== "boolean" ||
      typeof result.badgeSaved !== "boolean" ||
      typeof result.timedOut !== "boolean"
    ) {
      assessmentMessage.textContent = "Saved assessment result is invalid. Start a new attempt to replace it.";
      return;
    }

    quizSubmitted = true;
    startButton.hidden = true;
    submitButton.disabled = true;
    questionList.querySelectorAll("fieldset").forEach((fieldset) => {
      fieldset.disabled = true;
    });
    timerDisplay.textContent = result.timedOut ? "00:00" : "Submitted";
    completedResult = result;
    renderResult(result.score, result.passed, result.badgeSaved, result.timedOut);
    assessmentMessage.textContent = "This assessment has already been submitted in this tab.";
    return;
  }

  if (savedAttempt.status !== "active" || !Number.isFinite(savedAttempt.deadline)) {
    assessmentMessage.textContent = "Saved assessment data is invalid. Start a new attempt to replace it.";
    return;
  }

  quizStarted = true;
  startButton.hidden = true;
  submitButton.disabled = false;
  questionList.querySelectorAll("fieldset").forEach((fieldset) => {
    fieldset.disabled = false;
  });
  let state;
  try {
    state = await window.loomApi.request(
      `/assessments/status?candidate_id=${window.loomApi.candidateId}&test_id=${assessmentTestId}`
    );
  } catch (error) {
    quizStarted = false;
    startButton.hidden = false;
    submitButton.disabled = true;
    questionList.querySelectorAll("fieldset").forEach((fieldset) => {
      fieldset.disabled = true;
    });
    assessmentMessage.textContent = error instanceof Error
      ? `Could not restore the server timer: ${error.message}`
      : "Could not restore the server timer.";
    return;
  }

  if (!state.active) {
    deadline = Date.now();
    void finishQuiz(true);
    return;
  }

  deadline = Date.now() + state.remaining_seconds * 1000;
  assessmentMessage.textContent = "Your timed assessment was restored from the server.";
  updateTimer();
  if (!quizSubmitted) {
    timerInterval = window.setInterval(updateTimer, 200);
  }
}

function updateTimer() {
  if (!quizStarted || quizSubmitted) {
    return;
  }

  const remaining = Math.max(0, deadline - Date.now());
  timerDisplay.textContent = formatTime(remaining);
  timerDisplay.classList.toggle("is-urgent", remaining <= 60_000);

  if (remaining === 0) {
    void finishQuiz(true);
  }
}

async function startQuiz() {
  if (quizStarted || quizSubmitted) {
    return;
  }

  startButton.disabled = true;
  assessmentMessage.textContent = "Starting your timed assessment...";
  let state;
  try {
    state = await window.loomApi.request("/assessments/start", {
      method: "POST",
      body: {
        candidate_id: window.loomApi.candidateId,
        test_id: assessmentTestId
      }
    });
  } catch (error) {
    startButton.disabled = false;
    assessmentMessage.textContent = error instanceof Error
      ? `Could not start the assessment: ${error.message}`
      : "Could not start the assessment.";
    return;
  }
  if (!state.active) {
    startButton.disabled = false;
    assessmentMessage.textContent = "This assessment session has expired. Please try again.";
    return;
  }

  quizStarted = true;
  deadline = Date.now() + Math.min(state.remaining_seconds * 1000, quizDurationMs);
  questionList.querySelectorAll("fieldset").forEach((fieldset) => {
    fieldset.disabled = false;
  });
  startButton.hidden = true;
  startButton.disabled = false;
  submitButton.disabled = false;
  assessmentMessage.textContent = persistAttempt()
    ? "Assessment in progress. The server timer continues across page refreshes."
    : "Assessment in progress. Your server timer continues, but answers could not be saved in this tab.";
  updateTimer();
  timerInterval = window.setInterval(updateTimer, 200);
}

function renderResult(score, passed, badgeSaved, timedOut) {
  resultPanel.hidden = false;
  resultPanel.className = passed ? "assessment-result is-pass" : "assessment-result is-fail";

  const heading = document.createElement("h2");
  heading.textContent = passed ? "You passed!" : "Keep building your backend skills.";
  const scoreText = document.createElement("p");
  scoreText.className = "result-score";
  scoreText.textContent = `Your score: ${score}%`;
  const detail = document.createElement("p");
  detail.textContent = timedOut
    ? "Time ran out, so your assessment was submitted automatically."
    : "Your assessment has been submitted.";

  resultPanel.replaceChildren(heading, scoreText, detail);

  if (passed && badgeSaved) {
    const badge = document.createElement("p");
    badge.className = "earned-badge";
    badge.textContent = `✓  ${backendBadgeName} badge added to your Loom profile`;
    resultPanel.append(badge);
  } else if (passed) {
    const storageError = document.createElement("p");
    storageError.className = "storage-warning";
    storageError.textContent = "You passed, but the result could not be saved to your candidate profile.";
    resultPanel.append(storageError);
  } else {
    const nextStep = document.createElement("p");
    nextStep.textContent = "Review REST methods, HTTP status codes, primary keys, and foreign keys, then try again.";
    resultPanel.append(nextStep);
  }

  const dashboardLink = document.createElement("a");
  dashboardLink.className = "result-link";
  dashboardLink.href = "student-dash.html";
  dashboardLink.textContent = "Return to student dashboard";
  resultPanel.append(dashboardLink);
}

async function finishQuiz(timedOut) {
  if (quizSubmitted) {
    return;
  }

  quizSubmitted = true;
  window.clearInterval(timerInterval);
  timerDisplay.textContent = timedOut ? "00:00" : formatTime(Math.max(0, deadline - Date.now()));
  timerDisplay.classList.toggle("is-urgent", timedOut);
  questionList.querySelectorAll("fieldset").forEach((fieldset) => {
    fieldset.disabled = true;
  });
  submitButton.disabled = true;
  startButton.hidden = true;

  const correctAnswers = quizQuestions.reduce((score, question, index) => {
    const selected = quizForm.querySelector(`input[name="question-${index}"]:checked`);
    return score + (selected && Number(selected.value) === question.answer ? 1 : 0);
  }, 0);
  const score = Math.round((correctAnswers / quizQuestions.length) * 100);
  const passed = score >= 80;
  let resultSaved = false;
  let resultSaveError = null;
  try {
    await window.loomApi.request("/assessment-scores", {
      method: "POST",
      body: {
        candidate_id: window.loomApi.candidateId,
        test_name: assessmentTestName,
        score,
        verified_status: passed
      }
    });
    resultSaved = true;
  } catch (error) {
    resultSaveError = error instanceof Error ? error.message : "Unknown API error.";
  }

  const badgeSaved = passed && resultSaved;
  completedResult = { score, passed, badgeSaved, timedOut };
  const attemptSaved = persistAttempt();
  if (resultSaveError) {
    assessmentMessage.textContent = `Assessment submitted, but the result could not be saved: ${resultSaveError}`;
  } else if (!attemptSaved) {
    assessmentMessage.textContent = "Assessment submitted, but this browser could not preserve the result in this tab.";
  } else if (timedOut) {
    assessmentMessage.textContent = "Time expired. Your answers were submitted automatically.";
  } else {
    assessmentMessage.textContent = "Assessment submitted.";
  }

  renderResult(score, passed, badgeSaved, timedOut);
}

startButton.addEventListener("click", () => {
  void startQuiz();
});

quizForm.addEventListener("change", () => {
  if (quizStarted && !quizSubmitted && !persistAttempt()) {
    assessmentMessage.textContent = "Your answer is selected, but this browser could not save the timer state.";
  }
});

quizForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!quizStarted || quizSubmitted) {
    return;
  }

  if (Date.now() >= deadline) {
    void finishQuiz(true);
  } else {
    void finishQuiz(false);
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && quizStarted && !quizSubmitted) {
    void syncServerTimer();
  }
});

async function syncServerTimer() {
  try {
    const state = await window.loomApi.request(
      `/assessments/status?candidate_id=${window.loomApi.candidateId}&test_id=${assessmentTestId}`
    );
    if (!state.active) {
      deadline = Date.now();
      void finishQuiz(true);
      return;
    }
    deadline = Date.now() + state.remaining_seconds * 1000;
    updateTimer();
  } catch (error) {
    assessmentMessage.textContent = error instanceof Error
      ? `Could not sync the server timer: ${error.message}`
      : "Could not sync the server timer.";
  }
}

async function initializeQuiz() {
  startButton.disabled = true;
  assessmentMessage.textContent = "Loading assessment questions...";
  try {
    quizQuestions = await loadQuizQuestions();
    renderQuestions();
    questionCountDisplay.textContent = `${quizQuestions.length} question${quizQuestions.length === 1 ? "" : "s"} · 10 minutes`;
    startButton.disabled = false;
    assessmentMessage.textContent = "Your timer starts when you begin. The assessment submits automatically when time runs out.";
    await restoreAttempt();
  } catch (error) {
    assessmentMessage.textContent = error instanceof Error
      ? `Could not load assessment questions: ${error.message}`
      : "Could not load assessment questions.";
    questionList.replaceChildren();
    startButton.disabled = true;
  }
}

void initializeQuiz();
