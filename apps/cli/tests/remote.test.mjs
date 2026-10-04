import assert from "node:assert/strict";
import { test } from "node:test";

import { renderTunnelConfig, validateRemoteConfig } from "../bin/remote.mjs";

const config = {
  origin: "https://phraseweave.example.com",
  tunnelId: "12345678-1234-1234-1234-123456789abc",
  credentialsFile: "/tmp/tunnel.json",
  teamName: "phraseweave",
  audTag: "aud-tag",
};

test("tunnel follows the chosen page port and checks Access before proxying", () => {
  const yaml = renderTunnelConfig(config, "http://127.0.0.1:43127/");
  assert.match(yaml, /service: "http:\/\/127\.0\.0\.1:43127"/);
  assert.match(yaml, /httpHostHeader: "127\.0\.0\.1:43127"/);
  assert.match(yaml, /required: true/);
  assert.match(yaml, /aud-tag/);
});

test("remote origin must be a plain HTTPS hostname", () => {
  assert.equal(validateRemoteConfig(config).origin, config.origin);
  assert.throws(() =>
    validateRemoteConfig({ ...config, origin: "http://phraseweave.example.com" }),
  );
  assert.throws(() =>
    validateRemoteConfig({ ...config, origin: "https://user:pass@phraseweave.example.com" }),
  );
});
