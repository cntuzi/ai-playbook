#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const STATE_PATH = join(homedir(), ".agents", "run", "lark-agent-bridge", "manager-state.json");

function parseArgs(argv) {
  const out = { kind: "progress" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`missing value for ${arg}`);
      return value;
    };
    if (arg === "--profile") out.profile = next();
    else if (arg === "--chat-id") out.chatId = next();
    else if (arg === "--message-id") out.messageId = next();
    else if (arg === "--kind") out.kind = next();
    else if (arg === "--text") out.text = next();
    else if (arg === "--markdown") out.markdown = true;
    else if (arg === "--image") out.image = next();
    else if (arg === "--reply-in-thread") out.replyInThread = true;
    else if (arg === "--no-summary") out.noSummary = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() {
  console.log(`lark-agent-bridge feedback

Usage:
  node feedback.mjs --profile <profile> --text <message> [--kind progress|result|note]
  node feedback.mjs --profile <profile> --message-id <om_xxx> --text <message>
  node feedback.mjs --profile <profile> --chat-id <oc_xxx> --text <message>

Options:
  --markdown         Send as markdown (rich text with headings, bold, lists, code blocks)
  --image <path>     Send a local image file
  --no-summary       For result kind: skip the main-chat summary (only send to thread)
  --reply-in-thread  Force reply in thread
`);
}

function readState() {
  if (!existsSync(STATE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function redactSensitive(value) {
  return String(value || "")
    .replace(/((?:app|client)[_-]?secret["'\s:=]+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .replace(/((?:access|refresh|tenant|user)[_-]?token["'\s:=]+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .replace(/\b(cli|oc|om|ou)_[A-Za-z0-9_-]{12,}\b/g, "$1_[redacted]")
    .replace(/\b[A-Za-z0-9][A-Za-z0-9_-]{31,}\b/g, "[redacted]");
}

function labelForKind(kind) {
  if (kind === "result") return "任务结果";
  if (kind === "note") return "处理反馈";
  return "处理进度";
}

function formatText(kind, text) {
  return `${labelForKind(kind)}\n${text}`;
}

function runLark(args) {
  const result = spawnSync("lark-cli", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(redactSensitive(result.stderr || result.stdout || "lark-cli failed"));
  }
  return result.stdout || "{}";
}

function buildContentArgs(opts, text, kind) {
  const formatted = formatText(kind, text);
  if (opts.image) {
    return ["--image", opts.image];
  }
  if (opts.markdown) {
    return ["--markdown", formatted];
  }
  return ["--text", formatted];
}

function stripMarkdown(str) {
  return str
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "- ");
}

function truncateSummary(text, maxLen = 80) {
  const clean = stripMarkdown(text);
  const firstLine = clean.split("\n").find((l) => l.trim()) || clean;
  if (firstLine.length <= maxLen) return firstLine;
  return firstLine.slice(0, maxLen - 1) + "…";
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }
  if (!opts.profile) throw new Error("--profile is required");
  const text = String(opts.text || "").trim();
  if (!text && !opts.image) throw new Error("--text is required (or use --image)");

  const state = readState();
  const lastEvent = state.lastEvents?.[opts.profile] || {};
  const messageId = opts.messageId || lastEvent.messageId || "";
  const chatId = opts.chatId || lastEvent.chatId || "";
  if (!messageId && !chatId) {
    throw new Error("missing target: provide --message-id/--chat-id or wait for a bridge message first");
  }

  const resolvedChatId = chatId || lastEvent.chatId || "";

  const threadArgs = [
    "--profile", opts.profile,
    "im",
    messageId ? "+messages-reply" : "+messages-send",
    "--as", "bot",
    ...buildContentArgs(opts, text, opts.kind),
    "--idempotency-key", randomUUID(),
  ];
  if (messageId) threadArgs.push("--message-id", messageId);
  else threadArgs.push("--chat-id", resolvedChatId);
  if (opts.replyInThread || (opts.kind !== "result" && messageId)) threadArgs.push("--reply-in-thread");

  const stdout = runLark(threadArgs);
  let response = {};
  try {
    response = JSON.parse(stdout);
  } catch {
    response = {};
  }

  let summaryResponse = undefined;
  if (opts.kind === "result" && messageId && resolvedChatId && !opts.noSummary) {
    const formatted = formatText(opts.kind, text);
    const summaryArgs = [
      "--profile", opts.profile,
      "im", "+messages-send",
      "--as", "bot",
      "--markdown", formatted,
      "--chat-id", resolvedChatId,
      "--idempotency-key", randomUUID(),
    ];
    try {
      const summaryOut = runLark(summaryArgs);
      summaryResponse = JSON.parse(summaryOut);
    } catch {
      summaryResponse = { error: "summary send failed" };
    }
  }

  const output = {
    ok: true,
    profile: opts.profile,
    kind: opts.kind,
    target: messageId ? "message" : "chat",
    sentAt: new Date().toISOString(),
    response,
  };
  if (summaryResponse) output.summaryResponse = summaryResponse;
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(redactSensitive(err.message || String(err)));
  process.exit(1);
});
