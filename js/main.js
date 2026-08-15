import { loadPapers } from "./data.js";
import {
  FIELDS,
  YEAR_MIN,
  YEAR_MAX,
  createInitialState,
  resetState,
  applyFilters,
  filterField,
  SORT_OPTIONS,
  sortPapers,
} from "./filters.js";
import { renderGallery } from "./render.js";
import { iconFor } from "./icons.js";

const state = createInitialState();
let allPapers = [];

const galleryEl = document.getElementById("gallery");
const countEl = document.getElementById("count");
const totalEl = document.getElementById("total");
const searchEl = document.getElementById("search");
const yearMinEl = document.getElementById("year-min");
const yearMaxEl = document.getElementById("year-max");
const yearMinLabelEl = document.getElementById("year-min-label");
const yearMaxLabelEl = document.getElementById("year-max-label");
const yearThumbMinEl = document.getElementById("year-thumb-min");
const yearThumbMaxEl = document.getElementById("year-thumb-max");
const yearRangeFillEl = document.querySelector(".year-range-fill");
const codePublicEl = document.getElementById("code-public");
const categoryFiltersEl = document.getElementById("category-filters");
const resetEl = document.getElementById("reset");
const sortControlsEl = document.getElementById("sort-controls");

let sortBy = SORT_OPTIONS[0].key;

function render() {
  const filtered = applyFilters(allPapers, state);
  renderGallery(galleryEl, sortPapers(filtered, sortBy));
  countEl.textContent = filtered.length;
  totalEl.textContent = allPapers.length;
}

function distinctValues(field) {
  const values = new Set();
  const key = filterField(field);
  for (const paper of allPapers) {
    for (const v of paper[key]) values.add(v);
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

function buildCategoryFilters() {
  categoryFiltersEl.innerHTML = "";
  for (const field of FIELDS) {
    const group = document.createElement("div");
    group.className = "category-group";

    const heading = document.createElement("h3");
    heading.textContent = field.label;
    group.appendChild(heading);

    const row = document.createElement("div");
    row.className = "chip-row";

    for (const value of distinctValues(field)) {
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
        const selected = state.categories[field.key];
        if (selected.has(value)) {
          selected.delete(value);
          chip.classList.remove("active");
        } else {
          selected.add(value);
          chip.classList.add("active");
        }
        render();
      });

      row.appendChild(chip);
    }

    group.appendChild(row);
    categoryFiltersEl.appendChild(group);
  }
}

function buildSortControls() {
  for (const option of SORT_OPTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sort-btn";
    button.classList.toggle("active", option.key === sortBy);
    button.textContent = option.label;
    button.addEventListener("click", () => {
      sortBy = option.key;
      for (const btn of sortControlsEl.querySelectorAll(".sort-btn")) {
        btn.classList.toggle("active", btn === button);
      }
      render();
    });
    sortControlsEl.appendChild(button);
  }
}

function updateYearLabels() {
  yearMinLabelEl.textContent = state.yearMin;
  yearMaxLabelEl.textContent = state.yearMax;
}

function yearToPercent(year) {
  return ((year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100;
}

function updateYearVisuals() {
  const minPercent = yearToPercent(state.yearMin);
  const maxPercent = yearToPercent(state.yearMax);
  yearThumbMinEl.style.left = `${minPercent}%`;
  yearThumbMaxEl.style.left = `${maxPercent}%`;
  yearRangeFillEl.style.left = `${minPercent}%`;
  yearRangeFillEl.style.width = `${maxPercent - minPercent}%`;
}

function wireYearRange() {
  yearMinEl.min = YEAR_MIN;
  yearMinEl.max = YEAR_MAX;
  yearMaxEl.min = YEAR_MIN;
  yearMaxEl.max = YEAR_MAX;
  yearMinEl.value = state.yearMin;
  yearMaxEl.value = state.yearMax;
  updateYearLabels();
  updateYearVisuals();

  yearMinEl.addEventListener("input", () => {
    let min = Number(yearMinEl.value);
    if (min > state.yearMax) {
      min = state.yearMax;
      yearMinEl.value = min;
    }
    state.yearMin = min;
    updateYearLabels();
    updateYearVisuals();
    render();
  });

  yearMaxEl.addEventListener("input", () => {
    let max = Number(yearMaxEl.value);
    if (max < state.yearMin) {
      max = state.yearMin;
      yearMaxEl.value = max;
    }
    state.yearMax = max;
    updateYearLabels();
    updateYearVisuals();
    render();
  });
}

function wireSearch() {
  let debounceTimer = null;
  searchEl.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.search = searchEl.value;
      render();
    }, 100);
  });
}

function wireCodePublic() {
  codePublicEl.addEventListener("change", () => {
    state.codePublicOnly = codePublicEl.checked;
    render();
  });
}

function wireReset() {
  resetEl.addEventListener("click", () => {
    resetState(state);
    searchEl.value = "";
    yearMinEl.value = YEAR_MIN;
    yearMaxEl.value = YEAR_MAX;
    updateYearLabels();
    updateYearVisuals();
    codePublicEl.checked = false;
    for (const chip of categoryFiltersEl.querySelectorAll(".chip.active")) {
      chip.classList.remove("active");
    }
    render();
  });
}

async function init() {
  allPapers = await loadPapers();
  buildCategoryFilters();
  buildSortControls();
  wireYearRange();
  wireSearch();
  wireCodePublic();
  wireReset();
  render();
}

init().catch((err) => {
  console.error(err);
  galleryEl.innerHTML = `<div class="empty-state">Failed to load paper data: ${err.message}</div>`;
});
