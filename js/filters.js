// Categorical filter fields, in spec order. `key` matches the JSON field
// produced by scripts/build_data.py and is what card display uses (detailed
// values); `label` is the sidebar section heading. `filterKey`, when set, is
// a coarser per-paper field used for building filter buttons and matching --
// inputData/outputFormat have far more distinct detailed values than makes
// sense as filter buttons, so filtering happens against a bucketed field
// while the card still shows the detailed one.
export const FIELDS = [
  { key: "task", label: "Task" },
  { key: "target", label: "Target" },
  { key: "drRequirements", label: "DR Requirements" },
  { key: "inputData", label: "Input Data", filterKey: "inputDataCategories" },
  { key: "outputFormat", label: "Output Format", filterKey: "outputFormatCategories" },
  { key: "outputComplexity", label: "Complexity Control" },
  { key: "interactive", label: "Interactive" },
  { key: "layoutEnrichment", label: "Layout Enrichment" },
  { key: "evaluationType", label: "Evaluation Approach" },
  { key: "quantitativeMeasures", label: "Evaluation Measures" },
];

export function filterField(field) {
  return field.filterKey ?? field.key;
}

export const YEAR_MIN = 2012;
export const YEAR_MAX = 2025;

export function createInitialState() {
  const categories = {};
  for (const field of FIELDS) categories[field.key] = new Set();
  return {
    search: "",
    yearMin: YEAR_MIN,
    yearMax: YEAR_MAX,
    codePublicOnly: false,
    categories,
  };
}

export function resetState(state) {
  const fresh = createInitialState();
  state.search = fresh.search;
  state.yearMin = fresh.yearMin;
  state.yearMax = fresh.yearMax;
  state.codePublicOnly = fresh.codePublicOnly;
  for (const field of FIELDS) state.categories[field.key].clear();
}

export function matches(paper, state) {
  if (state.search) {
    const q = state.search.trim().toLowerCase();
    if (q) {
      const hit =
        paper.title.toLowerCase().includes(q) ||
        paper.abbreviation.toLowerCase().includes(q);
      if (!hit) return false;
    }
  }

  if (paper.year < state.yearMin || paper.year > state.yearMax) return false;

  if (state.codePublicOnly && !paper.github) return false;

  for (const field of FIELDS) {
    const selected = state.categories[field.key];
    if (selected.size === 0) continue;
    const values = paper[filterField(field)];
    const hasMatch = values.some((v) => selected.has(v));
    if (!hasMatch) return false;
  }

  return true;
}

export function applyFilters(papers, state) {
  return papers.filter((p) => matches(p, state));
}

// Sort options shown as buttons above the gallery. "year" defaults to
// newest-first (typical for browsing a paper list); "abbreviation" is A-Z.
export const SORT_OPTIONS = [
  { key: "abbreviation", label: "Abbreviation" },
  { key: "year", label: "Year" },
];

export function sortPapers(papers, sortBy) {
  const sorted = [...papers];
  if (sortBy === "year") {
    sorted.sort((a, b) => b.year - a.year || a.abbreviation.localeCompare(b.abbreviation));
  } else {
    sorted.sort((a, b) => a.abbreviation.localeCompare(b.abbreviation));
  }
  return sorted;
}
