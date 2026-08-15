#!/usr/bin/env python3
"""Convert website_table.csv into papers/*.json + papers/index.json."""

import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "website_table.csv"
PAPERS_DIR = ROOT / "papers"

LABELS = {
    # Task
    "\\taskProbeLDtoHD": "Probe LD to HD",
    "\\taskProbeHDtoLD": "Probe HD to LD",
    "\\taskCharacterize": "Characterize",
    "\\taskCharacterizeSp": "Characterize",
    "\\taskCharacterizeCo": "Characterize",
    "\\taskDiscriminateComplement": "Discriminate (Complement)",
    "\\taskDiscriminateExplicit": "Discriminate (Explicit)",
    "\\taskDiscriminateData": "Discriminate (Data)",
    # Target
    "\\targetPoint": "Point",
    "\\targetGlobal": "Global",
    "\\targetCluster": "Cluster",
    "\\targetTrajectory": "Trajectory",
    # DR Requirements
    "\\DRagnostic": "DR-Agnostic",
    # Input Data
    "\\inputNumeric": "Numeric",
    # Output Complexity
    "\\cutoff": "Cutoff",
    "\\sparsity": "Sparsity",
    "\\scalabilityNone": "No Scalability Control",
    "\\aggregation": "Aggregation",
    # Interactive
    "\\vizStatic": "Static",
    "\\vizInteractive": "Interactive",
    # Layout Enrichment
    "\\LEnone": "None",
    # Evaluation Type
    "\\evalQuantitative": "Quantitative",
    "\\evalFeedback": "Informal Feedback",
    "\\evalLabStudy": "Lab Study",
    # Quantitative Measures
    "\\measureFidelity": "Fidelity",
    "\\measureComplexity": "Complexity",
    "\\measureDiversity": "Diversity",
    "\\measureRobustness": "Robustness",
    "\\measureSatisfaction": "Satisfaction",
    "\\measureTaskAccuracy": "Task Accuracy",
    "\\measureTaskTime": "Task Time",
}

# We are not using this anymore
DROP_TOKENS = {
    "\\evalComparative",
}


PLAIN_LABELS = {
    # DR Requirements
    "oos": "OOS",
    "pca first": "PCA First",
    "auto diff.": "Auto Diff.",
    "differentiable": "Differentiable",
    "inverse": "Inverse",
    "parametric": "Parametric",
    "rotation invariant": "Rotation Invariant",
    "smooth embedding": "Smooth Embedding",
    "t-sne": "t-SNE",
    # Input Data
    "categorical or mixed": "Categorical or Mixed",
    "image": "Image",
    "textual": "Textual",
    "specific: scrna-seq": "Specific: scRNA-seq",
    "specific: histopathology images": "Specific: Histopathology Images",
    "specific: graph-based gait sequence": "Specific: Graph-Based Gait Sequence",
    # Layout Enrichment
    "cluster": "Cluster",
    "direct": "Direct",
    "spatial": "Spatial",
    # Output Format
    "fi: model-derived (dr gradients)": "FI: Model-Derived (DR Gradients)",
    "fi: model-derived (ebm)": "FI: Model-Derived (EBM)",
    "fi: model-derived (lr)": "FI: Model-Derived (LR)",
    "fi: model-derived (lr, nn)": "FI: Model-Derived (LR, NN)",
    "fi: model-derived (shap)": "FI: Model-Derived (SHAP)",
    "fi: model-derived (svm)": "FI: Model-Derived (SVM)",
    "fi: model-derived (metric learning)": "FI: Model-Derived (Metric Learning)",
    "fi: model-derived (predicate regression)": "FI: Model-Derived (Predicate Regression)",
    "fi: statistics (evd)": "FI: Statistics (EVD)",
    "fi: statistics (hotelling's t2)": "FI: Statistics (Hotelling's T2)",
    "fi: statistics (js-divergence)": "FI: Statistics (JS-Divergence)",
    "fi: statistics (kl-divergence)": "FI: Statistics (KL-Divergence)",
    "fi: statistics (svd)": "FI: Statistics (SVD)",
    "fi: statistics (autocorrelation)": "FI: Statistics (Autocorrelation)",
    "fi: statistics (correlation)": "FI: Statistics (Correlation)",
    "fi: statistics (correlation, matrix factorization)": "FI: Statistics (Correlation, Matrix Factorization)",
    "fi: statistics (spectral)": "FI: Statistics (Spectral)",
    "fi: statistics (t-test)": "FI: Statistics (t-Test)",
    "fi: statistics (variance)": "FI: Statistics (Variance)",
    "hd feature change": "HD Feature Change",
    "ld geometric": "LD Geometric",
    "clustering": "Clustering",
    "natural language": "Natural Language",
    "trees or rules": "Trees or Rules",
}

MULTI_VALUE_COLUMNS = [
    "Task",
    "Target",
    "DR Requirements",
    "Input Data",
    "Output Format",
    "Output Complexity",
    "Interactive",
    "Layout Enrichment",
    "Evaluation Type",
    "Quantitative Measures",
]

# JSON keys (camelCase) for each CSV column above, same order.
FIELD_KEYS = {
    "Task": "task",
    "Target": "target",
    "DR Requirements": "drRequirements",
    "Input Data": "inputData",
    "Output Format": "outputFormat",
    "Output Complexity": "outputComplexity",
    "Interactive": "interactive",
    "Layout Enrichment": "layoutEnrichment",
    "Evaluation Type": "evaluationType",
    "Quantitative Measures": "quantitativeMeasures",
}

GITHUB_RE = re.compile(r"\\github\{([^}]*)\}")


def paren_aware_split(s):
    """Split on ',' at paren-depth 0. Handles plain comma lists too (no parens)."""
    parts, depth, cur = [], 0, ""
    for ch in s:
        if ch == "(":
            depth += 1
            cur += ch
        elif ch == ")":
            depth -= 1
            cur += ch
        elif ch == "," and depth == 0:
            parts.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur.strip())
    return parts


def normalize_value(raw):
    """Strip; map macro tokens via LABELS/DROP_TOKENS; map plain text via PLAIN_LABELS."""
    item = raw.strip()
    if not item or item == "0":
        return None
    if item.startswith("\\"):
        if item in DROP_TOKENS:
            return None
        if item not in LABELS:
            raise ValueError(f"Unmapped macro token: {item!r}")
        return LABELS[item]
    collapsed = re.sub(r"\s+", " ", item)
    key = collapsed.lower()
    if key not in PLAIN_LABELS:
        raise ValueError(f"Unmapped plain value: {collapsed!r}")
    return PLAIN_LABELS[key]


def normalize_multi(raw):
    """Split, normalize, and dedupe (order-preserving) -- label collapsing
    (e.g. Characterize/CharacterizeSp/Co) can otherwise produce duplicates."""
    if not raw or raw.strip() == "0":
        return []
    values = []
    for part in paren_aware_split(raw):
        normalized = normalize_value(part)
        if normalized is not None and normalized not in values:
            values.append(normalized)
    return values


def input_data_category(value):
    """Bucket detailed 'Specific: ...' values under a single 'Specific' filter."""
    return "Specific" if value.startswith("Specific:") else value


def output_format_category(value):
    """Bucket detailed FI sub-types under their family for filtering."""
    if value.startswith("FI: Model-Derived"):
        return "FI: Model-Derived"
    if value.startswith("FI: Statistics"):
        return "FI: Statistics"
    return value


def dedupe(values):
    seen = []
    for v in values:
        if v not in seen:
            seen.append(v)
    return seen


def extract_github(raw):
    if not raw or raw.strip() == "0":
        return None
    match = GITHUB_RE.search(raw)
    if not match:
        raise ValueError(f"Unrecognized GitHub cell: {raw!r}")
    return match.group(1).strip()


def slugify(text):
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug


def build_paper(row):
    paper = {
        "abbreviation": row["Abbreviation"].strip(),
        "title": row["Title"].strip(),
        "authors": row["Authors"].strip(),
        "year": int(row["Year"].strip()),
        "url": row["URL"].strip(),
        "github": extract_github(row["GitHub"]),
    }
    for column in MULTI_VALUE_COLUMNS:
        paper[FIELD_KEYS[column]] = normalize_multi(row[column])

    # Coarse filter-only buckets for the two fields whose detailed values are
    # too granular for filter buttons (detail is kept for display on cards).
    paper["inputDataCategories"] = dedupe(
        input_data_category(v) for v in paper["inputData"]
    )
    paper["outputFormatCategories"] = dedupe(
        output_format_category(v) for v in paper["outputFormat"]
    )

    paper["slug"] = slugify(paper["abbreviation"])
    return paper


def main():
    with CSV_PATH.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))

    papers = [build_paper(row) for row in rows]

    slugs = [p["slug"] for p in papers]
    duplicates = {s for s in slugs if slugs.count(s) > 1}
    if duplicates:
        raise ValueError(f"Slug collision(s): {duplicates}")

    PAPERS_DIR.mkdir(exist_ok=True)
    for old in PAPERS_DIR.glob("*.json"):
        old.unlink()

    for paper in papers:
        out_path = PAPERS_DIR / f"{paper['slug']}.json"
        with out_path.open("w", encoding="utf-8") as f:
            json.dump(paper, f, ensure_ascii=False, indent=2)
            f.write("\n")

    with (PAPERS_DIR / "index.json").open("w", encoding="utf-8") as f:
        json.dump(papers, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Wrote {len(papers)} paper files + papers/index.json", file=sys.stderr)


if __name__ == "__main__":
    main()
