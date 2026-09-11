#!/usr/bin/env python3
"""Tests for scripts/build_data.py. Run with: python3 -m unittest tests.test_build_data
(from the website/ directory)."""

import csv
import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_data  # noqa: E402

FIELDNAMES = [
    "Abbreviation",
    "Title",
    "Authors",
    "Year",
    "URL",
    "Citation",
    "GitHub",
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
    "Latex Linebreak",
]


def csv_row(abbreviation="Foo"):
    return {
        "Abbreviation": abbreviation,
        "Title": "A Title",
        "Authors": "Doe, Jane",
        "Year": "2020",
        "URL": "https://example.com",
        "Citation": "\\cite{x}",
        "GitHub": "0",
        "Task": "\\taskCharacterize",
        "Target": "\\targetPoint",
        "DR Requirements": "\\DRagnostic",
        "Input Data": "\\inputNumeric",
        "Output Format": "ld geometric",
        "Output Complexity": "\\cutoff",
        "Interactive": "\\vizStatic",
        "Layout Enrichment": "\\LEnone",
        "Evaluation Type": "\\evalQuantitative",
        "Quantitative Measures": "\\measureFidelity",
        "Latex Linebreak": "\\\\",
    }


def submission(abbreviation="Bar", **overrides):
    record = {
        "abbreviation": abbreviation,
        "title": "A Submitted Paper",
        "authors": "Smith, John",
        "year": 2026,
        "url": "https://example.com/bar",
        "github": None,
        "task": ["Characterize"],
        "target": ["Point"],
        "drRequirements": ["DR-Agnostic"],
        "inputData": ["Specific: made-up"],
        "outputFormat": ["FI: Model-Derived (Bogus)"],
        "outputComplexity": ["Cutoff"],
        "interactive": ["Static"],
        "layoutEnrichment": ["None"],
        "evaluationType": ["Quantitative"],
        "quantitativeMeasures": ["Fidelity"],
        # Deliberately wrong derived fields, to prove build_data.py recomputes
        # them rather than trusting a submission's own copies.
        "inputDataCategories": ["WRONG"],
        "outputFormatCategories": ["WRONG"],
        "slug": "totally-wrong-slug",
    }
    record.update(overrides)
    return record


class BuildDataSubmissionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.csv_path = root / "website_table.csv"
        self.papers_dir = root / "papers"
        self.submissions_dir = self.papers_dir / "submissions"
        self.submissions_dir.mkdir(parents=True)

        self._orig = (build_data.CSV_PATH, build_data.PAPERS_DIR, build_data.SUBMISSIONS_DIR)
        build_data.CSV_PATH = self.csv_path
        build_data.PAPERS_DIR = self.papers_dir
        build_data.SUBMISSIONS_DIR = self.submissions_dir
        self.addCleanup(self._restore)

    def _restore(self):
        build_data.CSV_PATH, build_data.PAPERS_DIR, build_data.SUBMISSIONS_DIR = self._orig

    def write_csv(self, *abbreviations):
        with self.csv_path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
            writer.writeheader()
            for abbr in abbreviations:
                writer.writerow(csv_row(abbr))

    def write_submission(self, filename, record):
        with (self.submissions_dir / filename).open("w", encoding="utf-8") as f:
            json.dump(record, f)

    def test_submission_derived_fields_are_recomputed_not_trusted(self):
        self.write_csv("Foo")
        self.write_submission("bar-1.json", submission())
        build_data.main()
        index = json.loads((self.papers_dir / "index.json").read_text())
        bar = next(p for p in index if p["abbreviation"] == "Bar")
        self.assertEqual(bar["slug"], "bar")
        self.assertEqual(bar["inputDataCategories"], ["Specific"])
        self.assertEqual(bar["outputFormatCategories"], ["FI: Model-Derived"])

    def test_submission_slug_collision_with_csv_paper_raises(self):
        self.write_csv("Foo")
        self.write_submission("foo-1.json", submission(abbreviation="Foo"))
        with self.assertRaises(ValueError):
            build_data.main()

    def test_missing_required_key_raises(self):
        self.write_csv("Foo")
        bad = submission()
        del bad["title"]
        self.write_submission("bar-1.json", bad)
        with self.assertRaises(ValueError):
            build_data.main()

    def test_year_must_be_int(self):
        self.write_csv("Foo")
        self.write_submission("bar-1.json", submission(year="2026"))
        with self.assertRaises(ValueError):
            build_data.main()

    def test_list_field_wrong_type_raises(self):
        self.write_csv("Foo")
        self.write_submission("bar-1.json", submission(task="Characterize"))
        with self.assertRaises(ValueError):
            build_data.main()

    def test_submissions_directory_is_never_written_to_or_deleted(self):
        self.write_csv("Foo")
        self.write_submission("bar-1.json", submission())
        sub_path = self.submissions_dir / "bar-1.json"
        before_content = sub_path.read_text()
        before_mtime = sub_path.stat().st_mtime_ns
        build_data.main()
        self.assertEqual(sub_path.read_text(), before_content)
        self.assertEqual(sub_path.stat().st_mtime_ns, before_mtime)

    def test_running_twice_is_idempotent(self):
        self.write_csv("Foo")
        self.write_submission("bar-1.json", submission())
        build_data.main()
        first = (self.papers_dir / "index.json").read_text()
        build_data.main()
        second = (self.papers_dir / "index.json").read_text()
        self.assertEqual(first, second)

    def test_missing_submissions_directory_is_fine(self):
        build_data.SUBMISSIONS_DIR = Path(self.tmp.name) / "no-such-dir"
        self.write_csv("Foo")
        build_data.main()
        index = json.loads((self.papers_dir / "index.json").read_text())
        self.assertEqual(len(index), 1)


if __name__ == "__main__":
    unittest.main()
