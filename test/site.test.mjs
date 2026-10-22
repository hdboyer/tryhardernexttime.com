import assert from "node:assert/strict";
import test from "node:test";
import { parsePhotoFilename, sortPosts, validateSiteConfig } from "../scripts/build.mjs";
import { decodeGitHubContent, validateState } from "../state-utils.js";

const validConfig = {
  brand: "OnlyTryHards",
  description: "A parody.",
  profile: {
    displayName: "Try Harder",
    handle: "@tryharder",
    bio: "Maximum effort.",
    initials: "TH",
    fanCount: "7",
    effortScore: "110%",
  },
  ads: [{ headline: "Fake", copy: "Not real.", cta: "Do nothing" }],
  modalAd: { headline: "Fake", copy: "Still not real.", cta: "Close" },
};

test("photo filenames produce dates and human captions", () => {
  assert.deepEqual(parsePhotoFilename("2026-10-21--he-thought-this-was-a-fit.jpg"), {
    id: "2026-10-21--he-thought-this-was-a-fit",
    date: "2026-10-21",
    slug: "he-thought-this-was-a-fit",
    caption: "He Thought This Was A Fit",
  });
});

test("invalid filenames, dates, and extensions are rejected", () => {
  assert.equal(parsePhotoFilename("photo.jpg"), null);
  assert.equal(parsePhotoFilename("2026-02-30--impossible.jpg"), null);
  assert.equal(parsePhotoFilename("2026-10-21--caption.gif"), null);
  assert.equal(parsePhotoFilename("2026-10-21--Caption.jpg"), null);
});

test("posts sort newest first with deterministic tie breaking", () => {
  const result = sortPosts([
    { id: "2025-01-01--a", date: "2025-01-01" },
    { id: "2026-01-01--a", date: "2026-01-01" },
    { id: "2026-01-01--b", date: "2026-01-01" },
  ]);
  assert.deepEqual(result.map(({ id }) => id), ["2026-01-01--b", "2026-01-01--a", "2025-01-01--a"]);
});

test("site config accepts the documented schema", () => {
  assert.equal(validateSiteConfig(structuredClone(validConfig)).brand, "OnlyTryHards");
});

test("site config rejects missing copy and malformed ads", () => {
  const missingBio = structuredClone(validConfig);
  delete missingBio.profile.bio;
  assert.throws(() => validateSiteConfig(missingBio), /profile.bio/);
  const noAds = structuredClone(validConfig);
  noAds.ads = [];
  assert.throws(() => validateSiteConfig(noAds), /ads/);
});

test("control state is strict and fail-closed", () => {
  assert.equal(validateState({ enabled: false }), true);
  assert.equal(validateState({ enabled: true }), true);
  assert.equal(validateState({ enabled: true, surprise: true }), false);
  assert.equal(validateState({ enabled: "yes" }), false);
  assert.equal(validateState(null), false);
});

test("GitHub base64 response decodes only a valid state", () => {
  const content = Buffer.from(JSON.stringify({ enabled: false })).toString("base64");
  assert.deepEqual(decodeGitHubContent({ encoding: "base64", content }), { enabled: false });
  const invalid = Buffer.from(JSON.stringify({ enabled: 1 })).toString("base64");
  assert.throws(() => decodeGitHubContent({ encoding: "base64", content: invalid }), /Invalid site state/);
  assert.throws(() => decodeGitHubContent({ encoding: "utf8", content: "{}" }), /Unexpected GitHub/);
});
