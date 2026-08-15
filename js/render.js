import { FIELDS } from "./filters.js";
import { iconFor } from "./icons.js";

function buildChip(fieldKey, label) {
  const chip = document.createElement("span");
  chip.className = "chip";
  const icon = iconFor(fieldKey, label);
  if (icon) {
    const img = document.createElement("img");
    img.src = icon;
    img.alt = "";
    chip.appendChild(img);
  }
  chip.appendChild(document.createTextNode(label));
  return chip;
}

function buildCard(paper) {
  const card = document.createElement("div");
  card.className = "card";

  const overlay = document.createElement("a");
  overlay.className = "card-overlay-link";
  overlay.href = paper.url;
  overlay.target = "_blank";
  overlay.rel = "noopener";
  overlay.setAttribute("aria-label", `Open paper: ${paper.title}`);
  card.appendChild(overlay);

  const title = document.createElement("h2");
  title.className = "card-title";
  title.innerHTML = `<span class="card-abbr">${paper.abbreviation}</span> — ${paper.title}`;
  card.appendChild(title);

  const authors = document.createElement("p");
  authors.className = "card-authors";
  authors.textContent = paper.authors;
  card.appendChild(authors);

  const tags = document.createElement("div");
  tags.className = "card-tags";
  for (const field of FIELDS) {
    for (const value of paper[field.key]) {
      tags.appendChild(buildChip(field.key, value));
    }
  }
  card.appendChild(tags);

  const footer = document.createElement("div");
  footer.className = "card-footer";
  const year = document.createElement("span");
  year.textContent = paper.year;
  footer.appendChild(year);
  if (paper.github) {
    const gh = document.createElement("a");
    gh.className = "card-github";
    gh.href = paper.github;
    gh.target = "_blank";
    gh.rel = "noopener";
    gh.textContent = "GitHub";
    footer.appendChild(gh);
  }
  card.appendChild(footer);

  return card;
}

export function renderGallery(container, papers) {
  container.innerHTML = "";
  if (papers.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No papers match the current filters.";
    container.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const paper of papers) fragment.appendChild(buildCard(paper));
  container.appendChild(fragment);
}
