const chatTrigger = document.querySelector("#ai-chat-trigger");
const chatDrawer = document.querySelector("#ai-chat-drawer");
const chatCloseButton = document.querySelector("#ai-chat-close");
const chatMessages = document.querySelector("#chat-messages");
const chatContext = document.querySelector("#ai-chat-context");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const chatSendButton = document.querySelector("#chat-send");
const chatSpinner = document.querySelector("#chat-spinner");
const chatPromptButtons = Array.from(document.querySelectorAll("[data-chat-prompt]"));
const ATS_RESULT_KEY = "analysis-json";
const CHAT_HISTORY_LIMIT = 40;
let chatHistory = [];
let chatRequestInFlight = false;

function readCareerContext() {
  const context = {};
  const targetRole = sessionStorage.getItem("loom_target_role")
    || document.querySelector(".ats-results .section-count")?.textContent.trim();
  if (targetRole) {
    context.target_role = targetRole;
  }

  const hasCandidateAnalysis = sessionStorage.getItem("loom_ats_candidate_id")
    === String(window.loomApi.candidateId);
  const analysisText = hasCandidateAnalysis
    ? document.querySelector(`#${ATS_RESULT_KEY}`)?.textContent.trim()
    : "";
  if (analysisText && analysisText !== "No analysis yet.") {
    try {
      const analysis = JSON.parse(analysisText);
      if (typeof analysis.ats_score === "number" && Number.isFinite(analysis.ats_score)) {
        context.ats_score = analysis.ats_score;
      }
      if (Array.isArray(analysis.missing_skills)) {
        context.missing_skills = analysis.missing_skills.filter(
          (skill) => typeof skill === "string" && skill.trim()
        );
      }
    } catch {
      // The ATS panel may still contain its initial placeholder or an invalid response.
    }
  }
  return context;
}

function updateChatContext(context = readCareerContext()) {
  const details = [];
  if (context.target_role) {
    details.push(context.target_role);
  }
  details.push(
    typeof context.ats_score === "number"
      ? `ATS: ${context.ats_score}%`
      : "ATS: not analyzed"
  );
  chatContext.textContent = `Context: ${details.join(" | ")}`;
}

function toggleChatDrawer(forceOpen) {
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : chatDrawer.hidden;
  chatDrawer.hidden = !shouldOpen;
  chatTrigger.setAttribute("aria-expanded", String(shouldOpen));
  if (shouldOpen) {
    updateChatContext();
    chatInput.focus();
  } else {
    chatTrigger.focus();
  }
}

function appendChatMessage(role, content, isError = false) {
  const message = document.createElement("article");
  message.className = `ai-chat-message ${role === "user" ? "is-user" : "is-model"}${isError ? " is-error" : ""}`;
  const speaker = document.createElement("span");
  speaker.className = "ai-chat-speaker";
  speaker.textContent = isError
    ? "Notice"
    : role === "user"
      ? "You"
      : "Loom AI Assistant";
  const text = document.createElement("p");
  text.textContent = content;
  message.append(speaker, text);
  chatMessages.append(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function setChatBusy(isBusy) {
  chatRequestInFlight = isBusy;
  chatInput.disabled = isBusy;
  chatSendButton.disabled = isBusy;
  chatSpinner.hidden = !isBusy;
  chatPromptButtons.forEach((button) => {
    button.disabled = isBusy;
  });
}

async function sendChatMessage(userText) {
  const message = userText.trim();
  if (!message || chatRequestInFlight) {
    return;
  }

  appendChatMessage("user", message);
  chatInput.value = "";
  const accessToken = sessionStorage.getItem("loom_access_token");
  if (!accessToken) {
    appendChatMessage("model", "Sign in to your student account to use the AI Career Coach.", true);
    return;
  }

  const context = readCareerContext();
  updateChatContext(context);
  const history = chatHistory.slice(-CHAT_HISTORY_LIMIT);
  setChatBusy(true);
  try {
    const response = await window.loomApi.request("/chat/career-advisor", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { message, history, context }
    });
    if (!response || typeof response.reply !== "string" || !response.reply.trim()) {
      throw new Error("The career advisor returned an invalid response.");
    }

    const reply = response.reply.trim();
    chatHistory = [
      ...history,
      { role: "user", content: message },
      { role: "model", content: reply }
    ].slice(-CHAT_HISTORY_LIMIT);
    appendChatMessage("model", reply);
  } catch (error) {
    appendChatMessage(
      "model",
      error instanceof Error
        ? `I couldn't get a response: ${error.message}`
        : "I couldn't get a response. Please try again.",
      true
    );
  } finally {
    setChatBusy(false);
    chatInput.focus();
  }
}

chatTrigger.addEventListener("click", () => toggleChatDrawer());
chatCloseButton.addEventListener("click", () => toggleChatDrawer(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !chatDrawer.hidden) {
    toggleChatDrawer(false);
  }
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void sendChatMessage(chatInput.value);
});

chatPromptButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const prompt = button.dataset.chatPrompt;
    if (!prompt) {
      return;
    }
    chatInput.value = prompt;
    void sendChatMessage(prompt);
  });
});

window.addEventListener("loom:candidate-account-changed", () => {
  chatHistory = [];
  chatMessages.querySelectorAll(".ai-chat-message:not(.is-welcome)").forEach((message) => {
    message.remove();
  });
  updateChatContext();
});

const chatAnalysisJson = document.querySelector(`#${ATS_RESULT_KEY}`);
if (chatAnalysisJson) {
  new MutationObserver(() => updateChatContext()).observe(chatAnalysisJson, {
    childList: true,
    characterData: true,
    subtree: true
  });
}

updateChatContext();
