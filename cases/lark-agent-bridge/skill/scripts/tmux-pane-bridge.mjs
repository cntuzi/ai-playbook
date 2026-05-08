#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_EVENT_KEY = "im.message.receive_v1";
const STATE_PATH = join(homedir(), ".agents", "run", "lark-agent-bridge", "manager-state.json");
const activeMonitors = new Map();

function parseArgs(argv) {
  const out = { eventKey: DEFAULT_EVENT_KEY, maxConnectionMinutes: 360 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`missing value for ${arg}`);
      return value;
    };
    if (arg === "--profile") out.profile = next();
    else if (arg === "--target") out.target = next();
    else if (arg === "--bot-open-id") out.botOpenId = next();
    else if (arg === "--bot-name") out.botName = next();
    else if (arg === "--event-key") out.eventKey = next();
    else if (arg === "--log") out.logPath = next();
    else if (arg === "--max-connection-minutes") out.maxConnectionMinutes = Number(next());
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() {
  console.log(`tmux-pane-bridge

Usage:
  node tmux-pane-bridge.mjs --profile <lark-cli-profile> --target <tmux-pane>

Options:
  --profile <name>      lark-cli profile name or app id
  --target <pane>       tmux target pane, for example %2
  --bot-open-id <id>    Bot open_id used to skip echo messages
  --bot-name <name>     Display name in injected message headers
  --event-key <key>     Event key. Default: ${DEFAULT_EVENT_KEY}
  --log <path>          Log file path
  --max-connection-minutes <n>
                        Rotate the event connection after n minutes. Default: 360
`);
}

function createLogger(logPath) {
  if (logPath) mkdirSync(dirname(logPath), { recursive: true });
  return (message) => {
    const line = `${new Date().toISOString()} ${message}`;
    if (logPath) appendFileSync(logPath, `${line}\n`);
    console.error(line);
  };
}

function readField(obj, paths) {
  for (const path of paths) {
    let cur = obj;
    let ok = true;
    for (const part of path.split(".")) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, part)) cur = cur[part];
      else {
        ok = false;
        break;
      }
    }
    if (ok && cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return "";
}

function decodeContent(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        return decodeContent(JSON.parse(trimmed));
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(decodeContent).filter(Boolean).join("\n");
  if (typeof value === "object") {
    return value.text || value.content || value.title || JSON.stringify(value);
  }
  return String(value);
}

function extractEvent(obj) {
  const messageId = readField(obj, [
    "message_id",
    "message.message_id",
    "event.message_id",
    "event.message.message_id",
    "header.event_id",
  ]);
  const chatId = readField(obj, [
    "chat_id",
    "message.chat_id",
    "event.chat_id",
    "event.message.chat_id",
  ]);
  const senderId = readField(obj, [
    "sender_id",
    "sender.open_id",
    "sender.sender_id.open_id",
    "event.sender_id",
    "event.sender.open_id",
    "event.sender.sender_id.open_id",
  ]);
  const senderType = readField(obj, [
    "sender_type",
    "sender.sender_type",
    "event.sender_type",
    "event.sender.sender_type",
  ]);
  const messageType = readField(obj, [
    "message_type",
    "message.message_type",
    "event.message_type",
    "event.message.message_type",
  ]);
  const rawContent = readField(obj, [
    "content",
    "text",
    "message.content",
    "event.content",
    "event.message.content",
  ]);
  const parentId = readField(obj, [
    "parent_id",
    "message.parent_id",
    "event.parent_id",
    "event.message.parent_id",
  ]);
  const rootId = readField(obj, [
    "root_id",
    "message.root_id",
    "event.root_id",
    "event.message.root_id",
  ]);
  return {
    messageId: String(messageId || ""),
    chatId: String(chatId || ""),
    senderId: String(senderId || ""),
    senderType: String(senderType || "").toLowerCase(),
    messageType: String(messageType || "text").toLowerCase(),
    text: decodeContent(rawContent).trim(),
    parentId: String(parentId || ""),
    rootId: String(rootId || ""),
  };
}

function tmux(args, options = {}) {
  const result = spawnSync("tmux", args, {
    encoding: options.input ? undefined : "utf8",
    stdio: options.input ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    input: options.input,
  });
  if (result.status !== 0) {
    const detail = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : result.stderr;
    throw new Error(`tmux ${args.join(" ")} failed: ${String(detail || "").trim()}`);
  }
  return result.stdout;
}

function sleepMs(ms) {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, ms);
}

function redactSensitive(value) {
  return String(value || "")
    .replace(/((?:app|client)[_-]?secret["'\s:=]+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .replace(/((?:access|refresh|tenant|user)[_-]?token["'\s:=]+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .replace(/\b(cli|oc|om|ou)_[A-Za-z0-9_-]{12,}\b/g, "$1_[redacted]")
    .replace(/\b[A-Za-z0-9][A-Za-z0-9_-]{31,}\b/g, "[redacted]");
}

function capturePane(target, lines = 220) {
  return String(tmux(["capture-pane", "-p", "-t", target, "-S", `-${lines}`]) || "");
}

function injectIntoPane(target, text) {
  const bufferName = `lark-bridge-${process.pid}-${Date.now()}`;
  tmux(["load-buffer", "-b", bufferName, "-"], { input: Buffer.from(text, "utf8") });
  try {
    tmux(["paste-buffer", "-b", bufferName, "-t", target]);
    sleepMs(500);
    tmux(["send-keys", "-t", target, "Enter"]);
  } finally {
    spawnSync("tmux", ["delete-buffer", "-b", bufferName], { stdio: "ignore" });
  }
}

function readState() {
  if (!existsSync(STATE_PATH)) return { bridges: {} };
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return { bridges: {} };
  }
}

function writeState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function updateLastEvent(profile, event, target, botName) {
  const state = readState();
  state.lastEvents ||= {};
  state.lastEvents[profile] = {
    profile,
    target,
    botName: botName || profile,
    chatId: event.chatId || "",
    messageId: event.messageId || "",
    senderId: event.senderId || "",
    textPreview: event.text.slice(0, 180),
    receivedAt: new Date().toISOString(),
  };
  if (state.bridges?.[profile]) {
    state.bridges[profile].lastMessageAt = state.lastEvents[profile].receivedAt;
  }
  writeState(state);
}

function stripAnsi(value) {
  return String(value || "")
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/[\u001b\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

function normalizePaneLine(line) {
  return redactSensitive(stripAnsi(line))
    .replace(/[│┃▌▐]/g, " ")
    .replace(/^[\s>›•●○▪▫*-]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isFeedbackLine(line, event) {
  if (!line || line.length < 2) return false;
  if (line.length > 420) return false;
  if (event.text && line === event.text.trim()) return false;
  const blocked = [
    "[Feishu -> Codex",
    "[Bridge feedback]",
    "chat_id:",
    "message_id:",
    "sender_id:",
    "feedback.mjs",
    "不要回传",
    "处理这个飞书请求时",
    "node ~/.agents",
    event.chatId,
    event.messageId,
    event.senderId,
  ].filter(Boolean);
  if (blocked.some((token) => line.includes(token))) return false;
  if (/^(tip:|gpt-[\w.-]+|run \/|codex|esc |ctrl\+|press |tokens?\b)/i.test(line)) return false;
  if (/(thinking|tokens|context left|ctrl\+o|to expand|newspapering)/i.test(line)) return false;
  if (/^[╭╮╰╯─━═╼╾┌┐└┘├┤┬┴┼]+$/.test(line)) return false;
  if (/^\d+%?$/.test(line)) return false;
  return /[\p{Script=Han}A-Za-z0-9]/u.test(line);
}

function extractFeedbackLines(capture, event) {
  const lines = [];
  for (const raw of String(capture || "").split(/\r?\n/)) {
    const line = normalizePaneLine(raw);
    if (isFeedbackLine(line, event)) lines.push(line);
  }
  return lines;
}

function labelForKind(kind) {
  if (kind === "result") return "任务结果";
  if (kind === "note") return "处理反馈";
  return "处理进度";
}

function sendLarkFeedback(profile, event, kind, text, log) {
  const trimmed = redactSensitive(String(text || "").trim());
  if (!trimmed || !event.messageId) return false;
  const result = spawnSync("lark-cli", [
    "--profile",
    profile,
    "im",
    "+messages-reply",
    "--as",
    "bot",
    "--message-id",
    event.messageId,
    "--reply-in-thread",
    "--text",
    `${labelForKind(kind)}\n${trimmed}`,
    "--idempotency-key",
    randomUUID(),
  ], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    log(`[feedback] send failed message_id=${event.messageId}: ${redactSensitive(result.stderr || result.stdout || "lark-cli failed")}`);
    return false;
  }
  log(`[feedback] sent kind=${kind} message_id=${event.messageId} chars=${trimmed.length}`);
  return true;
}

function takePendingLines(pending, maxChars = 700) {
  const picked = [];
  let chars = 0;
  while (pending.length > 0) {
    const line = pending[0];
    const nextChars = chars + line.length + (picked.length ? 1 : 0);
    if (picked.length > 0 && nextChars > maxChars) break;
    picked.push(pending.shift());
    chars = nextChars;
    if (picked.length >= 8) break;
  }
  return picked.join("\n");
}

function startPaneMonitor({ profile, target, event, log, baselineCapture }) {
  const existing = activeMonitors.get(profile);
  if (existing) clearInterval(existing.timer);

  const seen = new Set();
  try {
    for (const line of extractFeedbackLines(baselineCapture ?? capturePane(target), event)) seen.add(line);
  } catch (err) {
    log(`[feedback] baseline capture failed: ${err.message || String(err)}`);
  }

  const pending = [];
  let lastSentAt = 0;
  let sentCount = 0;
  let lastChangedAt = Date.now();
  const startedAt = Date.now();

  sendLarkFeedback(profile, event, "progress", "已收到，开始处理。", log);

  const timer = setInterval(() => {
    try {
      const lines = extractFeedbackLines(capturePane(target), event);
      for (const line of lines) {
        if (seen.has(line)) continue;
        seen.add(line);
        pending.push(line);
        lastChangedAt = Date.now();
      }
      const shouldFlush = pending.length > 0 && (Date.now() - lastSentAt > 5000 || pending.join("\n").length > 480);
      if (shouldFlush) {
        const text = takePendingLines(pending);
        if (sendLarkFeedback(profile, event, "progress", text, log)) {
          lastSentAt = Date.now();
          sentCount += 1;
        }
      }
      const tooLong = Date.now() - startedAt > 30 * 60 * 1000;
      const idleAfterWork = sentCount > 0 && Date.now() - lastChangedAt > 4 * 60 * 1000;
      if (tooLong || idleAfterWork || sentCount >= 40) {
        clearInterval(timer);
        activeMonitors.delete(profile);
        log(`[feedback] monitor stopped message_id=${event.messageId}`);
      }
    } catch (err) {
      log(`[feedback] monitor failed: ${err.message || String(err)}`);
    }
  }, 2500);
  activeMonitors.set(profile, { timer, event });
}

function fetchQuotedMessage(profile, parentId) {
  if (!parentId) return "";
  try {
    const result = spawnSync("lark-cli", [
      "--profile", profile,
      "im", "+messages-mget",
      "--message-ids", parentId,
      "--as", "bot",
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (result.status !== 0) return "";
    const data = JSON.parse(result.stdout || "{}");
    const msg = data?.data?.messages?.[0];
    if (!msg) return "";
    const content = decodeContent(msg.content).trim();
    return content ? `[quoted message: ${content.slice(0, 300)}]` : "";
  } catch {
    return "";
  }
}

function formatInjectedMessage(event, botName, profile) {
  const quoted = fetchQuotedMessage(profile, event.parentId);
  return [
    `[Feishu -> Codex via ${botName || "Lark bot"}]`,
    `chat_id: ${event.chatId || "(unknown)"}`,
    `message_id: ${event.messageId || "(unknown)"}`,
    `sender_id: ${event.senderId || "(unknown)"}`,
    "",
    ...(quoted ? [quoted, ""] : []),
    event.text,
    "",
    "[Bridge feedback]",
    "处理这个飞书请求时，bridge 会自动同步明显的终端进度。",
    "如果要把最终答复发回飞书，必须执行 result 命令；不要只在终端说“现在回复飞书”：",
    `node ~/.agents/skills/lark-agent-bridge/scripts/feedback.mjs --profile ${profile} --message-id ${event.messageId} --kind progress --text "这里写处理进度"`,
    `node ~/.agents/skills/lark-agent-bridge/scripts/feedback.mjs --profile ${profile} --message-id ${event.messageId} --kind result --text "这里写任务结果"`,
    "不要回传密钥、token 或完整终端输出。",
  ].join("\n");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }
  if (!opts.profile) throw new Error("--profile is required");
  if (!opts.target) throw new Error("--target is required");

  const log = createLogger(opts.logPath);
  log(`[bridge] starting profile=${opts.profile} target=${opts.target} bot=${opts.botName || ""}`);

  const args = ["--profile", opts.profile, "event", "consume", opts.eventKey, "--as", "bot", "--quiet"];
  const child = spawn("lark-cli", args, { stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.write("\n");

  const maxConnectionMinutes = Number.isFinite(opts.maxConnectionMinutes) && opts.maxConnectionMinutes > 0
    ? opts.maxConnectionMinutes
    : 360;
  let shuttingDown = false;
  let shutdownExitCode = 0;
  const rotateTimer = setTimeout(() => {
    log(`[bridge] rotating lark-cli after ${maxConnectionMinutes}m`);
    child.kill("SIGTERM");
  }, maxConnectionMinutes * 60 * 1000);
  rotateTimer.unref();

  child.stderr.on("data", (buf) => {
    const text = buf.toString("utf8").trim();
    if (text) log(`[lark-cli] ${text}`);
  });

  child.on("exit", (code, signal) => {
    clearTimeout(rotateTimer);
    log(`[bridge] lark-cli exited code=${code ?? ""} signal=${signal || ""}`);
    if (shuttingDown) process.exit(shutdownExitCode);
    process.exit(code === 0 || code === null ? 75 : code);
  });

  let partial = "";
  child.stdout.on("data", (buf) => {
    partial += buf.toString("utf8");
    const lines = partial.split(/\r?\n/);
    partial = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let obj;
      try {
        obj = JSON.parse(trimmed);
      } catch {
        log(`[bridge] skipped non-json line: ${trimmed.slice(0, 160)}`);
        continue;
      }
      const event = extractEvent(obj);
      if (!event.messageId) {
        log("[bridge] skipped event without message_id");
        continue;
      }
      if (event.senderType === "app" || event.senderType === "bot" || (opts.botOpenId && event.senderId === opts.botOpenId)) {
        log(`[bridge] skipped bot echo message_id=${event.messageId}`);
        continue;
      }
      if (!event.text) {
        log(`[bridge] skipped empty message message_id=${event.messageId}`);
        continue;
      }
      try {
        let baselineCapture = "";
        try {
          baselineCapture = capturePane(opts.target);
        } catch (err) {
          log(`[feedback] pre-inject capture failed: ${err.message || String(err)}`);
        }
        updateLastEvent(opts.profile, event, opts.target, opts.botName);
        injectIntoPane(opts.target, formatInjectedMessage(event, opts.botName, opts.profile));
        startPaneMonitor({ profile: opts.profile, target: opts.target, event, log, baselineCapture });
        log(`[bridge] injected message_id=${event.messageId} chars=${event.text.length}`);
      } catch (err) {
        log(`[bridge] inject failed message_id=${event.messageId}: ${err.message || String(err)}`);
      }
    }
  });

  const shutdown = (signal) => {
    shuttingDown = true;
    shutdownExitCode = signal === "SIGINT" ? 130 : 143;
    log(`[bridge] ${signal}`);
    child.kill("SIGTERM");
    setTimeout(() => process.exit(shutdownExitCode), 1500).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(`[bridge] ${err.message || String(err)}`);
  process.exit(1);
});
