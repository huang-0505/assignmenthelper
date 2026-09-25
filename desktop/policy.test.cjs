const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PRODUCTION, trustedPage, allowedPermission } = require("./policy.cjs");
test("native bridge trusts only the dedicated same-origin desktop page", () => {
  assert.equal(trustedPage(`${PRODUCTION}/desktop`), true);
  for (const url of [
    `${PRODUCTION}/study`,
    `${PRODUCTION}.evil.example/desktop`,
    "file:///desktop",
    "javascript:alert(1)",
    "https://evil.example/desktop",
    "bad",
  ])
    assert.equal(trustedPage(url), false);
});
test("camera-only media permissions; no microphone or arbitrary device access", () => {
  assert.equal(allowedPermission("media", { mediaTypes: ["video"] }), true);
  assert.equal(allowedPermission("media", { mediaType: "video" }), true);
  for (const details of [
    {},
    { mediaTypes: [] },
    { mediaTypes: ["audio"] },
    { mediaTypes: ["audio", "video"] },
  ])
    assert.equal(allowedPermission("media", details), false);
  for (const permission of [
    "geolocation",
    "clipboard-read",
    "openExternal",
    "fileSystem",
    "hid",
    "notifications",
  ])
    assert.equal(allowedPermission(permission), false);
});
