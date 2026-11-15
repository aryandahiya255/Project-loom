const candidateGrid = document.querySelector("#candidate-grid");
const blindEvaluationToggle = document.querySelector("#blind-evaluation");
const blindEvaluationStatus = document.querySelector("#blind-evaluation-status");
const assessmentDomainFilter = document.querySelector("#assessment-domain-filter");
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
const sentInvitationsList = document.querySelector("#sent-invitations-list");
const sentInvitationsStatus = document.querySelector("#sent-invitations-status");
const sentInvitationFilterButtons = Array.from(
  document.querySelectorAll("[data-invitation-filter]")
);
const RECRUITER_TOKEN_KEY = "recruiter_token";
let latestRequestId = 0;
let candidateRecords = [];
let currentBlindMode = false;
let latestSentInvitationsRequestId = 0;
let activeCandidateId = null;
let activeSentInvitationFilter = "all";
let sentInvitations = [];
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
    const assessmentName = createElement(
      "span",
      "assessment-subject-chip",
      result.subject_title || result.test_name
    );
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

function updateAssessmentDomainFilter(candidates) {
  const domains = new Map();
  candidates.forEach((candidate) => {
    (Array.isArray(candidate.verified_scores) ? candidate.verified_scores : []).forEach((score) => {
      if (
        score.subject_code
        && score.subject_title
        && !domains.has(score.subject_code)
      ) {
        domains.set(score.subject_code, score.subject_title);
      }
    });
  });

  const previousValue = assessmentDomainFilter.value || "all";
  const options = [createElement("option", "", "All subjects")];
  options[0].value = "all";
  [...domains.entries()]
    .sort((left, right) => left[1].localeCompare(right[1]))
    .forEach(([code, title]) => {
      const option = createElement("option", "", title);
      option.value = code;
      options.push(option);
    });
  assessmentDomainFilter.replaceChildren(...options);
  assessmentDomainFilter.disabled = domains.size === 0;
  assessmentDomainFilter.value = domains.has(previousValue) ? previousValue : "all";
}

function renderCandidateCards() {
  const selectedDomain = assessmentDomainFilter.value;
  const visibleCandidates = selectedDomain === "all"
    ? candidateRecords
    : candidateRecords.filter((candidate) => (
      Array.isArray(candidate.verified_scores)
      && candidate.verified_scores.some((score) => score.subject_code === selectedDomain)
    ));
  const cards = document.createDocumentFragment();
  visibleCandidates.forEach((candidate, index) => {
    cards.append(renderCandidate(candidate, index, currentBlindMode));
  });

  candidateGrid.replaceChildren(cards);
  if (!visibleCandidates.length) {
    candidateGrid.append(createElement(
      "p",
      "candidate-empty",
      selectedDomain === "all"
        ? "No candidates are available."
        : "No candidates have a verified assessment in this subject."
    ));
  }

  blindEvaluationStatus.classList.remove("is-error");
  blindEvaluationStatus.textContent = currentBlindMode
    ? "Blind evaluation is on. Candidate identity fields were omitted by the API."
    : "Blind evaluation is off. Candidate identity details are visible.";
}

function renderCandidates(candidates, blindMode) {
  candidateRecords = candidates;
  currentBlindMode = blindMode;
  updateAssessmentDomainFilter(candidates);
  renderCandidateCards();
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

assessmentDomainFilter.addEventListener("change", renderCandidateCards);

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

function formatInvitationDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function renderSentInvitation(invitation) {
  const isAccepted = invitation.status === "accepted";
  const candidateName = isAccepted && typeof invitation.candidate_name === "string"
    ? invitation.candidate_name
    : `Candidate #${invitation.candidate_id}`;
  const card = createElement(
    "article",
    `sent-invitation-card${isAccepted ? " is-accepted" : ""}`
  );
  const header = createElement("header", "sent-invitation-card-header");
  const identity = createElement("div", "sent-invitation-identity");
  identity.append(
    createElement("span", "candidate-overline", `Candidate #${invitation.candidate_id}`),
    createElement("h3", "sent-invitation-name", candidateName)
  );
  const status = createElement(
    "span",
    `sent-invitation-status is-${invitation.status}`,
    invitation.status.charAt(0).toUpperCase() + invitation.status.slice(1)
  );
  header.append(identity, status);
  card.append(
    header,
    createElement("p", "sent-invitation-role", invitation.job_title),
    createElement("p", "sent-invitation-date", `Sent ${formatInvitationDate(invitation.created_at)}`)
  );

  if (isAccepted) {
    const contact = createElement("section", "revealed-contact");
    contact.append(createElement("h4", "", "Revealed Contact Details"));

    if (typeof invitation.candidate_email === "string") {
      const emailRow = createElement("div", "revealed-contact-row");
      const emailLink = createElement("a", "revealed-contact-link", invitation.candidate_email);
      emailLink.href = `mailto:${invitation.candidate_email}`;
      const copyButton = createElement("button", "copy-email-button", "Copy Email");
      copyButton.type = "button";
      copyButton.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(invitation.candidate_email);
          showRecruiterToast("Candidate email copied.");
        } catch (error) {
          showRecruiterToast(
            error instanceof Error
              ? `Could not copy candidate email: ${error.message}`
              : "Could not copy candidate email.",
            true
          );
        }
      });
      emailRow.append(emailLink, copyButton);
      contact.append(emailRow);
    }

    const phone = typeof invitation.candidate_phone === "string" && invitation.candidate_phone
      ? invitation.candidate_phone
      : "Not provided";
    contact.append(
      createElement("p", "revealed-contact-detail", `Phone: ${phone}`)
    );

    if (typeof invitation.github_url === "string") {
      let githubUrl;
      try {
        githubUrl = new URL(invitation.github_url);
      } catch {
        githubUrl = null;
      }
      if (githubUrl && githubUrl.protocol === "https:" && githubUrl.hostname === "github.com") {
        const githubLink = createElement("a", "revealed-contact-link", "GitHub profile");
        githubLink.href = githubUrl.href;
        githubLink.target = "_blank";
        githubLink.rel = "noopener noreferrer";
        contact.append(githubLink);
      }
    }
    card.append(contact);
  }

  return card;
}

function renderSentInvitations() {
  const visibleInvitations = activeSentInvitationFilter === "all"
    ? sentInvitations
    : sentInvitations.filter(
        (invitation) => invitation.status === activeSentInvitationFilter
      );
  const cards = document.createDocumentFragment();
  visibleInvitations.forEach((invitation) => cards.append(renderSentInvitation(invitation)));
  if (!visibleInvitations.length) {
    cards.append(
      createElement(
        "p",
        "sent-invitations-empty",
        sentInvitations.length
          ? `No ${activeSentInvitationFilter} invitations.`
          : "No invitations sent yet."
      )
    );
  }
  sentInvitationsList.replaceChildren(cards);
  sentInvitationsStatus.textContent = "";
  sentInvitationFilterButtons.forEach((button) => {
    const isActive = button.dataset.invitationFilter === activeSentInvitationFilter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

async function loadSentInvitations() {
  const requestId = ++latestSentInvitationsRequestId;
  const token = window.localStorage.getItem(RECRUITER_TOKEN_KEY);
  sentInvitations = [];
  sentInvitationsList.replaceChildren();

  if (!token) {
    sentInvitationsStatus.textContent = "Sign in as a recruiter to view your sent invitations.";
    sentInvitationsList.setAttribute("aria-busy", "false");
    return;
  }

  sentInvitationsStatus.textContent = "Loading sent invitations...";
  sentInvitationsList.setAttribute("aria-busy", "true");
  try {
    const invitations = await window.loomApi.request("/recruiter/invitations", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (requestId !== latestSentInvitationsRequestId) {
      return;
    }
    if (!Array.isArray(invitations)) {
      throw new Error("The sent invitations response was invalid.");
    }
    sentInvitations = invitations;
    renderSentInvitations();
  } catch (error) {
    if (requestId !== latestSentInvitationsRequestId) {
      return;
    }
    sentInvitationsStatus.textContent = error instanceof Error
      ? `Could not load sent invitations: ${error.message}`
      : "Could not load sent invitations.";
    sentInvitationsList.replaceChildren();
  } finally {
    if (requestId === latestSentInvitationsRequestId) {
      sentInvitationsList.setAttribute("aria-busy", "false");
    }
  }
}

sentInvitationFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.invitationFilter;
    if (["all", "pending", "accepted", "declined"].includes(filter)) {
      activeSentInvitationFilter = filter;
      renderSentInvitations();
    }
  });
});

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
    void loadSentInvitations();
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
    void loadSentInvitations();
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
    void loadSentInvitations();
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

void checkRecruiterAuth().then(() => loadSentInvitations());
void loadCandidates();
