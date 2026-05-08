#!/usr/bin/env node
import http from "node:http";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const SKILL_DIR = resolve(dirname(__filename), "..");
const RUN_DIR = join(homedir(), ".agents", "run", "lark-agent-bridge");
const LOG_DIR = join(RUN_DIR, "logs");
const STATE_PATH = join(RUN_DIR, "manager-state.json");
const DEFAULT_PORT = 17654;

function parseArgs(argv) {
  const out = { host: "127.0.0.1", port: DEFAULT_PORT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`missing value for ${arg}`);
      return value;
    };
    if (arg === "--host") out.host = next();
    else if (arg === "--port") out.port = Number(next());
    else if (arg === "--target-pane") out.targetPane = next();
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() {
  console.log(`Agent manager

Usage:
  node manager.mjs [--host 127.0.0.1] [--port ${DEFAULT_PORT}] [--target-pane %2]
`);
}

function ensureDirs() {
  mkdirSync(LOG_DIR, { recursive: true });
}

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function runJson(cmd, args) {
  const result = run(cmd, args);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${cmd} failed`).trim());
  }
  return JSON.parse(result.stdout || "null");
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
  ensureDirs();
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function redactSensitive(value) {
  return String(value || "")
    .replace(/((?:app|client)[_-]?secret["'\s:=]+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .replace(/((?:access|refresh|tenant|user)[_-]?token["'\s:=]+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .replace(/\b(cli|oc|om|ou)_[A-Za-z0-9_-]{12,}\b/g, "$1_[redacted]")
    .replace(/\b[A-Za-z0-9][A-Za-z0-9_-]{31,}\b/g, "[redacted]");
}

function sessionNameForProfile(profile) {
  const safe = String(profile).replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 72);
  return `lark-bridge-${safe}`;
}

function tmuxHasSession(session) {
  return run("tmux", ["has-session", "-t", session]).status === 0;
}

function tmuxPaneExists(pane) {
  return Boolean(pane) && run("tmux", ["display-message", "-t", pane, "-p", "#{pane_id}"]).status === 0;
}

function isBridgePane(pane) {
  return String(pane?.label || "").startsWith("lark-agent-bridge-ui:")
    || String(pane?.label || "").startsWith("lark-bridge-");
}

function listProfiles() {
  try {
    const parsed = runJson("lark-cli", ["profile", "list"]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function fetchBotInfo(profile) {
  try {
    const parsed = runJson("lark-cli", [
      "--profile",
      profile,
      "api",
      "GET",
      "/open-apis/bot/v3/info",
      "--as",
      "bot",
      "--format",
      "json",
    ]);
    const bot = parsed?.bot || parsed?.data?.bot || {};
    return {
      ok: true,
      name: bot.app_name || bot.name || profile,
      openId: bot.open_id || "",
      avatarUrl: bot.avatar_url || "",
      activateStatus: bot.activate_status,
    };
  } catch (err) {
    return {
      ok: false,
      name: profile,
      openId: "",
      error: err.message || String(err),
    };
  }
}

let botCache = { at: 0, items: [] };
function listBots() {
  if (Date.now() - botCache.at < 15000 && botCache.items.length > 0) return botCache.items;
  const profiles = listProfiles();
  const items = profiles.map((profile) => {
    const name = profile.name || profile.profile || profile.appId || "";
    const appId = profile.appId || profile.app_id || "";
    const info = name ? fetchBotInfo(name) : { ok: false, name: appId || "(unknown)" };
    return {
      profile: name,
      appId,
      brand: profile.brand || "feishu",
      active: Boolean(profile.active),
      ...info,
      session: sessionNameForProfile(name),
      running: tmuxHasSession(sessionNameForProfile(name)),
    };
  });
  botCache = { at: Date.now(), items };
  return items;
}

function listPanes() {
  const format = "#{pane_id}\t#{session_name}:#{window_index}.#{pane_index}\t#{session_name}\t#{window_index}\t#{pane_index}\t#{window_name}\t#{pane_tty}\t#{pane_current_command}\t#{pane_active}";
  const result = run("tmux", ["list-panes", "-a", "-F", format]);
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, label, sessionName, windowIndex, paneIndex, windowName, tty, command, active] = line.split("\t");
      return { id, label, sessionName, windowIndex, paneIndex, windowName, tty, command, active: active === "1" };
    });
}

function currentPaneId() {
  const preferred = process.env.LARK_BRIDGE_TARGET_PANE || "";
  if (tmuxPaneExists(preferred)) return preferred;
  const panes = listPanes().filter((pane) => !isBridgePane(pane));
  return panes.find((pane) => pane.active)?.id || panes[0]?.id || "";
}

function clampLineCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 120;
  return Math.max(20, Math.min(500, Math.trunc(parsed)));
}

function capturePane(target, lines) {
  const pane = target || currentPaneId();
  if (!pane) throw new Error("target pane is required");
  if (!tmuxPaneExists(pane)) throw new Error(`tmux pane not found: ${pane}`);
  const count = clampLineCount(lines);
  const result = run("tmux", ["capture-pane", "-p", "-t", pane, "-S", `-${count}`]);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "failed to capture pane").trim());
  }
  return {
    ok: true,
    target: pane,
    lines: count,
    content: redactSensitive(result.stdout.replace(/\s+$/u, "")),
    updatedAt: new Date().toISOString(),
  };
}

function stopBridge(profile) {
  const session = sessionNameForProfile(profile);
  if (tmuxHasSession(session)) {
    const killed = run("tmux", ["kill-session", "-t", session]);
    if (killed.status !== 0) throw new Error((killed.stderr || killed.stdout || "failed to stop bridge").trim());
  }
  const state = readState();
  if (state.bridges) delete state.bridges[profile];
  writeState(state);
  botCache.at = 0;
  return { ok: true, profile, session };
}

function startBridge(profile, target) {
  if (!profile) throw new Error("profile is required");
  if (!target) throw new Error("target pane is required");
  const bot = fetchBotInfo(profile);
  if (!bot.ok) throw new Error(bot.error || "failed to fetch bot info");

  stopBridge(profile);
  ensureDirs();
  const session = sessionNameForProfile(profile);
  const logPath = join(LOG_DIR, `${profile}.tmux.log`);
  const worker = join(SKILL_DIR, "scripts", "tmux-pane-bridge.mjs");
  const workerCmd = [
    shellQuote(process.execPath),
    shellQuote(worker),
    "--profile",
    shellQuote(profile),
    "--target",
    shellQuote(target),
    "--bot-open-id",
    shellQuote(bot.openId || ""),
    "--bot-name",
    shellQuote(bot.name || profile),
    "--log",
    shellQuote(logPath),
    "--max-connection-minutes",
    "360",
  ].join(" ");
  const cmd = [
    "while true; do",
    `${workerCmd};`,
    "code=$?;",
    "if [ \"$code\" -eq 130 ] || [ \"$code\" -eq 143 ]; then exit \"$code\"; fi;",
    "sleep 5;",
    "done",
  ].join(" ");
  const result = run("tmux", ["new-session", "-d", "-s", session, "zsh", "-lc", cmd]);
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "failed to start bridge").trim());

  const state = readState();
  state.bridges ||= {};
  state.bridges[profile] = {
    profile,
    session,
    target,
    botName: bot.name || profile,
    botOpenId: bot.openId || "",
    logPath,
    startedAt: new Date().toISOString(),
  };
  writeState(state);
  botCache.at = 0;
  return { ok: true, ...state.bridges[profile], running: true };
}

function publicBot(bot) {
  return {
    profile: bot.profile,
    name: bot.name || bot.profile,
    avatarUrl: bot.avatarUrl || "",
    ok: Boolean(bot.ok),
    active: Boolean(bot.active),
    running: Boolean(bot.running),
    error: bot.ok ? "" : "bot unavailable",
  };
}

function publicLastEvent(event) {
  if (!event) return null;
  return {
    receivedAt: event.receivedAt || "",
    textPreview: event.textPreview || "",
  };
}

function publicBridge(bridge, state) {
  return {
    profile: bridge.profile,
    session: bridge.session || sessionNameForProfile(bridge.profile),
    target: bridge.target || "",
    botName: bridge.botName || bridge.profile,
    startedAt: bridge.startedAt || "",
    running: tmuxHasSession(bridge.session || sessionNameForProfile(bridge.profile)),
    lastEvent: publicLastEvent(state.lastEvents?.[bridge.profile]),
  };
}

function sendFeedback(body) {
  const profile = body.profile;
  const text = String(body.text || "").trim();
  if (!profile) throw new Error("profile is required");
  if (!text) throw new Error("feedback text is required");
  const state = readState();
  const lastEvent = state.lastEvents?.[profile] || {};
  const script = join(SKILL_DIR, "scripts", "feedback.mjs");
  const args = [
    script,
    "--profile",
    profile,
    "--kind",
    String(body.kind || "progress"),
    "--text",
    text,
  ];
  const messageId = body.messageId || lastEvent.messageId || "";
  const chatId = body.chatId || lastEvent.chatId || "";
  if (messageId) args.push("--message-id", messageId);
  else if (chatId) args.push("--chat-id", chatId);
  if (body.replyInThread) args.push("--reply-in-thread");
  const result = run(process.execPath, args);
  if (result.status !== 0) {
    throw new Error(redactSensitive(result.stderr || result.stdout || "failed to send feedback"));
  }
  try {
    return JSON.parse(result.stdout || "{}");
  } catch {
    return { ok: true };
  }
}

function status() {
  const state = readState();
  const bridges = Object.values(state.bridges || {}).map((bridge) => publicBridge(bridge, state));
  return {
    ok: true,
    currentPane: currentPaneId(),
    panes: listPanes(),
    bots: listBots().map(publicBot),
    bridges,
  };
}

function sendJson(res, code, data) {
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(data, null, 2));
}

async function readBody(req) {
  let text = "";
  for await (const chunk of req) text += chunk;
  if (!text.trim()) return {};
  return JSON.parse(text);
}

function html() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agent 管理台</title>
  <style>
    :root {
      color-scheme: light;
      --bg:#f5f6f8;
      --panel:#ffffff;
      --panel-2:#f9fafb;
      --ink:#202631;
      --muted:#667085;
      --line:#d8dee8;
      --line-soft:#edf1f6;
      --accent:#2563eb;
      --ok:#11845b;
      --warn:#b76e00;
      --bad:#b42318;
      --note:#6d40b7;
      --terminal:#0b1020;
      --terminal-ink:#d8dee9;
    }
    * { box-sizing:border-box; }
    [hidden] { display:none !important; }
    html, body { min-height:100%; }
    body { margin:0; font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); background:var(--bg); }
    header { padding:14px 22px; border-bottom:1px solid var(--line); background:var(--panel); display:flex; align-items:center; justify-content:space-between; gap:16px; position:sticky; top:0; z-index:2; }
    h1 { margin:0; font-size:17px; font-weight:700; letter-spacing:0; }
    h2 { margin:0; font-size:13px; font-weight:700; letter-spacing:0; }
    .subhead { color:var(--muted); font-size:12px; margin-top:2px; }
    .topline { display:flex; align-items:center; gap:10px; flex-wrap:wrap; justify-content:flex-end; min-width:0; }
    main { max-width:1360px; margin:0 auto; padding:18px; display:grid; grid-template-columns:360px minmax(0,1fr); grid-template-areas:"bots control" "bots preview"; gap:14px; }
    section { background:var(--panel); border:1px solid var(--line); border-radius:8px; overflow:hidden; }
    .bot-panel { grid-area:bots; align-self:start; }
    .control-panel { grid-area:control; }
    .preview-panel { grid-area:preview; min-width:0; }
    .section-head { min-height:48px; padding:12px 14px; border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .content { padding:14px; }
    .bot-list { display:grid; gap:8px; }
    .bot-row { width:100%; min-height:84px; border:1px solid var(--line); border-radius:8px; background:#fff; color:var(--ink); padding:10px; cursor:pointer; display:grid; grid-template-columns:40px minmax(0,1fr) auto; gap:10px; align-items:center; text-align:left; }
    .bot-row:hover { border-color:#b9c4d5; background:#fbfcfe; }
    .bot-row.selected { border-color:var(--accent); box-shadow:inset 3px 0 0 var(--accent); background:#f7fbff; }
    .avatar { width:40px; height:40px; border-radius:8px; background:#e8edf5; object-fit:cover; display:grid; place-items:center; color:#39465a; font-weight:700; }
    .name { font-weight:700; word-break:break-word; }
    .meta { color:var(--muted); font-size:12px; word-break:break-all; margin-top:2px; }
    .badge { display:inline-flex; align-items:center; height:22px; padding:0 8px; border-radius:999px; border:1px solid var(--line); color:var(--muted); font-size:12px; white-space:nowrap; line-height:1; }
    .badge.ok { color:var(--ok); border-color:rgba(17,132,91,.35); background:rgba(17,132,91,.07); }
    .badge.bad { color:var(--bad); border-color:rgba(180,35,24,.35); background:rgba(180,35,24,.07); }
    .badge.warn { color:var(--warn); border-color:rgba(183,110,0,.35); background:rgba(183,110,0,.08); }
    .badge.note { color:var(--note); border-color:rgba(109,64,183,.32); background:rgba(109,64,183,.07); }
    label { display:block; color:var(--muted); font-size:12px; margin-bottom:7px; }
    select { width:100%; height:40px; border:1px solid var(--line); border-radius:7px; padding:0 10px; background:#fff; color:var(--ink); font:inherit; }
    textarea { width:100%; min-height:82px; resize:vertical; border:1px solid var(--line); border-radius:7px; padding:9px 10px; color:var(--ink); font:inherit; }
    button { height:36px; border:1px solid var(--line); border-radius:7px; background:#fff; color:var(--ink); padding:0 12px; cursor:pointer; font-weight:600; font:inherit; }
    button.primary { background:var(--accent); color:white; border-color:var(--accent); }
    button.danger { color:var(--bad); }
    button:disabled { opacity:.55; cursor:not-allowed; }
    .actions { display:flex; gap:8px; flex-wrap:wrap; align-items:end; }
    .control-grid { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px; align-items:end; }
    .status-strip { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); border-bottom:1px solid var(--line); background:var(--panel-2); }
    .stat { min-height:68px; padding:11px 12px; border-right:1px solid var(--line-soft); min-width:0; }
    .stat:last-child { border-right:0; }
    .stat .key { color:var(--muted); font-size:12px; margin-bottom:4px; }
    .stat .value { font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .details { display:none; }
    .status-row { display:grid; grid-template-columns:92px minmax(0,1fr); gap:8px; padding:8px 0; border-bottom:1px solid var(--line-soft); }
    .status-row:last-child { border-bottom:0; }
    .key { color:var(--muted); }
    .value { word-break:break-all; }
    .preview-head { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
    .preview-tools { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    pre { margin:0; padding:14px; background:var(--terminal); color:var(--terminal-ink); border-radius:7px; overflow:auto; min-height:300px; max-height:48vh; font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace; white-space:pre-wrap; tab-size:2; }
    .empty { color:var(--muted); padding:12px; border:1px dashed var(--line); border-radius:8px; background:var(--panel-2); }
    .feedback-box { margin-top:16px; padding-top:14px; border-top:1px solid var(--line-soft); }
    .hint { margin-top:8px; color:var(--muted); font-size:12px; }
    .modal-backdrop { position:fixed; inset:0; background:rgba(15,23,42,.32); display:grid; place-items:center; padding:18px; z-index:10; }
    .modal { width:min(620px,100%); max-height:82vh; overflow:auto; background:var(--panel); border:1px solid var(--line); border-radius:8px; box-shadow:0 18px 60px rgba(15,23,42,.22); }
    .modal-head { padding:14px 16px; border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .modal-body { padding:12px 16px 16px; }
    @media (max-width: 960px) {
      header { align-items:flex-start; flex-direction:column; padding:14px; }
      .topline { justify-content:flex-start; }
      main { grid-template-columns:1fr; grid-template-areas:"control" "preview" "bots"; padding:14px; }
      .status-strip { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .stat:nth-child(2) { border-right:0; }
      .stat:nth-child(1), .stat:nth-child(2) { border-bottom:1px solid var(--line-soft); }
      .control-grid { grid-template-columns:1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Agent 管理台</h1>
      <div class="subhead">管理 Agent 的运行状态、工作会话和任务反馈</div>
    </div>
    <div class="topline">
      <span id="topStatus" class="badge">Loading</span>
      <span id="topTarget" class="badge note">Agent</span>
      <span id="notice" class="badge">Idle</span>
    </div>
  </header>
  <main>
    <section class="bot-panel">
      <div class="section-head">
        <h2>Agent 列表</h2>
        <button id="refreshBtn">刷新</button>
      </div>
      <div class="content">
        <div id="botGrid" class="bot-list"></div>
      </div>
    </section>
    <section class="control-panel">
      <div class="section-head">
        <h2>运行管理</h2>
        <span id="bridgeState" class="badge">Stopped</span>
      </div>
      <div id="statusGrid" class="status-strip"></div>
      <div class="content">
        <div class="control-grid">
          <div>
            <label for="paneSelect">Agent 工作会话</label>
            <select id="paneSelect"></select>
          </div>
          <div class="actions">
            <button id="startBtn" class="primary">启动</button>
            <button id="stopBtn" class="danger">停止</button>
            <button id="detailsBtn">详情</button>
          </div>
        </div>
        <div id="details" class="details"></div>
      </div>
    </section>
    <section class="preview-panel">
      <div class="section-head preview-head">
        <h2>Agent 工作内容</h2>
        <div class="preview-tools">
          <span id="previewMeta" class="badge">未选择工作会话</span>
          <button id="previewRefreshBtn">刷新工作内容</button>
        </div>
      </div>
      <div class="content">
        <pre id="ttyContent"></pre>
      </div>
    </section>
  </main>
  <div id="modalBackdrop" class="modal-backdrop" hidden>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-head">
        <h2 id="modalTitle">Agent 管理详情</h2>
        <button id="closeDetailsBtn">关闭</button>
      </div>
      <div class="modal-body">
        <div id="modalDetails"></div>
        <div class="feedback-box">
          <label for="feedbackText">任务反馈</label>
          <textarea id="feedbackText" placeholder="输入要发给最近一条任务消息的处理进度或任务结果"></textarea>
          <div class="actions" style="margin-top:8px">
            <button id="sendProgressBtn">发送进度</button>
            <button id="sendResultBtn">发送结果</button>
          </div>
          <div id="feedbackHint" class="hint"></div>
        </div>
      </div>
    </div>
  </div>
  <script>
    let selectedProfile = "";
    let selectedPane = "";
    let snapshot = null;
    let previewRequest = 0;
    let lastAutoScrolledPane = "";

    async function api(path, options) {
      const res = await fetch(path, options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      return data;
    }

    function el(tag, attrs = {}, children = []) {
      const node = document.createElement(tag);
      for (const [key, value] of Object.entries(attrs)) {
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else node.setAttribute(key, value);
      }
      for (const child of children) node.append(child);
      return node;
    }

    function isManagedSession(pane) {
      const label = pane?.label || "";
      return label.startsWith("lark-agent-bridge-ui:") || label.startsWith("lark-bridge-");
    }

    function shortName(value) {
      const text = String(value || "").trim();
      return text ? text.slice(0, 2).toUpperCase() : "LB";
    }

    function currentBridge() {
      return (snapshot?.bridges || []).find((item) => item.profile === selectedProfile);
    }

    function selectedBot() {
      return (snapshot?.bots || []).find((item) => item.profile === selectedProfile);
    }

    function selectedPaneInfo() {
      return (snapshot?.panes || []).find((item) => item.id === selectedPane);
    }

    function workPanes() {
      return (snapshot?.panes || []).filter((pane) => !isManagedSession(pane));
    }

    function canUsePane(paneId) {
      return Boolean(workPanes().some((pane) => pane.id === paneId));
    }

    function formatPaneLabel(pane) {
      if (!pane) return "(none)";
      const tags = [];
      if (pane.id === snapshot?.currentPane) tags.push("默认");
      if (pane.active) tags.push("活跃");
      if (isManagedSession(pane)) tags.push("系统会话");
      const windowName = pane.windowName && pane.windowName !== "zsh" ? pane.windowName : pane.label;
      return windowName + " · " + pane.label + (tags.length ? " · " + tags.join(" · ") : "");
    }

    function maskId(value) {
      const text = String(value || "");
      if (!text) return "(none)";
      if (text.length <= 14) return text;
      return text.slice(0, 8) + "..." + text.slice(-4);
    }

    function firstUsefulPane() {
      const panes = workPanes();
      return panes.find((pane) => pane.id === snapshot?.currentPane)
        || panes.find((pane) => pane.active)
        || panes[0]
        || null;
    }

    function normalizeSelection() {
      const bots = snapshot?.bots || [];
      const panes = snapshot?.panes || [];
      if (selectedProfile && !bots.some((bot) => bot.profile === selectedProfile)) selectedProfile = "";
      if (!selectedProfile && bots.length) {
        selectedProfile = bots.find((bot) => bot.running)?.profile || bots[0].profile;
      }
      if (selectedPane && !panes.some((pane) => pane.id === selectedPane)) selectedPane = "";
      if (!selectedPane) {
        const bridgeTarget = currentBridge()?.target || "";
        selectedPane = canUsePane(bridgeTarget) ? bridgeTarget : firstUsefulPane()?.id || "";
      }
    }

    function setNotice(text, kind) {
      const node = document.getElementById("notice");
      node.className = "badge " + (kind || "");
      node.textContent = text;
    }

    function renderBots() {
      const grid = document.getElementById("botGrid");
      grid.innerHTML = "";
      const bots = snapshot?.bots || [];
      if (!bots.length) {
        grid.append(el("div", { class: "empty", text: "还没有可用 Agent 配置" }));
        return;
      }
      for (const bot of bots) {
        const running = (snapshot?.bridges || []).some((bridge) => bridge.profile === bot.profile && bridge.running);
        const card = el("button", { class: "bot-row" + (bot.profile === selectedProfile ? " selected" : ""), type: "button" });
        let avatar;
        if (bot.avatarUrl) {
          avatar = el("img", { class: "avatar", alt: "" });
          avatar.src = bot.avatarUrl;
        } else {
          avatar = el("div", { class: "avatar", text: shortName(bot.name || bot.profile) });
        }
        const body = el("div");
        body.append(el("div", { class: "name", text: bot.name || bot.profile }));
        const bridge = (snapshot?.bridges || []).find((item) => item.profile === bot.profile);
        body.append(el("div", { class: "meta", text: bridge?.lastEvent?.receivedAt ? "最近收到消息" : running ? "正在监听" : "未连接" }));
        const flag = el("span", { class: "badge " + (running ? "ok" : bot.ok ? "" : "bad"), text: running ? "运行中" : bot.ok ? "就绪" : "不可用" });
        card.append(avatar, body, flag);
        card.onclick = () => {
          selectedProfile = bot.profile;
          const bridge = (snapshot?.bridges || []).find((item) => item.profile === selectedProfile);
          if (canUsePane(bridge?.target)) selectedPane = bridge.target;
          else selectedPane = firstUsefulPane()?.id || "";
          render();
          refreshPaneContent();
        };
        grid.append(card);
      }
    }

    function renderPanes() {
      const select = document.getElementById("paneSelect");
      select.innerHTML = "";
      for (const pane of workPanes()) {
        const label = formatPaneLabel(pane);
        const option = el("option", { value: pane.id, text: label });
        select.append(option);
      }
      select.value = selectedPane || select.options[0]?.value || "";
    }

    function renderStatusGrid() {
      const grid = document.getElementById("statusGrid");
      const bot = selectedBot();
      const bridge = currentBridge();
      const pane = selectedPaneInfo();
      const rows = [
        ["Agent", bot ? (bot.name || bot.profile) : "(none)"],
        ["状态", bridge?.running ? "运行中" : "未运行"],
        ["工作会话", formatPaneLabel(pane)],
        ["最近消息", bridge?.lastEvent?.receivedAt ? new Date(bridge.lastEvent.receivedAt).toLocaleTimeString() : "暂无"],
      ];
      grid.innerHTML = "";
      for (const row of rows) {
        grid.append(el("div", { class: "stat" }, [
          el("div", { class: "key", text: row[0] }),
          el("div", { class: "value", text: row[1] }),
        ]));
      }
    }

    function renderDetails() {
      const details = document.getElementById("details");
      const bot = selectedBot();
      const bridge = currentBridge();
      const pane = selectedPaneInfo();
      details.innerHTML = "";
      const summary = bot ? (bot.name || bot.profile) : "未选择 agent";
      const state = bridge?.running ? "正在接收任务消息" : "点击启动后开始监听任务消息";
      const target = pane ? "工作会话：" + formatPaneLabel(pane) : "请选择工作会话";
      details.textContent = summary + " · " + state + " · " + target;
      document.getElementById("bridgeState").className = "badge " + (bridge?.running ? "ok" : "");
      document.getElementById("bridgeState").textContent = bridge?.running ? "运行中" : "未运行";
      document.getElementById("startBtn").disabled = !selectedProfile || !selectedPane;
      document.getElementById("startBtn").textContent = bridge?.running ? "重启" : "启动";
      document.getElementById("stopBtn").disabled = !selectedProfile || !bridge?.running;
      document.getElementById("detailsBtn").disabled = !selectedProfile;
      renderFeedback();
    }

    function renderFeedback() {
      const bridge = currentBridge();
      const enabled = Boolean(bridge?.lastEvent);
      document.getElementById("sendProgressBtn").disabled = !enabled;
      document.getElementById("sendResultBtn").disabled = !enabled;
      document.getElementById("feedbackHint").textContent = enabled
        ? "会回复到该 Agent 最近收到的一条任务消息。后台也会自动发送进度和结果。"
        : "该 Agent 收到任务消息后才能直接反馈。";
    }

    function render() {
      const running = (snapshot?.bridges || []).filter((bridge) => bridge.running).length;
      const bridge = currentBridge();
      const pane = selectedPaneInfo();
      document.getElementById("topStatus").className = "badge " + (running ? "ok" : "warn");
      document.getElementById("topStatus").textContent = running ? running + " 个 agent 运行中" : "暂无运行 agent";
      document.getElementById("topTarget").textContent = selectedBot()?.name || "未选择 agent";
      renderBots();
      renderPanes();
      renderStatusGrid();
      renderDetails();
      if (!document.getElementById("modalBackdrop").hidden) renderModalDetails();
    }

    async function refresh() {
      snapshot = await api("/api/status");
      normalizeSelection();
      render();
    }

    function scrollWorkContentToBottom() {
      const content = document.getElementById("ttyContent");
      requestAnimationFrame(() => {
        content.scrollTop = content.scrollHeight;
      });
    }

    async function refreshPaneContent() {
      const target = selectedPane;
      const content = document.getElementById("ttyContent");
      const meta = document.getElementById("previewMeta");
      if (!target) {
        content.textContent = "";
        lastAutoScrolledPane = "";
        meta.className = "badge warn";
        meta.textContent = "未选择工作会话";
        return;
      }
      const requestId = ++previewRequest;
      try {
        const data = await api("/api/pane-content?target=" + encodeURIComponent(target) + "&lines=160");
        if (requestId !== previewRequest) return;
        content.textContent = data.content || "";
        if (lastAutoScrolledPane !== target) {
          scrollWorkContentToBottom();
          lastAutoScrolledPane = target;
        }
        meta.className = "badge ok";
        meta.textContent = "已同步 · " + new Date(data.updatedAt).toLocaleTimeString();
      } catch (err) {
        if (requestId !== previewRequest) return;
        meta.className = "badge bad";
        meta.textContent = err.message;
      }
    }

    function renderModalDetails() {
      const body = document.getElementById("modalDetails");
      const bot = selectedBot();
      const bridge = currentBridge();
      const pane = selectedPaneInfo();
      const rows = [
        ["Agent", bot ? (bot.name || bot.profile) : "(none)"],
        ["配置", maskId(selectedProfile)],
        ["状态", bridge?.running ? "运行中" : "未运行"],
        ["工作会话", pane ? formatPaneLabel(pane) : selectedPane || "(none)"],
        ["执行进程", pane ? pane.command : "(none)"],
        ["运行会话", bridge?.session || "(created after start)"],
        ["启动时间", bridge?.startedAt ? new Date(bridge.startedAt).toLocaleString() : "(none)"],
        ["最近消息", bridge?.lastEvent?.receivedAt ? new Date(bridge.lastEvent.receivedAt).toLocaleString() : "(none)"],
        ["消息预览", bridge?.lastEvent?.textPreview || "(none)"],
      ];
      body.innerHTML = "";
      for (const [key, value] of rows) {
        body.append(el("div", { class: "status-row" }, [
          el("div", { class: "key", text: key }),
          el("div", { class: "value", text: value }),
        ]));
      }
    }

    function openDetails() {
      renderModalDetails();
      document.getElementById("modalBackdrop").hidden = false;
    }

    function closeDetails() {
      document.getElementById("modalBackdrop").hidden = true;
    }

    async function sendFeedback(kind) {
      const textarea = document.getElementById("feedbackText");
      const text = textarea.value.trim();
      if (!text) {
        setNotice("先输入反馈内容", "warn");
        return;
      }
      setNotice("发送中", "warn");
      await api("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: selectedProfile, kind, text }),
      });
      textarea.value = "";
      setNotice(kind === "result" ? "结果已发送" : "进度已发送", "ok");
    }

    document.getElementById("refreshBtn").onclick = async () => {
      await refresh();
      await refreshPaneContent();
      setNotice("已刷新", "ok");
    };
    document.getElementById("previewRefreshBtn").onclick = refreshPaneContent;
    document.getElementById("detailsBtn").onclick = openDetails;
    document.getElementById("closeDetailsBtn").onclick = closeDetails;
    document.getElementById("modalBackdrop").onclick = (event) => {
      if (event.target.id === "modalBackdrop") closeDetails();
    };
    document.getElementById("sendProgressBtn").onclick = () => sendFeedback("progress").catch((err) => setNotice(err.message, "bad"));
    document.getElementById("sendResultBtn").onclick = () => sendFeedback("result").catch((err) => setNotice(err.message, "bad"));
    document.getElementById("startBtn").onclick = async () => {
      setNotice("启动中", "warn");
      await api("/api/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: selectedProfile, target: selectedPane }),
      });
      await refresh();
      await refreshPaneContent();
      setNotice("已运行", "ok");
    };
    document.getElementById("stopBtn").onclick = async () => {
      setNotice("停止中", "warn");
      await api("/api/stop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: selectedProfile }),
      });
      await refresh();
      setNotice("已停止", "warn");
    };
    document.getElementById("paneSelect").onchange = async (event) => {
      selectedPane = event.target.value;
      render();
      await refreshPaneContent();
    };

    refresh().then(refreshPaneContent).catch((err) => {
      document.getElementById("botGrid").textContent = err.message;
      document.getElementById("topStatus").className = "badge bad";
      document.getElementById("topStatus").textContent = "Error";
    });
    setInterval(() => refresh().catch(() => {}), 5000);
    setInterval(() => refreshPaneContent().catch(() => {}), 2000);
  </script>
</body>
</html>`;
}

async function handle(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(html());
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      sendJson(res, 200, status());
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/bots") {
      sendJson(res, 200, { ok: true, bots: listBots().map(publicBot) });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/panes") {
      sendJson(res, 200, { ok: true, currentPane: currentPaneId(), panes: listPanes() });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/pane-content") {
      sendJson(res, 200, capturePane(url.searchParams.get("target"), url.searchParams.get("lines")));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/start") {
      const body = await readBody(req);
      sendJson(res, 200, startBridge(body.profile, body.target));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/stop") {
      const body = await readBody(req);
      sendJson(res, 200, stopBridge(body.profile));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/feedback") {
      const body = await readBody(req);
      sendJson(res, 200, sendFeedback(body));
      return;
    }
    sendJson(res, 404, { ok: false, error: "not found" });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: redactSensitive(err.message || String(err)) });
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }
  if (opts.targetPane) process.env.LARK_BRIDGE_TARGET_PANE = opts.targetPane;
  ensureDirs();
  const server = http.createServer((req, res) => {
    handle(req, res);
  });
  server.listen(opts.port, opts.host, () => {
    console.log(`Agent manager: http://${opts.host}:${opts.port}/`);
  });
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
