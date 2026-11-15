const githubForm = document.querySelector("#github-form");
const githubInput = document.querySelector("#github-url");
const githubMessage = document.querySelector("#github-message");
const repositoryList = document.querySelector("#repository-list");
const resumeUpload = document.querySelector("#resume-upload");
const resumeInput = document.querySelector("#resume-file");
const resumeFileName = document.querySelector("#resume-file-name");
const resumeMessage = document.querySelector("#resume-message");
const resumeTextInput = document.querySelector("#resume-text");
const resumeAnalysisForm = document.querySelector("#resume-analysis-form");
const skillBadges = document.querySelector(".skill-badges");
const skillCount = document.querySelector("#skill-count");
const profileBadgeMessage = document.querySelector("#profile-badge-message");
const incomingInvitations = document.querySelector("#incoming-invitations");
const invitationsMessage = document.querySelector("#invitations-message");
let invitationRequestId = 0;

function showMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function formatInvitationDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function createInvitationText(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function renderInvitationCard(invitation) {
  const card = createInvitationText("article", "invitation-card", "");
  const heading = document.createElement("header");
  heading.className = "invitation-card-heading";
  const company = createInvitationText("p", "invitation-company", invitation.recruiter.company_name);
  const jobTitle = createInvitationText("h3", "invitation-job-title", invitation.job_title);
  heading.append(company, jobTitle);

  const recruiter = createInvitationText(
    "p",
    "invitation-recruiter",
    `${invitation.recruiter.name} · ${invitation.recruiter.designation}`
  );
  const sentDate = createInvitationText(
    "p",
    "invitation-date",
    `Sent ${formatInvitationDate(invitation.created_at)}`
  );
  const message = createInvitationText("p", "invitation-message", invitation.message);
  card.append(heading, recruiter, sentDate, message);

  if (invitation.status === "accepted" || invitation.status === "declined") {
    const status = invitation.status === "accepted" ? "Accepted" : "Declined";
    card.append(
      createInvitationText(
        "p",
        `invitation-status is-${invitation.status}`,
        invitation.status === "accepted"
          ? "Accepted — your contact details have been shared."
          : "You declined this invitation."
      )
    );
    if (invitation.status === "accepted" && invitation.recruiter.work_email) {
      const contact = createInvitationText(
        "a",
        "invitation-contact",
        `Contact ${invitation.recruiter.name}: ${invitation.recruiter.work_email}`
      );
      contact.href = `mailto:${invitation.recruiter.work_email}`;
      card.append(contact);
    }
    return card;
  }

  const actions = document.createElement("div");
  actions.className = "invitation-actions";
  const acceptButton = createInvitationText("button", "button invitation-accept", "Accept Invite & Share Contact Info");
  acceptButton.type = "button";
  const declineButton = createInvitationText("button", "button invitation-decline", "Decline");
  declineButton.type = "button";
  acceptButton.addEventListener("click", () => {
    void respondToInvitation(invitation.id, "accepted", acceptButton);
  });
  declineButton.addEventListener("click", () => {
    void respondToInvitation(invitation.id, "declined", declineButton);
  });
  actions.append(acceptButton, declineButton);
  card.append(actions);
  return card;
}

function renderIncomingInvitations(invitations) {
  incomingInvitations.replaceChildren();
  if (!invitations.length) {
    incomingInvitations.append(
      createInvitationText("p", "invitation-empty", "You do not have any recruiter invitations yet.")
    );
    return;
  }

  const cards = document.createDocumentFragment();
  invitations.forEach((invitation) => {
    cards.append(renderInvitationCard(invitation));
  });
  incomingInvitations.append(cards);
}

async function loadIncomingInvitations() {
  const requestId = ++invitationRequestId;
  if (!sessionStorage.getItem("loom_access_token")) {
    incomingInvitations.replaceChildren(
      createInvitationText("p", "invitation-empty", "Sign in to view recruiter invitations.")
    );
    incomingInvitations.setAttribute("aria-busy", "false");
    showMessage(invitationsMessage, "");
    return false;
  }

  incomingInvitations.setAttribute("aria-busy", "true");
  showMessage(invitationsMessage, "");
  try {
    const invitations = await window.loomApi.request("/candidate/invitations");
    if (requestId !== invitationRequestId) {
      return false;
    }
    if (!Array.isArray(invitations)) {
      throw new Error("The invitation API returned an invalid response.");
    }
    renderIncomingInvitations(invitations);
    return true;
  } catch (error) {
    if (requestId === invitationRequestId) {
      incomingInvitations.replaceChildren();
      showMessage(
        invitationsMessage,
        error instanceof Error ? error.message : "Could not load recruiter invitations.",
        true
      );
    }
    return false;
  } finally {
    if (requestId === invitationRequestId) {
      incomingInvitations.setAttribute("aria-busy", "false");
    }
  }
}

async function respondToInvitation(invitationId, status, button) {
  button.disabled = true;
  showMessage(invitationsMessage, "");
  try {
    await window.loomApi.request(`/candidate/invitations/${invitationId}/respond`, {
      method: "POST",
      body: { status }
    });
    const refreshed = await loadIncomingInvitations();
    if (refreshed) {
      showMessage(
        invitationsMessage,
        status === "accepted"
          ? "Invite accepted. Your contact details are now shared."
          : "Invite declined."
      );
    }
  } catch (error) {
    showMessage(
      invitationsMessage,
      error instanceof Error ? error.message : "Could not update this invitation.",
      true
    );
    button.disabled = false;
  }
}

function renderGithubLinks(links) {
  repositoryList.replaceChildren();

  links.forEach((link) => {
    const repositoryUrl = new URL(link);
    if (repositoryUrl.protocol !== "https:" || repositoryUrl.hostname !== "github.com") {
      throw new Error("The candidate profile contains an invalid GitHub repository URL.");
    }

    const item = document.createElement("li");
    const anchor = document.createElement("a");
    anchor.href = repositoryUrl.href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = repositoryUrl.pathname.replace(/^\/|\/$/g, "");

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "repository-remove";
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", `Remove ${anchor.textContent}`);
    removeButton.addEventListener("click", async () => {
      removeButton.disabled = true;
      try {
        const query = new URLSearchParams({ github_url: link });
        const profile = await window.loomApi.request(
          `/candidates/${window.loomApi.candidateId}/github-repos?${query}`,
          { method: "DELETE" }
        );
        renderGithubLinks(profile.github_repos);
        showMessage(githubMessage, "Repository removed.");
      } catch (error) {
        removeButton.disabled = false;
        showMessage(
          githubMessage,
          error instanceof Error ? error.message : "Could not remove this repository.",
          true
        );
      }
    });

    item.append(anchor, removeButton);
    repositoryList.append(item);
  });
}

function renderProfileBadges(scores) {
  const verifiedBySubject = new Map();
  scores.forEach((score) => {
    if (
      score.verified_status === true
      && score.score >= 80
      && typeof score.subject_code === "string"
      && !verifiedBySubject.has(score.subject_code)
    ) {
      verifiedBySubject.set(score.subject_code, score);
    }
  });

  skillBadges.replaceChildren();
  verifiedBySubject.forEach((score) => {
    const badge = document.createElement("li");
    const check = document.createElement("span");
    check.className = "badge-check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = "✓";
    const label = document.createElement("span");
    label.textContent = `${score.subject_title}: ${score.score}% (Verified)`;
    badge.append(check, label);
    skillBadges.append(badge);
  });
  if (verifiedBySubject.size === 0) {
    const emptyState = document.createElement("li");
    emptyState.className = "assessment-badge-empty";
    emptyState.textContent = "Complete an assessment with 80% or higher to earn a verified subject badge.";
    skillBadges.append(emptyState);
  }
  skillCount.textContent = `${String(verifiedBySubject.size).padStart(2, "0")} verified subject${verifiedBySubject.size === 1 ? "" : "s"}`;
}

async function loadCandidateScores() {
  if (!sessionStorage.getItem("loom_access_token")) {
    renderProfileBadges([]);
    showMessage(profileBadgeMessage, "Sign in to view your verified assessment badges.");
    return;
  }
  try {
    const scores = await window.loomApi.request("/candidate/scores");
    if (!Array.isArray(scores)) {
      throw new Error("The assessment scores response was invalid.");
    }
    renderProfileBadges(scores);
    showMessage(profileBadgeMessage, "");
  } catch (error) {
    renderProfileBadges([]);
    showMessage(
      profileBadgeMessage,
      error instanceof Error ? error.message : "Could not load assessment scores.",
      true
    );
  }
}

async function loadStudentProfile() {
  try {
    const profile = await window.loomApi.request(
      `/candidates/${window.loomApi.candidateId}/profile`
    );
    if (!Array.isArray(profile.github_repos)) {
      throw new Error("The candidate profile response was invalid.");
    }
    renderGithubLinks(profile.github_repos);
    showMessage(githubMessage, "");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load the candidate profile.";
    showMessage(githubMessage, message, true);
  }
  await loadCandidateScores();
}

githubForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(githubMessage, "");

  let repositoryUrl;
  try {
    repositoryUrl = new URL(githubInput.value.trim());
  } catch {
    showMessage(githubMessage, "Enter a valid GitHub repository URL.", true);
    return;
  }

  const pathParts = repositoryUrl.pathname.split("/").filter(Boolean);
  if (
    repositoryUrl.protocol !== "https:"
    || repositoryUrl.hostname !== "github.com"
    || pathParts.length < 2
  ) {
    showMessage(githubMessage, "Use a repository URL like https://github.com/you/project.", true);
    return;
  }

  const normalizedUrl = `https://github.com/${pathParts[0]}/${pathParts[1].replace(/\.git$/i, "")}`;
  const submitButton = githubForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const profile = await window.loomApi.request(
      `/candidates/${window.loomApi.candidateId}/github-repos`,
      { method: "POST", body: { github_url: normalizedUrl } }
    );
    renderGithubLinks(profile.github_repos);
    githubInput.value = "";
    showMessage(githubMessage, "Repository saved.");
  } catch (error) {
    showMessage(
      githubMessage,
      error instanceof Error ? error.message : "Could not save this repository.",
      true
    );
  } finally {
    submitButton.disabled = false;
  }
});

async function handleResumeFile(file) {
  if (!file) {
    return;
  }

  resumeFileName.textContent = file.name;
  showMessage(resumeMessage, "");
  if (/\.pdf$|\.docx$/i.test(file.name)) {
    showMessage(resumeMessage, "Uploading resume for analysis...");
    const analysis = await window.analyzeResumeFile(file);
    showMessage(
      resumeMessage,
      analysis.ok ? "Resume analysis complete." : analysis.message,
      !analysis.ok
    );
    return;
  }

  if (!/\.txt$/i.test(file.name)) {
    showMessage(
      resumeMessage,
      "Choose a .txt, .pdf, or .docx file."
    );
    return;
  }

  try {
    const text = await file.text();
    if (!text.trim()) {
      throw new Error("The selected text file is empty.");
    }
    resumeTextInput.value = text;
    showMessage(resumeMessage, "Resume text loaded. Starting ATS analysis...");
    resumeAnalysisForm.requestSubmit();
  } catch (error) {
    showMessage(
      resumeMessage,
      error instanceof Error ? error.message : "Could not read the selected text file.",
      true
    );
  }
}

resumeInput.addEventListener("change", () => {
  void handleResumeFile(resumeInput.files[0]);
});

resumeUpload.addEventListener("click", (event) => {
  if (event.target !== resumeInput) {
    resumeInput.click();
  }
});

resumeUpload.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    resumeInput.click();
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  resumeUpload.addEventListener(eventName, (event) => {
    event.preventDefault();
    resumeUpload.classList.add("is-dragging");
  });
});

["dragleave", "dragend"].forEach((eventName) => {
  resumeUpload.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (!resumeUpload.contains(event.relatedTarget)) {
      resumeUpload.classList.remove("is-dragging");
    }
  });
});

resumeUpload.addEventListener("drop", (event) => {
  event.preventDefault();
  resumeUpload.classList.remove("is-dragging");
  void handleResumeFile(event.dataTransfer.files[0]);
});

const authDialog = document.querySelector("#auth-dialog");
const authOpenButton = document.querySelector("#auth-open");
const authCloseButton = document.querySelector("#auth-close");
const signupForm = document.querySelector("#signup-panel");
const signinForm = document.querySelector("#signin-panel");
const signupTab = document.querySelector("#signup-tab");
const signinTab = document.querySelector("#signin-tab");
const signupMessage = document.querySelector("#signup-message");
const signinMessage = document.querySelector("#signin-message");
const profileName = document.querySelector("#student-name");
const profileEmail = document.querySelector("#student-email");
const profileWelcome = document.querySelector("#student-welcome");
const profileLabel = document.querySelector("#profile-label");
const profileAvatar = document.querySelector(".profile-avatar");
const profileHeader = document.querySelector(".profile-header");
const profileStatus = document.querySelector("#profile-status");
const profileStatusIcon = profileStatus.querySelector("span");
const signOutButton = document.querySelector("#auth-sign-out");
let authReturnFocus = null;

function showAuthMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function activateAuthTab(mode, moveFocus = false) {
  const isSignup = mode === "signup";
  signupTab.classList.toggle("is-active", isSignup);
  signinTab.classList.toggle("is-active", !isSignup);
  signupTab.setAttribute("aria-selected", String(isSignup));
  signinTab.setAttribute("aria-selected", String(!isSignup));
  signupTab.tabIndex = isSignup ? 0 : -1;
  signinTab.tabIndex = isSignup ? -1 : 0;
  signupForm.hidden = !isSignup;
  signinForm.hidden = isSignup;
  showAuthMessage(signupMessage, "");
  showAuthMessage(signinMessage, "");
  if (moveFocus) {
    (isSignup ? document.querySelector("#signup-name") : document.querySelector("#signin-email")).focus();
  }
}

function renderActiveAccount(account) {
  const previousCandidateId = window.loomApi.candidateId;
  window.loomApi.setCandidateId(account.id);
  const atsCandidateId = sessionStorage.getItem("loom_ats_candidate_id");
  if (atsCandidateId && atsCandidateId !== String(account.id)) {
    sessionStorage.removeItem("loom_ats_candidate_id");
  }
  if (typeof account.target_role === "string" && account.target_role.trim()) {
    sessionStorage.setItem("loom_target_role", account.target_role.trim());
  } else {
    sessionStorage.removeItem("loom_target_role");
  }
  if (previousCandidateId !== account.id) {
    window.dispatchEvent(new Event("loom:candidate-account-changed"));
  }
  profileHeader.classList.add("is-authenticated");
  profileName.textContent = account.name;
  profileEmail.textContent = account.email;
  profileEmail.hidden = false;
  profileWelcome.hidden = true;
  profileLabel.textContent = "Active student profile";
  profileAvatar.textContent = account.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
  profileStatusIcon.textContent = "✓";
  profileStatus.lastChild.textContent = " Active profile";
  authOpenButton.hidden = true;
  signOutButton.hidden = false;
  void loadIncomingInvitations();
}

function resetActiveAccount() {
  window.loomApi.setCandidateId(Number(document.body.dataset.candidateId || "1"));
  sessionStorage.removeItem("loom_target_role");
  sessionStorage.removeItem("loom_ats_candidate_id");
  window.dispatchEvent(new Event("loom:candidate-account-changed"));
  profileHeader.classList.remove("is-authenticated");
  profileName.textContent = "Your student profile";
  profileEmail.textContent = "";
  profileEmail.hidden = true;
  profileWelcome.hidden = false;
  profileLabel.textContent = "Student profile";
  profileAvatar.textContent = "JD";
  profileStatus.lastChild.textContent = " Student portal";
  authOpenButton.hidden = false;
  signOutButton.hidden = true;
  void loadIncomingInvitations();
}

async function authenticateUser(email, password) {
  const token = await window.loomApi.request("/auth/login", {
    method: "POST",
    body: { email, password }
  });
  window.loomApi.setAccessToken(token.access_token);
  try {
    return await window.loomApi.request("/auth/me");
  } catch (error) {
    window.loomApi.setAccessToken(null);
    throw error;
  }
}

function openAuthDialog(mode = "signup") {
  authReturnFocus = document.activeElement;
  activateAuthTab(mode);
  authDialog.showModal();
  (mode === "signup"
    ? document.querySelector("#signup-name")
    : document.querySelector("#signin-email")).focus();
}

signupTab.addEventListener("click", () => activateAuthTab("signup"));
signinTab.addEventListener("click", () => activateAuthTab("signin"));

[signupTab, signinTab].forEach((tab) => {
  tab.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const mode = event.key === "Home"
        ? "signup"
        : event.key === "End"
          ? "signin"
          : tab === signupTab
            ? "signin"
            : "signup";
      activateAuthTab(mode, true);
    }
  });
});

authOpenButton.addEventListener("click", () => openAuthDialog("signup"));
authCloseButton.addEventListener("click", () => authDialog.close());
authDialog.addEventListener("click", (event) => {
  if (event.target === authDialog) {
    authDialog.close();
  }
});
authDialog.addEventListener("close", () => {
  if (authReturnFocus instanceof HTMLElement) {
    authReturnFocus.focus();
  }
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAuthMessage(signupMessage, "");
  const values = new FormData(signupForm);
  const account = {
    name: String(values.get("name")).trim(),
    email: String(values.get("email")).trim().toLowerCase(),
    password: String(values.get("password")),
    collegeName: String(values.get("school")).trim(),
    targetRole: String(values.get("role")).trim(),
    github: String(values.get("github")).trim()
  };
  if ([account.name, account.email, account.collegeName, account.targetRole, account.github].some((value) => !value)) {
    showAuthMessage(signupMessage, "Complete each profile field before continuing.", true);
    return;
  }

  const submitButton = signupForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    await window.loomApi.request("/auth/register", {
      method: "POST",
      body: {
        name: account.name,
        email: account.email,
        password: account.password,
        college_name: account.collegeName,
        target_role: account.targetRole,
        github_url: `https://github.com/${account.github}`
      }
    });
    const profile = await authenticateUser(account.email, account.password);
    renderActiveAccount(profile);
    authDialog.close();
    signupForm.reset();
    void loadStudentProfile();
  } catch (error) {
    showAuthMessage(
      signupMessage,
      error instanceof Error ? error.message : "Could not create your account.",
      true
    );
  } finally {
    submitButton.disabled = false;
  }
});

signinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAuthMessage(signinMessage, "");
  const values = new FormData(signinForm);
  const email = String(values.get("email")).trim().toLowerCase();
  const password = String(values.get("password"));
  const submitButton = signinForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const profile = await authenticateUser(email, password);
    renderActiveAccount(profile);
    authDialog.close();
    signinForm.reset();
    void loadStudentProfile();
  } catch (error) {
    showAuthMessage(
      signinMessage,
      error instanceof Error ? error.message : "Could not sign in.",
      true
    );
  } finally {
    submitButton.disabled = false;
  }
});

signOutButton.addEventListener("click", () => {
  window.loomApi.setAccessToken(null);
  resetActiveAccount();
  void loadStudentProfile();
});

async function initializeStudentDashboard() {
  if (sessionStorage.getItem("loom_access_token")) {
    try {
      const profile = await window.loomApi.request("/auth/me");
      renderActiveAccount(profile);
    } catch (error) {
      showMessage(
        profileBadgeMessage,
        error instanceof Error ? `Could not restore your session: ${error.message}` : "Could not restore your session.",
        true
      );
    }
  }
  await loadStudentProfile();
  if (!sessionStorage.getItem("loom_access_token")) {
    await loadIncomingInvitations();
  }
}

void initializeStudentDashboard();
