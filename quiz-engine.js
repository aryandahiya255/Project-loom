const quizDurationMs = 10 * 60 * 1000;
const attemptStorageKey = "loom.student.assessmentAttempt";

const subjectGrid = document.querySelector("#subject-cards-grid");
const subjectsMessage = document.querySelector("#subjects-message");
const quizContainer = document.querySelector("#quiz-container");
const quizForm = document.querySelector("#quiz-form");
const questionList = document.querySelector("#question-list");
const timerDisplay = document.querySelector("#quiz-timer");
const questionCountDisplay = document.querySelector(".question-count");
const assessmentMessage = document.querySelector("#assessment-message");
const submitButton = document.querySelector("#submit-quiz");
const startDialog = document.querySelector("#start-assessment-dialog");
const startDialogTitle = document.querySelector("#confirm-subject-title");
const startDialogMessage = document.querySelector("#start-assessment-message");
const confirmStartButton = document.querySelector("#confirm-start-assessment");
const cancelStartButton = document.querySelector("#cancel-assessment");
const resultDialog = document.querySelector("#quiz-result-dialog");
const resultPanel = document.querySelector("#quiz-result");
const chooseAnotherButton = document.querySelector("#choose-another-assessment");

let subjects = [];
let selectedSubject = null;
let quizQuestions = [];
let deadline = null;
let timerInterval = null;
let quizStarted = false;
let quizSubmitted = false;
let submissionInProgress = false;
let pendingSubject = null;

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function isValidQuestions(questions) {
  return Array.isArray(questions)
    && questions.length > 0
    && questions.every((question) => (
      question
      && typeof question.question === "string"
      && Array.isArray(question.options)
      && question.options.length >= 2
      && question.options.every((option) => typeof option === "string")
      && !Object.prototype.hasOwnProperty.call(question, "answer")
    ));
}

function renderSubjectCards() {
  const cards = document.createDocumentFragment();
  subjects.forEach((subject) => {
    const card = createElement("article", "assessment-subject-card");
    const top = createElement("div", "assessment-subject-top");
    const icon = createElement("span", "assessment-subject-icon", subject.icon);
    icon.setAttribute("aria-hidden", "true");
    const tags = createElement("div", "assessment-subject-tags");
    tags.append(
      createElement("span", "assessment-domain-badge", "Assessment domain"),
      createElement("span", `assessment-difficulty is-${subject.difficulty.toLowerCase()}`, subject.difficulty)
    );
    top.append(icon, tags);

    const title = createElement("h3", "assessment-subject-title", subject.title);
    const description = createElement("p", "assessment-subject-description", subject.description);
    const details = createElement("div", "assessment-subject-details");
    details.append(
      createElement("span", "", `${subject.question_count} questions`),
      createElement("span", "", `${subject.duration_minutes} minutes`)
    );
    const startButton = createElement("button", "button button-primary assessment-subject-start", "Start Assessment");
    startButton.type = "button";
    startButton.addEventListener("click", () => openStartDialog(subject));
    card.append(top, title, description, details, startButton);
    cards.append(card);
  });
  subjectGrid.replaceChildren(cards);
  subjectGrid.setAttribute("aria-busy", "false");
}

function openStartDialog(subject) {
  pendingSubject = subject;
  startDialogTitle.textContent = subject.title;
  const signedIn = Boolean(sessionStorage.getItem("loom_access_token"));
  startDialogMessage.textContent = signedIn
    ? ""
    : "Sign in from your student dashboard before starting an assessment.";
  confirmStartButton.disabled = !signedIn;
  startDialog.showModal();
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

function persistAttempt(status = "active", result = null) {
  try {
    sessionStorage.setItem(attemptStorageKey, JSON.stringify({
      status,
      candidateId: window.loomApi.candidateId,
      subjectCode: selectedSubject.id,
      answers: collectAnswers(),
      result
    }));
    return true;
  } catch {
    return false;
  }
}

function restoreAnswers(answers) {
  if (
    !Array.isArray(answers)
    || answers.length !== quizQuestions.length
    || answers.some((answer, index) => (
      answer !== null
      && (!Number.isInteger(answer) || answer < 0 || answer >= quizQuestions[index].options.length)
    ))
  ) {
    return false;
  }

  answers.forEach((answer, index) => {
    if (answer !== null) {
      const input = quizForm.querySelector(`input[name="question-${index}"][value="${answer}"]`);
      input.checked = true;
    }
  });
  return true;
}

function setQuestionsDisabled(disabled) {
  questionList.querySelectorAll("fieldset").forEach((fieldset) => {
    fieldset.disabled = disabled;
  });
}

function showQuiz(subject) {
  selectedSubject = subject;
  subjectGrid.hidden = true;
  quizContainer.hidden = false;
  questionCountDisplay.textContent = `${quizQuestions.length} questions · ${subject.duration_minutes} minutes`;
}

async function loadQuestions(subjectCode) {
  const questions = await window.loomApi.request(
    `/assessments/questions?subject_code=${encodeURIComponent(subjectCode)}`
  );
  if (!isValidQuestions(questions)) {
    throw new Error("The assessment API returned invalid or exposed answer data.");
  }
  return questions;
}

async function beginAssessment(subject, savedAttempt = null) {
  confirmStartButton.disabled = true;
  startDialogMessage.textContent = "Starting your timed assessment...";
  try {
    const session = await window.loomApi.request("/assessments/start", {
      method: "POST",
      body: { subject_code: subject.id }
    });
    if (!isValidQuestions(session.questions)) {
      throw new Error("The assessment API returned invalid or exposed answer data.");
    }

    selectedSubject = subject;
    quizQuestions = session.questions;
    renderQuestions();
    showQuiz(subject);
    if (savedAttempt && !restoreAnswers(savedAttempt.answers)) {
      throw new Error("Saved assessment answers are invalid.");
    }
    if (!session.active) {
      deadline = Date.now();
      timerDisplay.textContent = "00:00";
      setQuestionsDisabled(true);
      submitButton.disabled = false;
      startDialog.close();
      quizStarted = true;
      void finishQuiz(true);
      return;
    }

    quizStarted = true;
    quizSubmitted = false;
    deadline = Date.now() + Math.min(session.remaining_seconds * 1000, quizDurationMs);
    setQuestionsDisabled(false);
    submitButton.disabled = false;
    submitButton.textContent = "Submit assessment ↗";
    timerDisplay.textContent = formatTime(deadline - Date.now());
    timerDisplay.classList.remove("is-urgent");
    const progressMessage = savedAttempt
      ? "Restored your active assessment."
      : session.resumed
        ? "Resuming your existing assessment; its timer was not reset."
        : "Assessment in progress.";
    assessmentMessage.textContent = persistAttempt()
      ? `${progressMessage} Your server timer continues across page refreshes.`
      : `${progressMessage} The server timer continues, but answers could not be saved in this tab.`;
    startDialog.close();
    timerInterval = window.setInterval(updateTimer, 200);
  } catch (error) {
    startDialogMessage.textContent = error instanceof Error
      ? `Could not start the assessment: ${error.message}`
      : "Could not start the assessment.";
    confirmStartButton.disabled = false;
  }
}

function updateTimer() {
  if (!quizStarted || quizSubmitted || submissionInProgress) {
    return;
  }
  const remaining = Math.max(0, deadline - Date.now());
  timerDisplay.textContent = formatTime(remaining);
  timerDisplay.classList.toggle("is-urgent", remaining <= 60_000);
  if (remaining === 0) {
    void finishQuiz(true);
  }
}

function renderResult(result) {
  const passed = result.verified_status === true;
  resultPanel.className = passed ? "assessment-result is-pass" : "assessment-result is-fail";
  const heading = createElement(
    "h2",
    "",
    passed ? "You passed!" : "Keep building your skills."
  );
  heading.id = "quiz-result-heading";
  const scoreText = createElement("p", "result-score", `Your score: ${result.score}%`);
  const detail = createElement(
    "p",
    "",
    result.timed_out
      ? `Time ran out. You answered ${result.correct_answers} of ${result.total_questions} questions correctly.`
      : `You answered ${result.correct_answers} of ${result.total_questions} questions correctly.`
  );
  resultPanel.replaceChildren(heading, scoreText, detail);

  if (passed) {
    resultPanel.append(
      createElement(
        "p",
        "earned-badge",
        `${result.subject_title}: ${result.score}% (Verified) — added to your Loom profile.`
      )
    );
  } else {
    resultPanel.append(
      createElement("p", "", "You need 80% to earn a verified subject badge. Review the domain and try again.")
    );
  }
  resultDialog.showModal();
}

async function finishQuiz(timedOut) {
  if (quizSubmitted || submissionInProgress || !selectedSubject) {
    return;
  }
  submissionInProgress = true;
  window.clearInterval(timerInterval);
  timerDisplay.textContent = timedOut ? "00:00" : formatTime(Math.max(0, deadline - Date.now()));
  timerDisplay.classList.toggle("is-urgent", timedOut);
  setQuestionsDisabled(true);
  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";
  assessmentMessage.textContent = "Submitting your answers for secure grading...";

  try {
    const result = await window.loomApi.request("/assessments/submit", {
      method: "POST",
      body: {
        subject_code: selectedSubject.id,
        answers: collectAnswers()
      }
    });
    quizSubmitted = true;
    quizStarted = false;
    completedResult = result;
    persistAttempt("submitted", result);
    assessmentMessage.textContent = "Assessment submitted.";
    submitButton.textContent = "Assessment submitted";
    renderResult(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not submit the assessment.";
    assessmentMessage.textContent = `Could not submit your answers: ${message}`;
    submitButton.textContent = "Retry submission";
    submitButton.disabled = false;
    if (!timedOut && Date.now() < deadline) {
      setQuestionsDisabled(false);
      timerInterval = window.setInterval(updateTimer, 200);
    }
  } finally {
    submissionInProgress = false;
  }
}

function isValidSavedResult(result) {
  return result
    && Number.isInteger(result.score)
    && result.score >= 0
    && result.score <= 100
    && Number.isInteger(result.correct_answers)
    && Number.isInteger(result.total_questions)
    && typeof result.verified_status === "boolean"
    && typeof result.timed_out === "boolean"
    && typeof result.subject_title === "string";
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
    subjectsMessage.textContent = "Could not restore the saved assessment. Start a new attempt to replace it.";
    return;
  }

  if (
    !savedAttempt
    || savedAttempt.candidateId !== window.loomApi.candidateId
    || typeof savedAttempt.subjectCode !== "string"
  ) {
    sessionStorage.removeItem(attemptStorageKey);
    return;
  }
  const subject = subjects.find((item) => item.id === savedAttempt.subjectCode);
  if (!subject) {
    sessionStorage.removeItem(attemptStorageKey);
    return;
  }

  if (savedAttempt.status === "submitted") {
    if (!isValidSavedResult(savedAttempt.result)) {
      subjectsMessage.textContent = "The saved assessment result is invalid. Start a new attempt to replace it.";
      return;
    }
    selectedSubject = subject;
    subjectGrid.hidden = true;
    renderResult(savedAttempt.result);
    return;
  }
  if (savedAttempt.status !== "active" || !Array.isArray(savedAttempt.answers)) {
    subjectsMessage.textContent = "Saved assessment data is invalid. Start a new attempt to replace it.";
    return;
  }

  try {
    const state = await window.loomApi.request(
      `/assessments/status?subject_code=${encodeURIComponent(subject.id)}`
    );
    if (state.active) {
      await beginAssessment(subject, savedAttempt);
      return;
    }

    selectedSubject = subject;
    quizQuestions = await loadQuestions(subject.id);
    renderQuestions();
    showQuiz(subject);
    if (!restoreAnswers(savedAttempt.answers)) {
      throw new Error("Saved assessment answers are invalid.");
    }
    quizStarted = true;
    deadline = Date.now();
    timerDisplay.textContent = "00:00";
    setQuestionsDisabled(true);
    submitButton.disabled = false;
    void finishQuiz(true);
  } catch (error) {
    subjectsMessage.textContent = error instanceof Error
      ? `Could not restore your assessment: ${error.message}`
      : "Could not restore your assessment.";
  }
}

async function syncServerTimer() {
  if (!selectedSubject || !quizStarted || quizSubmitted) {
    return;
  }
  try {
    const state = await window.loomApi.request(
      `/assessments/status?subject_code=${encodeURIComponent(selectedSubject.id)}`
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

async function loadSubjects() {
  subjectGrid.setAttribute("aria-busy", "true");
  try {
    const result = await window.loomApi.request("/assessments/subjects");
    if (
      !Array.isArray(result)
      || result.length < 4
      || result.some((subject) => (
        !subject
        || typeof subject.id !== "string"
        || typeof subject.title !== "string"
        || typeof subject.icon !== "string"
        || typeof subject.description !== "string"
        || !Number.isInteger(subject.duration_minutes)
        || !Number.isInteger(subject.question_count)
        || typeof subject.difficulty !== "string"
      ))
    ) {
      throw new Error("The assessment API returned invalid domains.");
    }
    subjects = result;
    renderSubjectCards();
    subjectsMessage.textContent = sessionStorage.getItem("loom_access_token")
      ? "Choose a domain to begin. Your timer starts when the assessment does."
      : "Sign in from your student dashboard to start an assessment and save verified badges.";
    await restoreAttempt();
  } catch (error) {
    subjectGrid.setAttribute("aria-busy", "false");
    subjectsMessage.textContent = error instanceof Error
      ? `Could not load assessment domains: ${error.message}`
      : "Could not load assessment domains.";
  }
}

confirmStartButton.addEventListener("click", () => {
  if (pendingSubject) {
    void beginAssessment(pendingSubject);
  }
});

cancelStartButton.addEventListener("click", () => {
  pendingSubject = null;
  startDialog.close();
});

quizForm.addEventListener("change", () => {
  if (quizStarted && !quizSubmitted && !persistAttempt()) {
    assessmentMessage.textContent = "Your answer is selected, but this browser could not save the timer state.";
  }
});

quizForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!quizStarted || quizSubmitted || submissionInProgress) {
    return;
  }
  void finishQuiz(Date.now() >= deadline);
});

chooseAnotherButton.addEventListener("click", () => {
  resultDialog.close();
  quizContainer.hidden = true;
  subjectGrid.hidden = false;
  selectedSubject = null;
  quizQuestions = [];
  quizStarted = false;
  quizSubmitted = false;
  deadline = null;
  timerDisplay.textContent = "10:00";
  questionList.replaceChildren();
  submitButton.disabled = true;
  submitButton.textContent = "Submit assessment ↗";
  sessionStorage.removeItem(attemptStorageKey);
  subjectsMessage.textContent = "Choose another assessment domain.";
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && quizStarted && !quizSubmitted) {
    void syncServerTimer();
  }
});

void loadSubjects();
