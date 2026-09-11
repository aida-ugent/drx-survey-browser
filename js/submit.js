import { FIELDS } from "./filters.js";
import { iconFor } from "./icons.js";

// See .claude/features/add-to-git/spec.md §6.2 -- confirmed real values, not
// placeholders (unlike the retired mailto feature's MAILTO_ADDRESS was).
const GITHUB_OWNER = "aida-ugent";
const GITHUB_REPO = "drx-survey-browser";
const GITHUB_BRANCH = "main";

const REQUIRED_KEYS = ["abbreviation", "title", "authors", "year", "url"];

// Removes embedded CR/LF from a single-line value. Doesn't otherwise trim --
// callers decide whether surrounding whitespace matters for their purpose.
export function stripCrLf(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ");
}

// Case-insensitive, whitespace-trimmed lookup against already-loaded papers.
// Returns the matching paper object, or null if none/empty input.
export function isDuplicateAbbreviation(abbreviation, allPapers) {
  const needle = String(abbreviation ?? "").trim().toLowerCase();
  if (!needle) return null;
  return (
    allPapers.find((p) => p.abbreviation.trim().toLowerCase() === needle) ??
    null
  );
}

// Validates the five required fields. `values` is a plain object of raw
// string inputs (abbreviation/title/authors/year/url). URL *shape* is left
// to the browser's native <input type="url"> constraint validation -- not
// duplicated here. `currentYear` is injectable for deterministic testing.
export function validateRequiredFields(values, { currentYear } = {}) {
  const year = currentYear ?? new Date().getFullYear();
  const errors = {};

  for (const key of REQUIRED_KEYS) {
    if (key === "year") continue;
    const value = values[key];
    if (typeof value !== "string" || value.trim() === "") {
      errors[key] = "This field is required.";
    }
  }

  const rawYear = values.year;
  if (typeof rawYear !== "string" || rawYear.trim() === "") {
    errors.year = "This field is required.";
  } else {
    const trimmed = rawYear.trim();
    const yearNum = Number(trimmed);
    if (!Number.isInteger(yearNum) || String(yearNum) !== trimmed) {
      errors.year = "Enter a whole number year.";
    } else if (yearNum < 2000 || yearNum > year + 1) {
      errors.year = `Enter a year between 2000 and ${year + 1}.`;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// JS port of scripts/build_data.py's slugify() -- must stay byte-identical
// in behavior, since scripts/build_data.py recomputes this same value
// server-side and does not trust a submission's own copy (see its
// load_submission()); this copy exists only so the file reads correctly
// during PR review before that recomputation happens.
export function slugify(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// JS port of scripts/build_data.py's input_data_category().
export function inputDataCategory(value) {
  return value.startsWith("Specific:") ? "Specific" : value;
}

// JS port of scripts/build_data.py's output_format_category().
export function outputFormatCategory(value) {
  if (value.startsWith("FI: Model-Derived")) return "FI: Model-Derived";
  if (value.startsWith("FI: Statistics")) return "FI: Statistics";
  return value;
}

function dedupe(values) {
  const seen = [];
  for (const value of values) {
    if (!seen.includes(value)) seen.push(value);
  }
  return seen;
}

// Builds a papers/*.json-shaped record from the form's collected values.
// Key order matches papers/*.json exactly (verified against papers/pie.json)
// so a maintainer reviewing the PR sees something that already looks like a
// real entry -- see .claude/features/add-to-git/spec.md §6.1.
export function buildSubmissionRecord(values) {
  const record = {
    abbreviation: stripCrLf(values.abbreviation ?? "").trim(),
    title: stripCrLf(values.title ?? "").trim(),
    authors: stripCrLf(values.authors ?? "").trim(),
    year: Number(values.year),
    url: stripCrLf(values.url ?? "").trim(),
    github:
      values.github && values.github.trim() !== ""
        ? stripCrLf(values.github).trim()
        : null,
  };
  for (const field of FIELDS) {
    record[field.key] = Array.isArray(values[field.key])
      ? [...values[field.key]]
      : [];
  }
  record.inputDataCategories = dedupe(record.inputData.map(inputDataCategory));
  record.outputFormatCategories = dedupe(
    record.outputFormat.map(outputFormatCategory)
  );
  record.slug = slugify(record.abbreviation);
  return record;
}

// papers/submissions/<slug>-<timestamp>.json -- the timestamp only avoids
// two concurrent submissions colliding on the same path; it plays no part
// in how the entry is identified once merged (scripts/build_data.py uses
// the record's own recomputed `slug` for that). `now` is injectable for
// deterministic tests, same pattern as validateRequiredFields's `currentYear`.
export function buildSubmissionFilename(abbreviation, now = Date.now()) {
  return `papers/submissions/${slugify(abbreviation)}-${now}.json`;
}

// https://github.com/{owner}/{repo}/new/{branch}?filename=...&value=...
// URLSearchParams handles encoding for both params -- no hand-built query
// string, unlike the retired mailto path's manual encodeURIComponent calls.
export function composeGithubNewFileUrl({ owner, repo, branch, filename, content }) {
  const params = new URLSearchParams({ filename, value: content });
  return `https://github.com/${owner}/${repo}/new/${branch}?${params.toString()}`;
}

const SINGLE_LINE_INPUT_KEYS = ["abbreviation", "title", "authors", "year", "url", "github"];

// Same derivation main.js's distinctValues() uses for the sidebar filters --
// for inputData/outputFormat this is the coarse *Categories bucket (per
// js/filters.js's filterField()), same as the sidebar shows, since the
// detailed vocabulary (e.g. 23 Output Format values) is too granular for
// buttons here too.
function distinctValues(field, allPapers) {
  const key = field.filterKey ?? field.key;
  const values = new Set();
  for (const paper of allPapers) {
    for (const v of paper[key]) values.add(v);
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

// DOM wiring. Everything above this point is pure and unit-tested; this
// function is the only place that touches `document`.
export function initSubmitForm(allPapers) {
  const openBtn = document.getElementById("open-submit-dialog");
  const dialog = document.getElementById("submit-dialog");
  const closeBtn = document.getElementById("submit-dialog-close");
  const cancelBtn = document.getElementById("submit-cancel");
  const form = document.getElementById("submit-form");
  const submitBtn = document.getElementById("submit-btn");
  const taxonomyContainer = document.getElementById("submit-taxonomy");
  const dupWarningEl = document.getElementById("abbr-dup-warning");
  const copyBtn = document.getElementById("submit-copy-btn");
  const copyStatusEl = document.getElementById("submit-copy-status");

  if (!openBtn || !dialog || !form) return; // markup not present; nothing to wire

  const inputs = {};
  for (const key of SINGLE_LINE_INPUT_KEYS) {
    inputs[key] = document.getElementById(`field-${key}`);
  }

  const taxonomySelections = {};
  for (const field of FIELDS) taxonomySelections[field.key] = new Set();

  let attemptedSubmit = false;

  function getSingleLineValues() {
    const values = {};
    for (const key of SINGLE_LINE_INPUT_KEYS) values[key] = inputs[key]?.value ?? "";
    return values;
  }

  function getAllValues() {
    const values = getSingleLineValues();
    for (const field of FIELDS) {
      values[field.key] = [...taxonomySelections[field.key]];
    }
    return values;
  }

  // Fields that have an error <p> in the markup: the five required fields
  // plus GitHub (optional, but its URL shape is still checked when filled).
  const FIELDS_WITH_ERROR_UI = [...REQUIRED_KEYS, "github"];

  function renderErrors(errors) {
    // Errors are only surfaced once the visitor has tried to submit --
    // showing "required" on a pristine, untouched field is just noise.
    for (const key of FIELDS_WITH_ERROR_UI) {
      const errorEl = document.getElementById(`error-${key}`);
      if (!errorEl) continue;
      const shouldShow = attemptedSubmit && Boolean(errors[key]);
      errorEl.textContent = shouldShow ? errors[key] : "";
      errorEl.hidden = !shouldShow;
      if (inputs[key]) inputs[key].setAttribute("aria-invalid", shouldShow ? "true" : "false");
    }
  }

  // Native <input type="url"> constraint validation, consulted explicitly --
  // just setting type="url" on the input does nothing on its own unless
  // something actually reads .checkValidity().
  function urlShapeError(input) {
    if (!input || input.value.trim() === "") return null;
    return input.checkValidity() ? null : "Enter a valid URL (e.g. https://example.com).";
  }

  function revalidate() {
    const { valid: requiredValid, errors } = validateRequiredFields(getSingleLineValues());

    const urlError = urlShapeError(inputs.url);
    if (urlError) errors.url = urlError;
    const githubError = urlShapeError(inputs.github);
    if (githubError) errors.github = githubError;

    const valid = requiredValid && !urlError && !githubError;
    renderErrors(errors);
    if (submitBtn) submitBtn.disabled = !valid;
    return valid;
  }

  function updateDuplicateWarning() {
    if (!dupWarningEl) return;
    const match = isDuplicateAbbreviation(inputs.abbreviation?.value, allPapers);
    if (match) {
      dupWarningEl.textContent = `"${match.abbreviation}" is already in the survey -- double check this isn't a duplicate.`;
      dupWarningEl.hidden = false;
    } else {
      dupWarningEl.textContent = "";
      dupWarningEl.hidden = true;
    }
  }

  for (const key of SINGLE_LINE_INPUT_KEYS) {
    const el = inputs[key];
    if (!el) continue;
    el.addEventListener("input", () => {
      revalidate();
      if (key === "abbreviation") updateDuplicateWarning();
    });
  }

  function buildTaxonomyChips() {
    if (!taxonomyContainer) return;
    taxonomyContainer.innerHTML = "";
    for (const field of FIELDS) {
      const group = document.createElement("div");
      group.className = "category-group";

      const heading = document.createElement("h3");
      heading.textContent = field.label;
      group.appendChild(heading);

      const row = document.createElement("div");
      row.className = "chip-row";

      for (const value of distinctValues(field, allPapers)) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.dataset.field = field.key;
        chip.dataset.value = value;

        const icon = iconFor(field.key, value);
        if (icon) {
          const img = document.createElement("img");
          img.src = icon;
          img.alt = "";
          chip.appendChild(img);
        }
        chip.appendChild(document.createTextNode(value));

        chip.addEventListener("click", () => {
          const selected = taxonomySelections[field.key];
          if (selected.has(value)) {
            selected.delete(value);
            chip.classList.remove("active");
          } else {
            selected.add(value);
            chip.classList.add("active");
          }
        });

        row.appendChild(chip);
      }

      group.appendChild(row);
      taxonomyContainer.appendChild(group);
    }
  }

  function resetForm() {
    form.reset();
    attemptedSubmit = false;
    for (const field of FIELDS) taxonomySelections[field.key].clear();
    for (const chip of taxonomyContainer?.querySelectorAll(".chip.active") ?? []) {
      chip.classList.remove("active");
    }
    for (const key of FIELDS_WITH_ERROR_UI) {
      const errorEl = document.getElementById(`error-${key}`);
      if (errorEl) {
        errorEl.textContent = "";
        errorEl.hidden = true;
      }
      if (inputs[key]) inputs[key].setAttribute("aria-invalid", "false");
    }
    updateDuplicateWarning();
    if (copyStatusEl) copyStatusEl.textContent = "";
    if (submitBtn) submitBtn.disabled = true;
  }

  buildTaxonomyChips();
  resetForm();

  openBtn.addEventListener("click", () => dialog.showModal());
  closeBtn?.addEventListener("click", () => dialog.close());
  cancelBtn?.addEventListener("click", () => dialog.close());
  // Native <dialog> has no built-in backdrop-click-to-close; a click whose
  // target is the dialog element itself (not a descendant) means it landed
  // on the ::backdrop, since real content clicks target a descendant node.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  // Fires for Escape, the close()/cancel button calls above, and the
  // backdrop-click handler -- one place to reset on every close path.
  dialog.addEventListener("close", resetForm);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    attemptedSubmit = true;
    if (!revalidate()) return;

    const record = buildSubmissionRecord(getAllValues());
    const filename = buildSubmissionFilename(record.abbreviation);
    const url = composeGithubNewFileUrl({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      branch: GITHUB_BRANCH,
      filename,
      content: JSON.stringify(record, null, 2),
    });
    // A new tab, not a same-tab navigation: unlike the retired mailto path,
    // this URL really does navigate away from the site, and the visitor
    // should keep their filled-in form open in case they want to copy it
    // manually instead (or in addition).
    window.open(url, "_blank", "noopener");
  });

  // Always available (not gated on the primary action having been clicked),
  // and always computed fresh from the form's current state at click-time --
  // for a contributor who'd rather add the file to a pull request themselves.
  copyBtn?.addEventListener("click", async () => {
    if (copyStatusEl) copyStatusEl.textContent = "";
    const content = JSON.stringify(buildSubmissionRecord(getAllValues()), null, 2);
    try {
      await navigator.clipboard.writeText(content);
      if (copyStatusEl) copyStatusEl.textContent = "Copied!";
    } catch {
      if (copyStatusEl) {
        copyStatusEl.textContent =
          "Couldn't copy automatically -- your browser may be blocking clipboard access.";
      }
    }
  });
}
