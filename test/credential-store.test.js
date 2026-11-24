import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CredentialStore } from "../apps/desktop-scraper/src/main/credential-store.js";

const encryptedStorage = {
  isAsyncEncryptionAvailable: async () => true,
  encryptStringAsync: async (value) => Buffer.from(`encrypted:${value}`, "utf8"),
  decryptStringAsync: async (value) => ({
    result: value.toString("utf8").replace(/^encrypted:/, ""),
    shouldReEncrypt: false,
  }),
};

test("credential store trims, encrypts and restores a persisted token", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "workinpatra-credentials-"));
  const store = new CredentialStore(directory, encryptedStorage);
  await store.set("  test-token-value  ");
  assert.equal(await store.get(), "test-token-value");
  const restored = new CredentialStore(directory, encryptedStorage);
  assert.equal(await restored.get(), "test-token-value");
});

test("failed persistence does not leave an authenticated session token", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "workinpatra-credentials-"));
  const unavailable = { isAsyncEncryptionAvailable: async () => false };
  const store = new CredentialStore(directory, unavailable);
  await assert.rejects(() => store.set("test-token-value"), /encryption is unavailable/);
  assert.equal(await store.has(), false);
});
