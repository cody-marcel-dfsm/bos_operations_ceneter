import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  createHttpDebugFetch,
  createProtocolDebugLogger,
  redactDebugValue
} from "./http-debug-log.mjs";
import { codexRawAppId } from "./package-model.mjs";

const requestTimeoutMs = 30_000;
const maximumDiagnosticErrorCharacters = 4_096;
const maximumDiagnosticErrorSourceCharacters = 8_192;
const execFileAsync = promisify(execFile);
const accountApiRoot = "https://chatgpt.com/backend-api/aip/connectors";

function diagnosticError(error) {
  const name = String(error?.name ?? "Error").slice(0, 256);
  const message = String(
    redactDebugValue(error?.message ?? String(error))
  ).slice(0, maximumDiagnosticErrorCharacters);
  const sanitized = new Error(message);
  sanitized.name = name;
  return sanitized;
}

function protocolFailure(method, error) {
  const redacted = redactDebugValue(error);
  return diagnosticError(new Error(
    `Codex app server ${method} failed: ${JSON.stringify(redacted)}`
  ));
}

export class CodexAppServerSession {
  constructor({
    command = "codex",
    cwd = process.cwd(),
    spawnProcess = spawn,
    debug = process.env.BOS_HTTP_DEBUG !== "0",
    debugWriter
  } = {}) {
    this.trace = createProtocolDebugLogger({
      enabled: debug,
      writer: debugWriter,
      source: "codex-app-server"
    });
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
    this.child.stderr.on("data", (chunk) => {
      if (this.stderr.length >= maximumDiagnosticErrorSourceCharacters) return;
      this.stderr += String(chunk).slice(
        0,
        maximumDiagnosticErrorSourceCharacters - this.stderr.length
      );
    });
    this.child.stdout.on("data", (chunk) => this.consume(chunk));
    this.child.on("error", (error) => this.rejectAll(error));
    this.child.on("exit", (code, signal) => {
      if (!this.pending.size) return;
      this.rejectAll(diagnosticError(new Error(
        `Codex app server exited before responding (${code ?? signal}): ${this.stderr.trim()}`
      )));
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
      this.trace.write({
        event: "protocol.response",
        request_id: pending.requestId,
        protocol_id: message.id,
        method: pending.method,
        duration_ms: Date.now() - pending.startedAt,
        ok: !message.error,
        summary: pending.method === "plugin/read" && message.result?.plugin
          ? {
              plugin_id: message.result.plugin.summary?.id ?? null,
              version: message.result.plugin.summary?.localVersion ?? null,
              installed: message.result.plugin.summary?.installed ?? null,
              enabled: message.result.plugin.summary?.enabled ?? null,
              apps: message.result.plugin.apps ?? [],
              app_templates: message.result.plugin.appTemplates ?? [],
              mcp_servers: message.result.plugin.mcpServers ?? []
            }
          : null,
        payload: message.error ?? message.result
      });
      if (message.error) {
        pending.reject(protocolFailure(pending.method, message.error));
      } else pending.resolve(message.result);
    }
  }

  rejectAll(error) {
    const sanitizedError = diagnosticError(error);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      this.trace.write({
        event: "protocol.error",
        request_id: pending.requestId,
        method: pending.method,
        duration_ms: Date.now() - pending.startedAt,
        error: {
          name: sanitizedError.name,
          message: sanitizedError.message
        }
      });
      pending.reject(sanitizedError);
    }
    this.pending.clear();
  }

  request(method, params = {}) {
    const id = this.nextId++;
    const requestId = this.trace.nextRequestId();
    const startedAt = Date.now();
    this.trace.write({
      event: "protocol.request",
      request_id: requestId,
      protocol_id: id,
      method,
      payload: params
    });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        this.trace.write({
          event: "protocol.error",
          request_id: requestId,
          protocol_id: id,
          method,
          duration_ms: Date.now() - startedAt,
          error: { name: "TimeoutError", message: `Timed out waiting for ${method}` }
        });
        reject(new Error(`Timed out waiting for Codex app server ${method}`));
      }, requestTimeoutMs);
      this.pending.set(id, {
        method,
        requestId,
        startedAt,
        resolve,
        reject,
        timeout
      });
      this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  notify(method, params) {
    const message = params === undefined ? { method } : { method, params };
    this.trace.write({
      event: "protocol.notification",
      method,
      payload: params ?? null
    });
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  async initialize() {
    await this.request("initialize", {
      clientInfo: { name: "bos-codex-account-plugin-client", version: "1" }
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
  const rawAppId = String(appId).replace(/^plugin_/, "");
  const remotePluginId = `plugin_${rawAppId}`;
  const suffix = rawAppId.replace(/^asdk_app_/, "");
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
  const debug = options.debug ?? process.env.BOS_HTTP_DEBUG !== "0";
  const debugWriter = options.debugWriter;
  const accountRequest = createHttpDebugFetch(fetchRequest, {
    enabled: debug,
    writer: debugWriter,
    source: "codex-connector-api"
  });

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
      response = await accountRequest(`${accountApiRoot}/${appId}`, {
        method: "DELETE",
        headers
      });
      const contentType = response.headers?.get?.("content-type") ?? "";
      if (response.status !== 403 || !contentType.includes("text/html")) break;
      await response.text();
    }
    if (response.status === 404) return { alreadyAbsent: true };
    if (!response.ok) {
      throw new Error(`Codex account app deletion failed with HTTP ${response.status}`);
    }
    return { alreadyAbsent: false };
  }

  return {
    async readPlugin({ pluginName, marketplacePath }) {
      return withSession((session) => session.request("plugin/read", {
        pluginName,
        marketplacePath
      }));
    },
    async inspect(appId) {
      return withSession(async (session) => bosAccountPlugins(await list(session), appId));
    },
    async inspectSharedPlugins() {
      return withSession((session) => session.request("plugin/share/list", {}));
    },
    async updateEstablishedProduct(pluginPath, { remotePluginId } = {}) {
      if (!/^plugin_asdk_app_[a-z0-9]+$/.test(remotePluginId ?? "")) {
        throw new Error("Established product metadata updates require the permanent plugin_asdk_app ID");
      }
      return withSession((session) => session.request("plugin/share/save", {
        pluginPath,
        remotePluginId,
        discoverability: "PRIVATE",
        shareTargets: []
      }));
    },
    async provisionNewProduct(pluginPath) {
      return withSession((session) => session.request("plugin/share/save", {
        pluginPath,
        remotePluginId: null,
        discoverability: "PRIVATE",
        shareTargets: []
      }));
    },
    async inspectAppContent(appId) {
      if (!/^asdk_app_[a-z0-9]+$/.test(appId)) {
        throw new Error(`Invalid canonical Codex app ID: ${appId}`);
      }
      return withSession((session) => session.request("app/read", {
        appIds: [appId]
      }));
    },
    async inspectAppListing(appId, options = {}) {
      if (!/^asdk_app_[a-z0-9]+$/.test(appId)) {
        throw new Error(`Invalid canonical Codex app ID: ${appId}`);
      }
      const limit = options.limit ?? 200;
      const maxPages = options.maxPages ?? 50;
      if (!Number.isSafeInteger(limit) || limit < 1) {
        throw new Error("Codex app-list page size must be a positive integer");
      }
      if (!Number.isSafeInteger(maxPages) || maxPages < 1) {
        throw new Error("Codex app-list max pages must be a positive integer");
      }
      return withSession(async (session) => {
        let cursor = null;
        let pagesScanned = 0;
        let recordsScanned = 0;
        while (pagesScanned < maxPages) {
          const response = await session.request("app/list", {
            cursor,
            forceRefetch: pagesScanned === 0 && options.forceRefetch !== false,
            limit
          });
          const apps = response?.data ?? [];
          pagesScanned += 1;
          recordsScanned += apps.length;
          const app = apps.find(({ id }) => id === appId) ?? null;
          if (app) {
            return {
              app,
              pages_scanned: pagesScanned,
              records_scanned: recordsScanned,
              exhausted: false,
              next_cursor: response?.nextCursor ?? null
            };
          }
          cursor = response?.nextCursor ?? null;
          if (!cursor) {
            return {
              app: null,
              pages_scanned: pagesScanned,
              records_scanned: recordsScanned,
              exhausted: true,
              next_cursor: null
            };
          }
        }
        return {
          app: null,
          pages_scanned: pagesScanned,
          records_scanned: recordsScanned,
          exhausted: false,
          next_cursor: cursor
        };
      });
    },
    async inspectConnector(appId) {
      // Product/package declarations use plugin_asdk_app_* while the account
      // connector endpoint owns raw asdk_app_* records. Normalize exactly at
      // this boundary so every caller reaches the same immutable remote ID.
      const rawAppId = codexRawAppId(appId);
      if (!/^asdk_app_[a-z0-9]+$/.test(rawAppId)) {
        throw new Error(`Invalid Codex connector ID: ${appId}`);
      }
      const headers = await accountHeaders();
      let response;
      let text;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        response = await accountRequest(`${accountApiRoot}/${rawAppId}`, {
          method: "GET",
          headers
        });
        const contentType = response.headers?.get?.("content-type") ?? "";
        if (response.status !== 403 || !contentType.includes("text/html")) break;
        if (attempt < 2) await response.text();
      }
      text = await response.text();
      let body = text;
      try {
        body = JSON.parse(text);
      } catch {
        // Preserve a non-JSON diagnostic response as text.
      }
      return {
        app_id: rawAppId,
        http_status: response.status,
        ok: response.ok,
        body: redactDebugValue(body)
      };
    },
    async remove(appId) {
      return removeAccountApp(appId);
    }
  };
}
