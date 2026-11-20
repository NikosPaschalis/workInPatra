import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

export class CredentialStore {
  constructor(directory, safeStorage) {
    this.directory = directory;
    this.filePath = path.join(directory, "github-token.bin");
    this.safeStorage = safeStorage;
    this.sessionToken = null;
  }

  async set(token, { persist = true } = {}) {
    const value = String(token || "").trim();
    if (!value) throw new Error("A GitHub token is required");
    this.sessionToken = value;
    if (!persist) return;
    if (!await this.safeStorage.isAsyncEncryptionAvailable()) {
      throw new Error("OS credential encryption is unavailable; use session-only authentication");
    }
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.filePath, await this.safeStorage.encryptStringAsync(value), { mode: 0o600 });
  }

  async get() {
    if (this.sessionToken) return this.sessionToken;
    try {
      if (!await this.safeStorage.isAsyncEncryptionAvailable()) return null;
      const encrypted = await readFile(this.filePath);
      const decrypted = await this.safeStorage.decryptStringAsync(encrypted);
      this.sessionToken = decrypted.result;
      if (decrypted.shouldReEncrypt) {
        await writeFile(this.filePath, await this.safeStorage.encryptStringAsync(this.sessionToken), { mode: 0o600 });
      }
      return this.sessionToken;
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw new Error("Stored GitHub credential could not be decrypted");
    }
  }

  async has() {
    return Boolean(await this.get());
  }

  async clear() {
    this.sessionToken = null;
    await unlink(this.filePath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}
