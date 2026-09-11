import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  stripCrLf,
  isDuplicateAbbreviation,
  validateRequiredFields,
  slugify,
  inputDataCategory,
  outputFormatCategory,
  buildSubmissionRecord,
  buildSubmissionFilename,
  composeGithubNewFileUrl,
} from "../js/submit.js";

describe("stripCrLf", () => {
  test("removes embedded CRLF", () => {
    assert.equal(stripCrLf("foo\r\nbar"), "foo bar");
  });

  test("removes lone LF and lone CR", () => {
    assert.equal(stripCrLf("foo\nbar\rbaz"), "foo bar baz");
  });

  test("collapses consecutive CR/LF runs to one space", () => {
    assert.equal(stripCrLf("foo\n\n\rbar"), "foo bar");
  });

  test("is a no-op on input with no CR/LF", () => {
    assert.equal(stripCrLf("clean value"), "clean value");
  });
});

describe("isDuplicateAbbreviation", () => {
  const allPapers = [
    { abbreviation: "t-SNE" },
    { abbreviation: "PIE" },
    { abbreviation: "  LAPS, VisExPreS  " },
  ];

  test("finds an exact match", () => {
    assert.deepEqual(isDuplicateAbbreviation("PIE", allPapers), allPapers[1]);
  });

  test("finds a differently-cased match", () => {
    assert.deepEqual(isDuplicateAbbreviation("t-sne", allPapers), allPapers[0]);
  });

  test("ignores leading/trailing whitespace on the input", () => {
    assert.deepEqual(isDuplicateAbbreviation("  PIE  ", allPapers), allPapers[1]);
  });

  test("returns null when there is no match", () => {
    assert.equal(isDuplicateAbbreviation("NoSuchMethod", allPapers), null);
  });

  test("returns null for empty-string input", () => {
    assert.equal(isDuplicateAbbreviation("", allPapers), null);
  });

  test("returns null for whitespace-only input", () => {
    assert.equal(isDuplicateAbbreviation("   ", allPapers), null);
  });
});

describe("validateRequiredFields", () => {
  const valid = {
    abbreviation: "FooBar",
    title: "A Title",
    authors: "Doe, Jane",
    year: "2024",
    url: "https://example.com",
  };

  test("accepts a fully valid submission", () => {
    const result = validateRequiredFields(valid, { currentYear: 2026 });
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, {});
  });

  for (const key of ["abbreviation", "title", "authors", "url"]) {
    test(`rejects empty ${key} without flagging other fields`, () => {
      const result = validateRequiredFields({ ...valid, [key]: "" }, { currentYear: 2026 });
      assert.equal(result.valid, false);
      assert.ok(result.errors[key]);
      assert.equal(Object.keys(result.errors).length, 1);
    });

    test(`rejects whitespace-only ${key}`, () => {
      const result = validateRequiredFields({ ...valid, [key]: "   " }, { currentYear: 2026 });
      assert.equal(result.valid, false);
      assert.ok(result.errors[key]);
    });
  }

  test("rejects empty year", () => {
    const result = validateRequiredFields({ ...valid, year: "" }, { currentYear: 2026 });
    assert.equal(result.valid, false);
    assert.ok(result.errors.year);
  });

  test("rejects a non-integer year", () => {
    const result = validateRequiredFields({ ...valid, year: "2024.5" }, { currentYear: 2026 });
    assert.equal(result.valid, false);
    assert.ok(result.errors.year);
  });

  test("rejects a non-numeric year", () => {
    const result = validateRequiredFields({ ...valid, year: "abcd" }, { currentYear: 2026 });
    assert.equal(result.valid, false);
    assert.ok(result.errors.year);
  });

  test("rejects a year below 2000", () => {
    const result = validateRequiredFields({ ...valid, year: "1999" }, { currentYear: 2026 });
    assert.equal(result.valid, false);
    assert.ok(result.errors.year);
  });

  test("rejects a year beyond currentYear + 1", () => {
    const result = validateRequiredFields({ ...valid, year: "2028" }, { currentYear: 2026 });
    assert.equal(result.valid, false);
    assert.ok(result.errors.year);
  });

  test("accepts the boundary year 2000", () => {
    const result = validateRequiredFields({ ...valid, year: "2000" }, { currentYear: 2026 });
    assert.equal(result.valid, true);
  });

  test("accepts the boundary year currentYear + 1", () => {
    const result = validateRequiredFields({ ...valid, year: "2027" }, { currentYear: 2026 });
    assert.equal(result.valid, true);
  });
});

describe("slugify", () => {
  test("lowercases and hyphenates", () => {
    assert.equal(slugify("PIE"), "pie");
  });

  test("matches scripts/build_data.py's slugify() on the known comma-bearing case", () => {
    // scripts/build_data.py's slugify() was verified against this exact
    // abbreviation during the original site build -- the JS port must
    // produce byte-identical output, since build_data.py's own slugify()
    // (not this one) is what's authoritative once a submission is merged,
    // but this copy needs to already show the same value during PR review.
    assert.equal(slugify("LAPS, VisExPreS"), "laps-visexpres");
  });

  test("collapses repeated separators and trims leading/trailing hyphens", () => {
    assert.equal(slugify("  Foo -- Bar!! "), "foo-bar");
  });
});

describe("inputDataCategory", () => {
  test("buckets a Specific: value", () => {
    assert.equal(inputDataCategory("Specific: scRNA-seq"), "Specific");
  });

  test("passes through a non-Specific value unchanged", () => {
    assert.equal(inputDataCategory("Numeric"), "Numeric");
  });
});

describe("outputFormatCategory", () => {
  test("buckets an FI: Model-Derived sub-type", () => {
    assert.equal(outputFormatCategory("FI: Model-Derived (LR)"), "FI: Model-Derived");
  });

  test("buckets an FI: Statistics sub-type", () => {
    assert.equal(outputFormatCategory("FI: Statistics (Correlation)"), "FI: Statistics");
  });

  test("passes through a non-FI value unchanged", () => {
    assert.equal(outputFormatCategory("LD Geometric"), "LD Geometric");
  });
});

describe("buildSubmissionRecord", () => {
  const baseValues = {
    abbreviation: "FooBar",
    title: "A Title",
    authors: "Doe, Jane",
    year: "2026",
    url: "https://example.com",
    github: "",
    task: [],
    target: [],
    drRequirements: [],
    inputData: [],
    outputFormat: [],
    outputComplexity: [],
    interactive: [],
    layoutEnrichment: [],
    evaluationType: [],
    quantitativeMeasures: [],
  };

  test("produces the exact key set and order of papers/*.json", () => {
    const record = buildSubmissionRecord(baseValues);
    assert.deepEqual(Object.keys(record), [
      "abbreviation",
      "title",
      "authors",
      "year",
      "url",
      "github",
      "task",
      "target",
      "drRequirements",
      "inputData",
      "outputFormat",
      "outputComplexity",
      "interactive",
      "layoutEnrichment",
      "evaluationType",
      "quantitativeMeasures",
      "inputDataCategories",
      "outputFormatCategories",
      "slug",
    ]);
  });

  test("year is a number, not a string", () => {
    const record = buildSubmissionRecord(baseValues);
    assert.equal(typeof record.year, "number");
    assert.equal(record.year, 2026);
  });

  test("empty GitHub input produces null, not an empty string", () => {
    const record = buildSubmissionRecord(baseValues);
    assert.equal(record.github, null);
  });

  test("a filled GitHub input is kept as a string", () => {
    const record = buildSubmissionRecord({ ...baseValues, github: "https://github.com/x/y" });
    assert.equal(record.github, "https://github.com/x/y");
  });

  test("every taxonomy field is an array, including an empty one for an unselected category", () => {
    const record = buildSubmissionRecord(baseValues);
    for (const key of ["task", "target", "drRequirements", "outputComplexity"]) {
      assert.ok(Array.isArray(record[key]));
    }
    assert.deepEqual(record.task, []);
  });

  test("derives inputDataCategories/outputFormatCategories from inputData/outputFormat", () => {
    const record = buildSubmissionRecord({
      ...baseValues,
      inputData: ["Specific: scRNA-seq"],
      outputFormat: ["FI: Model-Derived (LR)"],
    });
    assert.deepEqual(record.inputDataCategories, ["Specific"]);
    assert.deepEqual(record.outputFormatCategories, ["FI: Model-Derived"]);
  });

  test("derives slug from abbreviation", () => {
    const record = buildSubmissionRecord({ ...baseValues, abbreviation: "LAPS, VisExPreS" });
    assert.equal(record.slug, "laps-visexpres");
  });

  test("strips embedded CR/LF from single-line fields", () => {
    const record = buildSubmissionRecord({ ...baseValues, abbreviation: "Foo\r\nBar" });
    assert.equal(record.abbreviation, "Foo Bar");
  });
});

describe("buildSubmissionFilename", () => {
  test("is deterministic given an injected timestamp", () => {
    assert.equal(
      buildSubmissionFilename("PIE", 1234567890),
      "papers/submissions/pie-1234567890.json"
    );
  });

  test("produces a path under papers/submissions/", () => {
    const filename = buildSubmissionFilename("FooBar", 1);
    assert.ok(filename.startsWith("papers/submissions/"));
    assert.ok(filename.endsWith(".json"));
  });
});

describe("composeGithubNewFileUrl", () => {
  test("produces a URL under the configured owner/repo/branch", () => {
    const url = composeGithubNewFileUrl({
      owner: "aida-ugent",
      repo: "drx-survey-browser",
      branch: "main",
      filename: "papers/submissions/foo-1.json",
      content: "{}",
    });
    assert.ok(url.startsWith("https://github.com/aida-ugent/drx-survey-browser/new/main?"));
  });

  test("filename and content round-trip correctly through URLSearchParams", () => {
    const filename = "papers/submissions/foo-1.json";
    const content = JSON.stringify({ a: "A & B # C", b: "line1\nline2" }, null, 2);
    const url = composeGithubNewFileUrl({
      owner: "o",
      repo: "r",
      branch: "main",
      filename,
      content,
    });
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("filename"), filename);
    assert.equal(parsed.searchParams.get("value"), content);
  });

  test("resulting URL is parseable and has no stray query separators", () => {
    const url = composeGithubNewFileUrl({
      owner: "o",
      repo: "r",
      branch: "main",
      filename: "papers/submissions/x.json",
      content: "value with & and # and \" and \n newlines",
    });
    const parsed = new URL(url); // throws if malformed
    assert.equal(parsed.searchParams.getAll("filename").length, 1);
    assert.equal(parsed.searchParams.getAll("value").length, 1);
  });
});
