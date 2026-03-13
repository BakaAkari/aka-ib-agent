"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  Config: () => Config,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_koishi = require("koishi");
var name = "aka-ibkr-agent";
var inject = ["http"];
var responseModeSchema = import_koishi.Schema.union([
  import_koishi.Schema.const("brief").description("\u9002\u5408\u5E38\u89C4\u804A\u5929"),
  import_koishi.Schema.const("full").description("\u8FD4\u56DE\u66F4\u5B8C\u6574\u6587\u672C"),
  import_koishi.Schema.const("push").description("\u9002\u5408\u8F6C\u53D1\u548C\u63A8\u9001")
]).role("radio");
var Config = import_koishi.Schema.intersect([
  import_koishi.Schema.object({
    baseUrl: import_koishi.Schema.string().default("http://127.0.0.1:8000").description("ibkr \u670D\u52A1\u57FA\u7840\u5730\u5740"),
    timeout: import_koishi.Schema.number().min(1e3).max(12e4).default(3e4).description("\u8BF7\u6C42\u8D85\u65F6\uFF0C\u5355\u4F4D\u6BEB\u79D2"),
    authToken: import_koishi.Schema.string().role("secret").default("").description("\u53EF\u9009 Bearer Token"),
    defaultResponseMode: responseModeSchema.default("brief").description("\u9ED8\u8BA4\u8F93\u51FA\u6A21\u5F0F"),
    showDiagnostics: import_koishi.Schema.boolean().default(false).description("\u9644\u52A0\u4E0A\u6E38\u6765\u6E90\u548C\u9519\u8BEF\u4FE1\u606F"),
    minAuthority: import_koishi.Schema.number().min(0).max(5).default(4).description("\u6700\u5C0F authority\uFF0C\u9ED8\u8BA4\u4EC5\u7BA1\u7406\u5458\u53EF\u7528"),
    allowedUsers: import_koishi.Schema.array(String).role("table").default([]).description("\u989D\u5916\u5141\u8BB8\u7684\u7528\u6237\u5217\u8868\uFF0C\u652F\u6301 userId \u6216 platform:userId")
  }).description("\u670D\u52A1\u8BBE\u7F6E"),
  import_koishi.Schema.object({
    chatCommandName: import_koishi.Schema.string().default("ib").description("\u4E3B\u804A\u5929\u547D\u4EE4\u540D"),
    commandAliases: import_koishi.Schema.array(String).role("table").default(["ibchat", "ibkr"]).description("\u517C\u5BB9\u547D\u4EE4\u522B\u540D")
  }).description("\u547D\u4EE4\u5165\u53E3"),
  import_koishi.Schema.object({
    enableMiddleware: import_koishi.Schema.boolean().default(false).description("\u542F\u7528\u804A\u5929\u5F0F\u8F6C\u53D1"),
    middlewarePrefixes: import_koishi.Schema.array(String).role("table").default(["ib ", "ibkr "]).description("\u804A\u5929\u89E6\u53D1\u524D\u7F00"),
    middlewareResponseMode: responseModeSchema.default("brief").description("\u804A\u5929\u5165\u53E3\u8F93\u51FA\u6A21\u5F0F"),
    allowDirectChat: import_koishi.Schema.boolean().default(false).description("\u79C1\u804A\u5141\u8BB8\u4E0D\u5E26\u524D\u7F00\u76F4\u63A5\u8F6C\u53D1"),
    ignoreSelf: import_koishi.Schema.boolean().default(true).description("\u5FFD\u7565\u673A\u5668\u4EBA\u81EA\u8EAB\u6D88\u606F"),
    privateOnly: import_koishi.Schema.boolean().default(false).description("\u4EC5\u5728\u79C1\u804A\u89E6\u53D1\u804A\u5929\u8F6C\u53D1"),
    platforms: import_koishi.Schema.array(String).role("table").default([]).description("\u5141\u8BB8\u89E6\u53D1\u7684\u5E73\u53F0\u767D\u540D\u5355\uFF0C\u4E3A\u7A7A\u8868\u793A\u4E0D\u9650"),
    channelWhitelist: import_koishi.Schema.array(String).role("table").default([]).description("\u5141\u8BB8\u89E6\u53D1\u7684\u9891\u9053\u767D\u540D\u5355\uFF0C\u683C\u5F0F platform:channelId")
  }).description("\u804A\u5929\u5165\u53E3")
]);
var RESPONSE_MODES = /* @__PURE__ */ new Set(["brief", "full", "push"]);
function apply(ctx, config) {
  const logger = ctx.logger(name);
  const client = new IbkrClient(ctx, config);
  const commandNames = [config.chatCommandName, ...config.commandAliases].filter(Boolean);
  const chatCommand = ctx.command(`${config.chatCommandName} [message:text]`, "\u5C06\u81EA\u7136\u8BED\u8A00\u8BF7\u6C42\u8F6C\u53D1\u7ED9 ibkr \u5206\u6790\u670D\u52A1").userFields(["authority"]).option("mode", "-m <mode:string> \u6307\u5B9A\u8F93\u51FA\u6A21\u5F0F brief/full/push").option("full", "-f \u4F7F\u7528 full \u8F93\u51FA").option("push", "-p \u4F7F\u7528 push \u8F93\u51FA").option("allowExecution", "-e \u5141\u8BB8\u4E0A\u6E38\u5C1D\u8BD5\u8FDB\u5165\u6267\u884C\u5206\u652F").option("diagnostics", "-d \u672C\u6B21\u663E\u793A\u8BCA\u65AD\u4FE1\u606F").action(async ({ options, session }, message) => {
    const resolvedOptions = options ?? {};
    const permissionError = getPermissionError(session, config);
    if (permissionError) {
      return permissionError;
    }
    const content = message?.trim();
    if (!content) {
      return "\u8BF7\u8F93\u5165\u8981\u8F6C\u53D1\u7ED9 ibkr \u7684\u5185\u5BB9\u3002";
    }
    const responseMode = resolveResponseMode(
      resolvedOptions.mode,
      resolvedOptions.full,
      resolvedOptions.push,
      config.defaultResponseMode
    );
    const result = await client.analyze({
      message: content,
      mode: "command",
      response_mode: responseMode,
      account_scope: "primary",
      allow_execution: Boolean(resolvedOptions.allowExecution)
    });
    if (!result.ok) {
      return result.message;
    }
    return renderResponse(result.data, shouldShowDiagnostics(config, resolvedOptions.diagnostics), session);
  });
  for (const alias of config.commandAliases) {
    chatCommand.alias(alias);
  }
  const healthCommand = ctx.command(`${config.chatCommandName}.health`, "\u68C0\u67E5 ibkr \u670D\u52A1\u5065\u5EB7\u72B6\u6001").userFields(["authority"]).action(async ({ session }) => {
    const permissionError = getPermissionError(session, config);
    if (permissionError) {
      return permissionError;
    }
    const result = await client.health();
    if (!result.ok) {
      return result.message;
    }
    return `ibkr \u670D\u52A1\u6B63\u5E38\uFF0C\u72B6\u6001\uFF1A${result.data.status}`;
  });
  for (const alias of config.commandAliases) {
    healthCommand.alias(`${alias}.health`);
  }
  if (!config.enableMiddleware) {
    logger.info("enabled, baseUrl=%s, middleware=off", normalizeBaseUrl(config.baseUrl));
    return;
  }
  ctx.middleware(async (session, next) => {
    if (shouldSkipSession(session, config)) {
      return next();
    }
    const permissionError = getPermissionError(session, config);
    if (permissionError) {
      return next();
    }
    if (looksLikeCommandInvocation(session.content || "", commandNames)) {
      return next();
    }
    const message = extractMiddlewareMessage(session, config);
    if (!message) {
      return next();
    }
    const result = await client.analyze({
      message,
      mode: "chat",
      response_mode: config.middlewareResponseMode,
      account_scope: "primary",
      allow_execution: false
    });
    if (!result.ok) {
      await session.send(result.message);
      return;
    }
    await session.send(renderResponse(result.data, config.showDiagnostics, session));
  });
  logger.info("enabled, baseUrl=%s, middleware=on", normalizeBaseUrl(config.baseUrl));
}
var IbkrClient = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
  }
  async analyze(payload) {
    try {
      const response = await this.ctx.http.post(this.buildUrl("/api/v1/analyze"), payload, {
        headers: this.buildHeaders(),
        timeout: this.config.timeout
      });
      if (!isAnalyzeResponse(response)) {
        return { ok: false, message: "ibkr \u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u54CD\u5E94\u7ED3\u6784\u3002" };
      }
      return { ok: true, data: response };
    } catch (error) {
      return {
        ok: false,
        message: formatHttpError("\u8C03\u7528 ibkr \u5206\u6790\u63A5\u53E3\u5931\u8D25", error)
      };
    }
  }
  async health() {
    try {
      const response = await this.ctx.http.get(this.buildUrl("/health"), {
        headers: this.buildHeaders(),
        timeout: this.config.timeout
      });
      if (!response || typeof response.status !== "string") {
        return { ok: false, message: "ibkr /health \u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u54CD\u5E94\u7ED3\u6784\u3002" };
      }
      return { ok: true, data: { status: response.status } };
    } catch (error) {
      return {
        ok: false,
        message: formatHttpError("\u8C03\u7528 ibkr health \u63A5\u53E3\u5931\u8D25", error)
      };
    }
  }
  buildUrl(path) {
    return `${normalizeBaseUrl(this.config.baseUrl)}${path}`;
  }
  buildHeaders() {
    if (!this.config.authToken) {
      return void 0;
    }
    return {
      authorization: `Bearer ${this.config.authToken}`
    };
  }
};
function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}
function resolveResponseMode(requestedMode, useFull, usePush, fallback) {
  if (usePush) {
    return "push";
  }
  if (useFull) {
    return "full";
  }
  if (requestedMode && RESPONSE_MODES.has(requestedMode)) {
    return requestedMode;
  }
  return fallback;
}
function renderResponse(response, showDiagnostics, session) {
  const lines = [response.text.trim()];
  if (showDiagnostics) {
    lines.push(
      "",
      `intent=${response.intent}`,
      `decision_level=${response.decision_level}`,
      `generation_source=${response.generation_source}`,
      `context_source=${response.context_source}`
    );
    if (response.context_error) {
      lines.push(`context_error=${response.context_error}`);
    }
    if (response.upstream_status) {
      lines.push(`upstream_status=${response.upstream_status}`);
    }
    if (response.upstream_error_code) {
      lines.push(`upstream_error_code=${response.upstream_error_code}`);
    }
    if (response.upstream_error_message) {
      lines.push(`upstream_error_message=${response.upstream_error_message}`);
    }
  }
  if (response.requires_confirmation && response.action_id && session) {
    lines.push("", `\u5F85\u786E\u8BA4\u52A8\u4F5C\uFF1A${response.action_id}`);
  }
  return lines.join("\n").trim();
}
function shouldShowDiagnostics(config, perCall) {
  return config.showDiagnostics || Boolean(perCall);
}
function getPermissionError(session, config) {
  if (isAllowedUser(session, config.allowedUsers)) {
    return "";
  }
  const authority = getAuthority(session);
  if (authority >= config.minAuthority) {
    return "";
  }
  return "\u6743\u9650\u4E0D\u8DB3\uFF0C\u4EC5\u7BA1\u7406\u5458\u6216\u6388\u6743\u7528\u6237\u53EF\u4F7F\u7528\u6B64\u529F\u80FD\u3002";
}
function shouldSkipSession(session, config) {
  if (config.ignoreSelf && session.userId && session.selfId && session.userId === session.selfId) {
    return true;
  }
  const content = getSessionContent(session);
  if (!content) {
    return true;
  }
  if (config.privateOnly && !isDirectSession(session)) {
    return true;
  }
  if (config.platforms.length > 0 && !config.platforms.includes(session.platform)) {
    return true;
  }
  if (config.channelWhitelist.length > 0) {
    const channelKey = buildChannelKey(session);
    if (!config.channelWhitelist.includes(channelKey)) {
      return true;
    }
  }
  return false;
}
function extractMiddlewareMessage(session, config) {
  const content = getSessionContent(session);
  if (!content) {
    return "";
  }
  const prefixed = stripPrefix(content, config.middlewarePrefixes);
  if (prefixed !== null) {
    return prefixed;
  }
  if (config.allowDirectChat && isDirectSession(session)) {
    return content;
  }
  return "";
}
function getSessionContent(session) {
  return (session.stripped?.content || session.content || "").trim();
}
function stripPrefix(content, prefixes) {
  for (const prefix of prefixes) {
    if (content.startsWith(prefix)) {
      return content.slice(prefix.length).trim();
    }
  }
  return null;
}
function looksLikeCommandInvocation(content, commandNames) {
  const normalized = content.trim();
  return commandNames.some((commandName) => normalized === commandName || normalized.startsWith(`${commandName} `) || normalized.startsWith(`${commandName}.`));
}
function isDirectSession(session) {
  return !session.guildId;
}
function getAuthority(session) {
  return typeof session.user?.authority === "number" ? session.user.authority : -1;
}
function isAllowedUser(session, allowedUsers) {
  if (!session.userId) {
    return false;
  }
  const candidates = /* @__PURE__ */ new Set([
    session.userId,
    `${session.platform}:${session.userId}`
  ]);
  return allowedUsers.some((user) => candidates.has(user));
}
function buildChannelKey(session) {
  return `${session.platform}:${session.channelId || session.userId || "unknown"}`;
}
function isAnalyzeResponse(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value;
  return candidate.status === "ok" && typeof candidate.intent === "string" && typeof candidate.decision_level === "string" && typeof candidate.generation_source === "string" && typeof candidate.context_source === "string" && typeof candidate.text === "string" && typeof candidate.summary === "string" && typeof candidate.reason === "string" && typeof candidate.next_action === "string";
}
function formatHttpError(prefix, error) {
  if (error && typeof error === "object") {
    const candidate = error;
    const parts = [prefix];
    if (candidate.response?.status) {
      parts.push(`status=${candidate.response.status}`);
    }
    if (candidate.message) {
      parts.push(candidate.message);
    }
    if (candidate.response?.data && typeof candidate.response.data === "object") {
      const data = candidate.response.data;
      if (typeof data.detail === "string") {
        parts.push(data.detail);
      } else if (typeof data.message === "string") {
        parts.push(data.message);
      }
    }
    return parts.join("\uFF0C");
  }
  if (typeof error === "string") {
    return `${prefix}\uFF0C${error}`;
  }
  return prefix;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Config,
  apply,
  inject,
  name
});
//# sourceMappingURL=index.cjs.map