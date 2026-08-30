import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const requestTimeoutMs = 30_000;
const execFileAsync = promisify(execFile);
const accountApiRoot = "https://chatgpt.com/backend-api/aip/connectors";

class CodexAppServerSession {
  constructor({ command = "codex", cwd = process.cwd(), spawnProcess = spawn } = {}) {
    this.child = spawnProcess(command, ["app-server", "--stdio"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.nextId = 1;
    this.pending = new Map();
    this.stderr = "";
    this.buffer = "";
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk) => { this.stderr += chunk; });
    this.child.stdout.on("data", (chunk) => this.consume(chunk));
    this.child.on("error", (error) => this.rejectAll(error));
    this.child.on("exit", (code, signal) => {
      if (!this.pending.size) return;
      this.rejectAll(new Error(
        `Codex app server exited before responding (${code ?? signal}): ${this.stderr.trim()}`
      ));
    });
  }

  consume(chunk) {
    this.buffer += chunk;
    while (this.buffer.includes("\n")) {
      const index = this.buffer.indexOf("\n");
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (message.id === undefined) continue;
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) {
        pending.reject(new Error(
          `Codex app server ${pending.method} failed: ${JSON.stringify(message.error)}`
        ));
      } else pending.resolve(message.result);
    }
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  request(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for Codex app server ${method}`));
      }, requestTimeoutMs);
      this.pending.set(id, { method, resolve, reject, timeout });
      this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  notify(method, params) {
    const message = params === undefined ? { method } : { method, params };
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  async initialize() {
    await this.request("initialize", {
      clientInfo: { name: "bos-all-client-uninstaller", version: "1" }
    });
    this.notify("initialized");
  }

  close() {
    this.child.stdin.end();
    this.child.kill("SIGTERM");
  }
}

function createdByMePlugins(listing) {
  return (listing?.marketplaces ?? [])
    .filter((entry) => entry.name === "created-by-me-remote")
    .flatMap((entry) => entry.plugins ?? []);
}

export function bosAccountPlugins(listing, appId) {
  const remotePluginId = `plugin_${appId}`;
  const suffix = appId.replace(/^asdk_app_/, "");
  return createdByMePlugins(listing).filter((plugin) =>
    plugin.remotePluginId === remotePluginId ||
    plugin.id === `dev-${suffix}@created-by-me-remote`
  );
}

export function createCodexAccountPluginClient(options = {}) {
  const command = options.command ?? "codex";
  const authPath = options.authPath ?? join(homedir(), ".codex", "auth.json");
  const fetchRequest = options.fetchRequest ?? fetch;
  const runCommand = options.runCommand ?? execFileAsync;

  async function withSession(callback) {
    const session = new CodexAppServerSession(options);
    try {
      await session.initialize();
      return await callback(session);
    } finally {
      session.close();
    }
  }

  async function list(session) {
    return session.request("plugin/list", {
      cwds: [],
      forceRefetch: true,
      marketplaceKinds: ["created-by-me-remote"]
    });
  }

  async function accountHeaders() {
    const auth = JSON.parse(await readFile(authPath, "utf8"));
    const accessToken = auth?.tokens?.access_token;
    const accountId = auth?.tokens?.account_id;
    if (!accessToken || !accountId) {
      throw new Error("Codex ChatGPT authentication is unavailable; run codex login first");
    }
    const versionResult = await runCommand(command, ["--version"]);
    const version = String(versionResult?.stdout ?? versionResult).trim()
      .replace(/^codex-cli\s+/, "");
    if (!version) throw new Error("Could not determine the Codex client version");
    return {
      Authorization: `Bearer ${accessToken}`,
      "ChatGPT-Account-Id": accountId,
      "User-Agent": `codex_cli_rs/${version}`
    };
  }

  async function removeAccountApp(appId) {
    if (!/^asdk_app_[a-z0-9]+$/.test(appId)) {
      throw new Error(`Refusing to delete an invalid Codex account app ID: ${appId}`);
    }
    const headers = await accountHeaders();
    let response;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetchRequest(`${accountApiRoot}/${appId}`, {
        method: "DELETE",
        headers
      });
      const contentType = response.headers?.get?.("content-type") ?? "";
      if (response.status !== 403 || !contentType.includes("text/html")) break;
      await response.text?.();
    }
    if (response.status === 404) return { alreadyAbsent: true };
    if (!response.ok) {
      throw new Error(`Codex account app deletion failed with HTTP ${response.status}`);
    }
    return { alreadyAbsent: false };
  }

  return {
    async inspect(appId) {
      return withSession(async (session) => bosAccountPlugins(await list(session), appId));
    },
    async inspectSharedPlugins() {
      return withSession((session) => session.request("plugin/share/list", {}));
    },
    async remove(appId) {
      return removeAccountApp(appId);
    }
  };
}
