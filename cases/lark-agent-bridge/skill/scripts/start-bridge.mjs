#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const VERSION = "0.1.0";
const DEFAULT_EVENT_TYPES = "im.message.receive_v1";
const DEFAULT_PROMPT_LIMIT = 12000;
const DEFAULT_REPLY_LIMIT = 12000;

function usage() {
  console.log(`lark-agent-bridge ${VERSION}

Usage:
  node start-bridge.mjs --agent codex --workspace <dir> --bot <profile-or-index> [--restart]

Options:
  --agent <name>          Agent to run. Currently: codex. Default: codex
  --workspace <dir>       Working directory for the agent. Default: cwd
  --bot <profile|index>   lark-cli profile name, or 1-based profile index
  --profile <name>        Explicit lark-cli profile name
  --restart              Stop previous bridge with the same key before starting
  --sandbox <mode>        Codex sandbox. Default: workspace-write
  --approval <policy>     Codex approval policy. Default: never
  --model <model>         Optional Codex model
  --event-types <types>   Event types for lark-cli event +subscribe
  --reply-in-thread       Reply in message thread
  --dry-run               Print commands and exit
  --debug                 Print raw events and command diagnostics
  --help                  Show this help
`);
}

function parseArgs(argv) {
  const out = {
    agent: "codex",
    workspace: process.cwd(),
    sandbox: "workspace-write",
    approval: "never",
    eventTypes: DEFAULT_EVENT_TYPES,
    replyInThread: false,
    restart: false,
    dryRun: false,
    debug: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (!v) throw new Error(`missing value for ${a}`);
      return v;
    };
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--agent") out.agent = next();
    else if (a === "--workspace") out.workspace = resolve(next());
    else if (a === "--bot") out.bot = next();
    else if (a === "--profile") out.profile = next();
    else if (a === "--sandbox") out.sandbox = next();
    else if (a === "--approval") out.approval = next();
    else if (a === "--model") out.model = next();
    else if (a === "--event-types") out.eventTypes = next();
    else if (a === "--reply-in-thread") out.replyInThread = true;
    else if (a === "--restart") out.restart = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--debug") out.debug = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

function runText(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
  };
}

function parseProfileList(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const name = line.split(/\s+/)[0];
        return { name };
      });
  }
}

function profileNameOf(item) {
  if (!item) return "";
  if (typeof item === "string") return item;
  return item.name || item.profile || item.profile_name || item.id || "";
}

function profileAppIdOf(item) {
  if (!item || typeof item === "string") return "";
  return item.app_id || item.appId || item.appID || "";
}

function resolveProfile(opts) {
  if (opts.profile) return opts.profile;
  if (!opts.bot) return "";

  const profilesResult = runText("lark-cli", ["profile", "list"]);
  const profiles = parseProfileList(profilesResult.stdout);

  if (/^\d+$/.test(opts.bot)) {
    const index = Number(opts.bot) - 1;
    const name = profileNameOf(profiles[index]);
    if (!name) {
      throw new Error(`profile index ${opts.bot} not found. Run: lark-cli profile list`);
    }
    return name;
  }

  if (opts.bot.startsWith("cli_")) {
    const match = profiles.find((p) => profileAppIdOf(p) === opts.bot);
    const name = profileNameOf(match);
    if (name) return name;
    throw new Error([
      `app id ${opts.bot} is not configured as a lark-cli profile on this machine.`,
      "Recreate it with:",
      `  lark-cli profile add --name <profile-name> --app-id ${opts.bot} --app-secret-stdin`,
    ].join("\n"));
  }

  return opts.bot;
}

function bridgeKey(opts, profile) {
  const raw = [opts.agent, profile || "default", opts.workspace].join("|");
  return raw.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 180);
}

function pidPath(key) {
  return join(homedir(), ".agents", "run", "lark-agent-bridge", `${key}.pid`);
}

function stopPrevious(path) {
  if (!existsSync(path)) return;
  const pid = Number(readFileSync(path, "utf8").trim());
  if (!pid) {
    rmSync(path, { force: true });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
    console.error(`[bridge] stopped previous pid=${pid}`);
  } catch (err) {
    if (err && err.code !== "ESRCH") throw err;
  }
  rmSync(path, { force: true });
}

function larkBaseArgs(profile) {
  return profile ? ["--profile", profile] : [];
}

function makeEventCommand(profile, opts) {
  return {
    cmd: "lark-cli",
    args: [
      ...larkBaseArgs(profile),
      "event",
      "+subscribe",
      "--as",
      "bot",
      "--compact",
      "--event-types",
      opts.eventTypes,
    ],
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
  const senderType = readField(obj, [
    "sender_type",
    "sender.sender_type",
    "event.sender.sender_type",
    "event.sender_type",
  ]);
  const rawContent = readField(obj, [
    "content",
    "text",
    "message.content",
    "event.content",
    "event.message.content",
  ]);
  const messageType = readField(obj, [
    "message_type",
    "message.message_type",
    "event.message_type",
    "event.message.message_type",
  ]);
  const eventType = readField(obj, [
    "event_type",
    "schema",
    "header.event_type",
  ]);
  return {
    messageId,
    chatId,
    senderType: String(senderType || "").toLowerCase(),
    messageType: String(messageType || "text").toLowerCase(),
    eventType,
    text: decodeContent(rawContent).trim(),
  };
}

function makePrompt(event, opts) {
  const text = event.text.slice(0, DEFAULT_PROMPT_LIMIT);
  return [
    "You are Codex running from a Feishu/Lark bot bridge.",
    `Workspace: ${opts.workspace}`,
    "Respond to the user request below. Be concise and include only the answer that should be sent back to Feishu.",
    "",
    "User message:",
    text,
  ].join("\n");
}

function runAgent(prompt, opts) {
  if (opts.agent !== "codex") {
    throw new Error(`unsupported agent: ${opts.agent}`);
  }
  const args = [
    "exec",
    "--cd",
    opts.workspace,
    "--sandbox",
    opts.sandbox,
    "--ask-for-approval",
    opts.approval,
  ];
  if (opts.model) args.push("--model", opts.model);
  args.push(prompt);

  const started = Date.now();
  const r = spawnSync("codex", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 20 * 1024 * 1024,
  });
  const elapsed = Math.round((Date.now() - started) / 1000);
  if (r.status !== 0) {
    const detail = `${r.stderr || r.stdout || ""}`.trim().slice(0, DEFAULT_REPLY_LIMIT);
    throw new Error(`codex exited with ${r.status} after ${elapsed}s\n${detail}`);
  }
  const output = (r.stdout || "").trim();
  return output || "(Codex completed without text output.)";
}

function reply(profile, event, text, opts) {
  const body = text.length > DEFAULT_REPLY_LIMIT
    ? `${text.slice(0, DEFAULT_REPLY_LIMIT)}\n\n[truncated by lark-agent-bridge]`
    : text;
  const args = [
    ...larkBaseArgs(profile),
    "im",
    "+messages-reply",
    "--as",
    "bot",
    "--message-id",
    event.messageId,
    "--text",
    body,
    "--idempotency-key",
    `lark-agent-bridge-${event.messageId}-${Date.now()}`,
  ];
  if (opts.replyInThread) args.push("--reply-in-thread");
  const r = runText("lark-cli", args, { input: "" });
  if (!r.ok) {
    throw new Error(`failed to reply via lark-cli\n${r.stderr || r.stdout}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }
  const profile = resolveProfile(opts);
  const key = bridgeKey(opts, profile);
  const pfile = pidPath(key);
  mkdirSync(dirname(pfile), { recursive: true });
  if (opts.restart) stopPrevious(pfile);

  const eventCmd = makeEventCommand(profile, opts);
  if (opts.dryRun) {
    console.log(JSON.stringify({
      profile: profile || null,
      workspace: opts.workspace,
      eventCommand: [eventCmd.cmd, ...eventCmd.args],
      codexDefault: [
        "codex",
        "exec",
        "--cd",
        opts.workspace,
        "--sandbox",
        opts.sandbox,
        "--ask-for-approval",
        opts.approval,
        "<prompt>",
      ],
    }, null, 2));
    return;
  }

  writeFileSync(pfile, `${process.pid}\n`);
  process.on("exit", () => rmSync(pfile, { force: true }));
  process.on("SIGINT", () => process.exit(130));
  process.on("SIGTERM", () => process.exit(143));

  console.error(`[bridge] starting agent=${opts.agent} profile=${profile || "(default)"} workspace=${opts.workspace}`);
  const child = spawn(eventCmd.cmd, eventCmd.args, {
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.write("\n");

  child.stderr.on("data", (buf) => {
    process.stderr.write(`[lark-cli] ${buf}`);
  });

  child.on("exit", (code, signal) => {
    console.error(`[bridge] event stream exited code=${code} signal=${signal || ""}`);
    process.exit(code === 0 ? 0 : code || 1);
  });

  const rl = createInterface({ input: child.stdout });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (opts.debug) console.error(`[event] ${trimmed}`);

    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      console.error(`[bridge] skipped non-json event line`);
      continue;
    }

    const event = extractEvent(obj);
    if (!event.messageId) {
      if (opts.debug) console.error(`[bridge] skipped event without message_id`);
      continue;
    }
    if (event.senderType === "app" || event.senderType === "bot") {
      if (opts.debug) console.error(`[bridge] skipped bot/app echo`);
      continue;
    }
    if (!event.text) {
      await Promise.resolve().then(() => reply(profile, event, "I received the message, but could not extract text content.", opts)).catch((err) => {
        console.error(`[bridge] ${err.message}`);
      });
      continue;
    }

    console.error(`[bridge] handling message_id=${event.messageId} chars=${event.text.length}`);
    try {
      const answer = runAgent(makePrompt(event, opts), opts);
      reply(profile, event, answer, opts);
      console.error(`[bridge] replied message_id=${event.messageId}`);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      console.error(`[bridge] error: ${msg}`);
      try {
        reply(profile, event, `Bridge error:\n${msg.slice(0, 3000)}`, opts);
      } catch (replyErr) {
        console.error(`[bridge] failed to send error reply: ${replyErr.message}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(`[bridge] ${err.message}`);
  process.exit(1);
});

