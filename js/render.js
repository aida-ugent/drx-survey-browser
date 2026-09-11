import { FIELDS } from "./filters.js";
import { inputDataCategory, outputFormatCategory } from "./submit.js";

// A card tag's own value is the *detailed* one (see FIELDS in filters.js),
// but inputData/outputFormat filter chips select on the coarser bucket --
// bucket a tag the same way before checking it against the active filter
// selections, or a selected "FI: Statistics" filter would never highlight a
// "FI: Statistics (Variance)" tag.
const BUCKET_FN = {
  inputData: inputDataCategory,
  outputFormat: outputFormatCategory,
};

// Groups FIELDS into the pairs a card's tags are visually clustered into,
// each rendered as a label line above a values line (no chips) for density.
// Custom labels here rather than joining field.label -- "Evaluation
// Approach & Measures" and "Interactivity & Layout Enrichment" read better
// than a literal concatenation of the sidebar's own per-field headings.
const TAG_GROUPS = [
  { label: "Task & Target", fields: FIELDS.slice(0, 2) },
  { label: "DR Requirements & Input Data", fields: FIELDS.slice(2, 4) },
  { label: "Output Format & Complexity Control", fields: FIELDS.slice(4, 6) },
  { label: "Interactivity & Layout Enrichment", fields: FIELDS.slice(6, 8) },
  { label: "Evaluation Approach & Measures", fields: FIELDS.slice(8, 10) },
];

function buildTagGroup({ label, fields }, paper, activeCategories) {
  const values = [];
  for (const field of fields) {
    const selected = activeCategories?.[field.key];
    const bucketOf = BUCKET_FN[field.key];
    for (const value of paper[field.key]) {
      const isActive = selected ? selected.has(bucketOf ? bucketOf(value) : value) : false;
      values.push({ value, isActive });
    }
  }
  if (values.length === 0) return null;

  const row = document.createElement("div");
  row.className = "tag-group";

  const labelEl = document.createElement("div");
  labelEl.className = "tag-group-label";
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const valuesEl = document.createElement("div");
  valuesEl.className = "tag-group-values";
  values.forEach(({ value, isActive }, i) => {
    if (i > 0) valuesEl.appendChild(document.createTextNode(", "));
    const span = document.createElement("span");
    span.className = isActive ? "tag-value active" : "tag-value";
    span.textContent = value;
    valuesEl.appendChild(span);
  });
  row.appendChild(valuesEl);

  return row;
}

function buildCard(paper, activeCategories) {
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
  for (const group of TAG_GROUPS) {
    const row = buildTagGroup(group, paper, activeCategories);
    if (row) tags.appendChild(row);
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
    const icon = document.createElement("i");
    icon.className = "fa-brands fa-github";
    icon.setAttribute("aria-hidden", "true");
    gh.appendChild(icon);
    gh.appendChild(document.createTextNode("GitHub"));
    footer.appendChild(gh);
  }
  card.appendChild(footer);

  return card;
}

export function renderGallery(container, papers, activeCategories) {
  container.innerHTML = "";
  if (papers.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No papers match the current filters.";
    container.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const paper of papers) fragment.appendChild(buildCard(paper, activeCategories));
  container.appendChild(fragment);
}
