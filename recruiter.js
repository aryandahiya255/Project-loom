const candidateGrid = document.querySelector("#candidate-grid");
const blindEvaluationToggle = document.querySelector("#blind-evaluation");
const blindEvaluationStatus = document.querySelector("#blind-evaluation-status");
const recruiterAuthArea = document.querySelector("#recruiter-auth-area");
const recruiterAuthDialog = document.querySelector("#recruiter-auth-dialog");
const recruiterAuthClose = document.querySelector("#recruiter-auth-close");
const recruiterSignupForm = document.querySelector("#recruiter-signup-panel");
const recruiterSigninForm = document.querySelector("#recruiter-signin-panel");
const recruiterSignupTab = document.querySelector("#recruiter-signup-tab");
const recruiterSigninTab = document.querySelector("#recruiter-signin-tab");
const recruiterSignupMessage = document.querySelector("#recruiter-signup-message");
const recruiterSigninMessage = document.querySelector("#recruiter-signin-message");
const inviteDialog = document.querySelector("#invite-dialog");
const inviteForm = document.querySelector("#invite-form");
const inviteTitle = document.querySelector("#invite-dialog-title");
const inviteStatus = document.querySelector("#invite-message-status");
const recruiterToast = document.querySelector("#recruiter-toast");
const RECRUITER_TOKEN_KEY = "recruiter_token";
let latestRequestId = 0;
let activeCandidateId = null;
let recruiterAuthReturnFocus = null;
let recruiterToastTimer = null;

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

function renderScores(scores) {
  const section = createElement("section", "candidate-section");
  section.append(createElement("h3", "candidate-section-title", "Verified assessments"));

  const list = createElement("ul", "assessment-scores");
  if (!scores.length) {
    list.append(createElement("li", "assessment-score", "No verified assessments yet."));
  }
  scores.forEach((result) => {
    const item = createElement("li", "assessment-score");
    const assessmentName = createElement("span", "", result.test_name);
    const score = createElement("strong", "score-value", `${result.score}%`);
    const verification = createElement("span", "verified-mark", "✓ Verified");
    item.append(assessmentName, score, verification);
    list.append(item);
  });

  section.append(list);
  return section;
}

function renderTechStack(skills) {
  const section = createElement("section", "candidate-section");
  section.append(createElement("h3", "candidate-section-title", "Technical skills"));

  const list = createElement("ul", "tech-list");
  if (!skills.length) {
    list.append(createElement("li", "tech-chip", "No skills listed"));
  }
  skills.forEach((technology) => {
    list.append(createElement("li", "tech-chip", technology));
  });

  section.append(list);
  return section;
}

function renderRepositories(repositories) {
  const section = createElement("section", "candidate-section");
  section.append(createElement("h3", "candidate-section-title", "Proof-of-work repositories"));

  const list = createElement("ul", "repository-list");
  if (!repositories.length) {
    list.append(createElement("li", "", "No repositories listed."));
  }
  repositories.forEach((repository) => {
    const item = createElement("li", "");
    let url;
    try {
      url = new URL(repository);
    } catch {
      item.textContent = repository;
      list.append(item);
      return;
    }

    if (url.protocol === "https:" && url.hostname === "github.com") {
      const link = createElement("a", "", repository);
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      item.append(link);
    } else {
      item.textContent = repository;
    }
    list.append(item);
  });

  section.append(list);
  return section;
}

function renderCandidate(candidate, index, blindMode) {
  const card = createElement("article", "candidate-card");
  const header = createElement("header", "candidate-header");
  const identity = createElement("div", "candidate-identity");

  if (blindMode) {
    identity.append(
      createElement("span", "candidate-overline", "Blind profile"),
      createElement("h2", "candidate-name", `Candidate ${String(index + 1).padStart(2, "0")}`)
    );
    header.append(createElement("div", "anonymous-avatar", "A"), identity);
  } else {
    identity.append(
      createElement("span", "candidate-overline", `Candidate #${candidate.id}`),
      createElement("h2", "candidate-name", candidate.name)
    );
    header.append(createElement("div", "anonymous-avatar", "C"), identity);
    if (candidate.bio) {
      card.append(createElement("p", "candidate-bio", candidate.bio));
    }
  }

  card.prepend(header);
  card.append(
    renderScores(candidate.verified_scores),
    renderTechStack(candidate.skills),
    renderRepositories(candidate.github_repos)
  );
  const actions = createElement("div", "candidate-card-actions");
  const inviteButton = createElement("button", "button button-primary invite-button", "Invite to Interview");
  inviteButton.type = "button";
  inviteButton.addEventListener("click", () => openInviteDialog(candidate.id));
  actions.append(inviteButton);
  card.append(actions);
  return card;
}

function renderCandidates(candidates, blindMode) {
  const cards = document.createDocumentFragment();
  candidates.forEach((candidate, index) => {
    cards.append(renderCandidate(candidate, index, blindMode));
  });

  candidateGrid.replaceChildren(cards);
  if (!candidates.length) {
    candidateGrid.append(createElement("p", "candidate-empty", "No candidates are available."));
  }

  blindEvaluationStatus.classList.remove("is-error");
  blindEvaluationStatus.textContent = blindMode
    ? "Blind evaluation is on. Candidate identity fields were omitted by the API."
    : "Blind evaluation is off. Candidate identity details are visible.";
}

async function loadCandidates() {
  const requestId = ++latestRequestId;
  const blindMode = blindEvaluationToggle.checked;
  const query = new URLSearchParams({ blind: String(blindMode) });
  candidateGrid.replaceChildren();
  candidateGrid.setAttribute("aria-busy", "true");
  blindEvaluationStatus.textContent = blindMode
    ? "Loading blind candidate profiles..."
    : "Loading candidate profiles...";

  try {
    const candidates = await window.loomApi.request(`/candidates?${query}`);
    if (requestId !== latestRequestId) {
      return;
    }
    if (!Array.isArray(candidates)) {
      throw new Error("The candidate API returned an invalid response.");
    }

    renderCandidates(candidates, blindMode);
  } catch (error) {
    if (requestId !== latestRequestId) {
      return;
    }
    candidateGrid.replaceChildren();
    blindEvaluationStatus.textContent = error instanceof Error
      ? `Could not load candidates: ${error.message}`
      : "Could not load candidates.";
    blindEvaluationStatus.classList.add("is-error");
  } finally {
    if (requestId === latestRequestId) {
      candidateGrid.setAttribute("aria-busy", "false");
    }
  }
}

blindEvaluationToggle.addEventListener("change", () => {
  blindEvaluationStatus.classList.remove("is-error");
  void loadCandidates();
});

function showRecruiterMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function showRecruiterToast(message, isError = false) {
  window.clearTimeout(recruiterToastTimer);
  recruiterToast.textContent = message;
  recruiterToast.classList.toggle("is-error", isError);
  recruiterToast.hidden = false;
  recruiterToastTimer = window.setTimeout(() => {
    recruiterToast.hidden = true;
  }, 4500);
}

function renderSignedOutRecruiter() {
  const openButton = createElement("button", "button button-primary", "Recruiter Login / Post Job");
  openButton.type = "button";
  openButton.id = "recruiter-auth-open";
  openButton.addEventListener("click", () => openRecruiterAuthDialog("signin"));
  recruiterAuthArea.replaceChildren(openButton);
}

function renderSignedInRecruiter(profile) {
  const badge = createElement(
    "span",
    "recruiter-auth-badge",
    `Recruiter: ${profile.name} | ${profile.company_name}`
  );
  const signOutButton = createElement("button", "button button-secondary recruiter-signout", "Sign out");
  signOutButton.type = "button";
  signOutButton.addEventListener("click", () => {
    window.localStorage.removeItem(RECRUITER_TOKEN_KEY);
    renderSignedOutRecruiter();
    showRecruiterToast("You have signed out.");
  });
  recruiterAuthArea.replaceChildren(badge, signOutButton);
}

async function checkRecruiterAuth() {
  const token = window.localStorage.getItem(RECRUITER_TOKEN_KEY);
  if (!token) {
    renderSignedOutRecruiter();
    return false;
  }

  try {
    const profile = await window.loomApi.request("/auth/recruiter/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!profile || typeof profile.name !== "string" || typeof profile.company_name !== "string") {
      throw new Error("The recruiter profile response was invalid.");
    }
    renderSignedInRecruiter(profile);
    return true;
  } catch (error) {
    renderSignedOutRecruiter();
    showRecruiterToast(
      error instanceof Error ? `Could not restore recruiter session: ${error.message}` : "Could not restore recruiter session.",
      true
    );
    return false;
  }
}

function activateRecruiterAuthTab(mode, moveFocus = false) {
  const isSignup = mode === "signup";
  recruiterSignupTab.classList.toggle("is-active", isSignup);
  recruiterSigninTab.classList.toggle("is-active", !isSignup);
  recruiterSignupTab.setAttribute("aria-selected", String(isSignup));
  recruiterSigninTab.setAttribute("aria-selected", String(!isSignup));
  recruiterSignupTab.tabIndex = isSignup ? 0 : -1;
  recruiterSigninTab.tabIndex = isSignup ? -1 : 0;
  recruiterSignupForm.hidden = !isSignup;
  recruiterSigninForm.hidden = isSignup;
  showRecruiterMessage(recruiterSignupMessage, "");
  showRecruiterMessage(recruiterSigninMessage, "");
  if (moveFocus) {
    (isSignup
      ? document.querySelector("#recruiter-signup-name")
      : document.querySelector("#recruiter-signin-email")).focus();
  }
}

function openRecruiterAuthDialog(mode = "signup") {
  recruiterAuthReturnFocus = document.activeElement;
  activateRecruiterAuthTab(mode);
  recruiterAuthDialog.showModal();
  (mode === "signup"
    ? document.querySelector("#recruiter-signup-name")
    : document.querySelector("#recruiter-signin-email")).focus();
}

function openInviteDialog(candidateId) {
  if (!window.localStorage.getItem(RECRUITER_TOKEN_KEY)) {
    openRecruiterAuthDialog("signin");
    showRecruiterMessage(recruiterSigninMessage, "Sign in to send an interview request.", true);
    return;
  }

  activeCandidateId = candidateId;
  inviteTitle.textContent = `Send Interview Request to Candidate #${candidateId}`;
  inviteForm.reset();
  showRecruiterMessage(inviteStatus, "");
  inviteDialog.showModal();
  document.querySelector("#invite-job-title").focus();
}

recruiterSignupTab.addEventListener("click", () => activateRecruiterAuthTab("signup"));
recruiterSigninTab.addEventListener("click", () => activateRecruiterAuthTab("signin"));
[recruiterSignupTab, recruiterSigninTab].forEach((tab) => {
  tab.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const mode = event.key === "Home"
        ? "signup"
        : event.key === "End"
          ? "signin"
          : tab === recruiterSignupTab
            ? "signin"
            : "signup";
      activateRecruiterAuthTab(mode, true);
    }
  });
});

recruiterAuthClose.addEventListener("click", () => recruiterAuthDialog.close());
recruiterAuthDialog.addEventListener("click", (event) => {
  if (event.target === recruiterAuthDialog) {
    recruiterAuthDialog.close();
  }
});
recruiterAuthDialog.addEventListener("close", () => {
  if (recruiterAuthReturnFocus instanceof HTMLElement) {
    recruiterAuthReturnFocus.focus();
  }
});

async function submitRecruiterAuth(form, mode) {
  const message = mode === "signup" ? recruiterSignupMessage : recruiterSigninMessage;
  const submitButton = form.querySelector('button[type="submit"]');
  showRecruiterMessage(message, "");
  submitButton.disabled = true;

  try {
    const values = new FormData(form);
    const workEmail = String(values.get("work_email")).trim().toLowerCase();
    const password = String(values.get("password"));
    const payload = mode === "signup"
      ? {
          name: String(values.get("name")).trim(),
          work_email: workEmail,
          password,
          company_name: String(values.get("company_name")).trim(),
          designation: String(values.get("designation")).trim(),
          company_website_url: String(values.get("company_website_url")).trim() || null
        }
      : { work_email: workEmail, password };
    const response = await window.loomApi.request(
      mode === "signup" ? "/auth/recruiter/register" : "/auth/recruiter/login",
      { method: "POST", body: payload }
    );
    if (typeof response?.access_token !== "string" || !response.access_token) {
      throw new Error("The authentication response did not contain an access token.");
    }
    window.localStorage.setItem(RECRUITER_TOKEN_KEY, response.access_token);
    const profile = await window.loomApi.request("/auth/recruiter/me", {
      headers: { Authorization: `Bearer ${response.access_token}` }
    });
    renderSignedInRecruiter(profile);
    recruiterAuthDialog.close();
    form.reset();
    showRecruiterToast(mode === "signup" ? "Recruiter profile created." : "Welcome back.");
  } catch (error) {
    showRecruiterMessage(
      message,
      error instanceof Error ? error.message : "Could not authenticate recruiter.",
      true
    );
  } finally {
    submitButton.disabled = false;
  }
}

recruiterSignupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitRecruiterAuth(recruiterSignupForm, "signup");
});
recruiterSigninForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitRecruiterAuth(recruiterSigninForm, "signin");
});

document.querySelector("#invite-close").addEventListener("click", () => inviteDialog.close());
document.querySelector("#invite-cancel").addEventListener("click", () => inviteDialog.close());
inviteDialog.addEventListener("click", (event) => {
  if (event.target === inviteDialog) {
    inviteDialog.close();
  }
});
inviteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!Number.isSafeInteger(activeCandidateId) || activeCandidateId < 1) {
    showRecruiterMessage(inviteStatus, "Select a valid candidate before sending an invite.", true);
    return;
  }

  const submitButton = inviteForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  showRecruiterMessage(inviteStatus, "");
  const values = new FormData(inviteForm);
  try {
    await window.loomApi.request("/recruiter/invite", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${window.localStorage.getItem(RECRUITER_TOKEN_KEY)}`
      },
      body: {
        candidate_id: activeCandidateId,
        job_title: String(values.get("job_title")).trim(),
        message: String(values.get("message")).trim()
      }
    });
    const candidateId = activeCandidateId;
    inviteDialog.close();
    inviteForm.reset();
    showRecruiterToast(`Interview request sent to Candidate #${candidateId}.`);
  } catch (error) {
    showRecruiterMessage(
      inviteStatus,
      error instanceof Error ? error.message : "Could not send this interview request.",
      true
    );
  } finally {
    submitButton.disabled = false;
  }
});

void checkRecruiterAuth();
void loadCandidates();
