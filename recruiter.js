const candidateGrid = document.querySelector("#candidate-grid");
const blindEvaluationToggle = document.querySelector("#blind-evaluation");
const blindEvaluationStatus = document.querySelector("#blind-evaluation-status");
let latestRequestId = 0;

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
      createElement("h2", "candidate-name", candidate.name),
      createElement("p", "candidate-email", candidate.email)
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

void loadCandidates();
