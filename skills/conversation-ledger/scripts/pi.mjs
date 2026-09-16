import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { capture, context } from './core.mjs';

// Installed at <workspace>/.conversation-ledger/runtime/<hash>/skill/scripts/pi.mjs.
const defaultWorkspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

export function registerPi(pi, workspace = defaultWorkspace) {
  const receive = (kind, fields, ctx) => {
    try {
      const result = capture(workspace, 'pi', { hook_event_name: kind, session_id: ctx.sessionManager.getSessionId(), ...fields });
      if (result.export_error) {
        if (ctx.hasUI) ctx.ui.notify(result.export_error, 'warning');
        else process.stderr.write(`${result.export_error}\n`);
      }
      return result;
    } catch (error) {
      if (ctx.hasUI) ctx.ui.notify(`Conversation Ledger: ${error.message}`, 'warning');
      else process.stderr.write(`Conversation Ledger: ${error.message}\n`);
    }
  };
  pi.on('session_start', (_event, ctx) => { receive('SessionStart', {}, ctx); });
  pi.on('message_end', (event, ctx) => {
    const message = event.message;
    if (!['user', 'assistant'].includes(message.role)) return;
    const text = typeof message.content === 'string' ? message.content
      : (message.content || []).filter((part) => part.type === 'text').map((part) => part.text).join('\n');
    // The documented event has no stable message ID. Preserve each receipt; no text-based dedupe.
    receive('MessageEnd', { role: message.role, text, branch_id: ctx.sessionManager.getLeafId() || null,
      outcome: message.stopReason || null }, ctx);
  });
  pi.on('agent_settled', (_event, ctx) => { receive('AgentSettled', {}, ctx); });
  pi.on('session_before_compact', (_event, ctx) => { receive('PreCompact', {}, ctx); });
  pi.on('session_tree', (event, ctx) => { receive('BranchChanged', { branch_id: event.newLeafId }, ctx); });
  pi.on('before_agent_start', (_event, ctx) => {
    try {
      const content = context(workspace);
      if (content) return { message: { customType: 'conversation-ledger-context', content, display: false } };
    } catch (error) {
      if (ctx.hasUI) ctx.ui.notify(`Conversation Ledger: ${error.message}`, 'warning');
      else process.stderr.write(`Conversation Ledger: ${error.message}\n`);
    }
  });
}

export default registerPi;
