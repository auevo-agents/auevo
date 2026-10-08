import { describe, expect, it } from "vitest";
import { buildDocsCorpus } from "./docs-corpus";

describe("buildDocsCorpus", () => {
  it("flattens every doc section into non-empty text", () => {
    const corpus = buildDocsCorpus();
    expect(corpus.length).toBeGreaterThan(1000);
    expect(corpus).toContain("Welcome to Auevo");
  });

  it("is stable across calls (same cached source, no randomness)", () => {
    expect(buildDocsCorpus()).toBe(buildDocsCorpus());
  });
});
