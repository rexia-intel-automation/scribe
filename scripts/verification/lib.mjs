import { createHash, timingSafeEqual } from 'node:crypto';

export const EVENTS = Object.freeze([
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'PostToolUseFailure', 'PermissionRequest', 'Notification',
  'SubagentStart', 'SubagentStop', 'Stop', 'SessionEnd',
]);

const MASK = '••••';
const TEXT_FIELDS = new Set([
  'prompt', 'last_assistant_message', 'agent_prompt', 'content',
  'new_string', 'old_string', 'tool_response', 'message', 'error', 'command', 'description', 'text', 'question',
]);

// Only observed protocol fields are retained. Unknown field names can themselves
// contain private data, so they are removed rather than renamed or copied.
const PUBLIC_FIELDS = new Set([
  ...TEXT_FIELDS, 'agent_id', 'agent_transcript_path', 'agent_type', 'background_tasks',
  'cwd', 'destination', 'duration_ms', 'effort', 'file_path', 'hook_event_name',
  'is_interrupt', 'level', 'limit', 'mode', 'notification_type', 'permission_mode',
  'permission_suggestions', 'prompt_id', 'reason', 'run_in_background', 'session_crons',
  'session_id', 'source', 'stop_hook_active', 'subagent_type', 'tool_input', 'tool_name',
  'tool_use_id', 'transcript_path', 'type', 'scratchpad_dir', 'env', 'environment',
  'token', 'password', 'secret', 'authorization', 'api_key',
  // Observed MCP request fields; free-text arguments are still omitted.
  '_meta', 'protocolVersion', 'capabilities', 'roots', 'listChanged', 'elicitation',
  'form', 'url', 'clientInfo', 'name', 'title', 'version', 'websiteUrl', 'arguments',
  'text', 'question', 'options', 'progressToken', 'claudecode/toolUseId',
  'io.modelcontextprotocol/protocolVersion', 'io.modelcontextprotocol/clientInfo',
  'io.modelcontextprotocol/clientCapabilities',
]);
const PUBLIC_VALUES = {
  hook_event_name: EVENTS, event: EVENTS,
  tool_name: ['Read', 'Write', 'Agent'],
  permission_mode: ['default', 'auto'],
  notification_type: ['permission_prompt'], level: ['medium'],
  type: ['setMode'], mode: ['acceptEdits'], destination: ['session'],
  agent_type: ['Explore'], subagent_type: ['Explore'], reason: ['other'], source: ['startup'],
  name: ['scribe_report', 'scribe_ask', 'claude-code'], title: ['Claude Code'],
  version: ['2.1.286', '2.1.289'], websiteUrl: ['https://claude.com/claude-code'],
  protocolVersion: ['2025-11-25', '2026-07-28'],
  'io.modelcontextprotocol/protocolVersion': ['2025-11-25', '2026-07-28'],
  method: ['server/discover', 'initialize', 'notifications/initialized', 'tools/list', 'tools/call', 'ping'],
};

/** No free text, including fragments of unknown credentials, reaches evidence. */
export function redact(text) {
  return text === '' ? '' : '[content omitted]';
}

function alias(value, prefix) {
  return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 12)}`;
}

/** Anonymize captured payloads, preserving event structure and ID relationships. */
export function anonymize(value, key = '', historical = false) {
  if (/^(env|environment)$/i.test(key)) return '[omitted]';
  if (/password|token|secret|authorization|api[_-]?key/i.test(key)) return MASK;
  if (TEXT_FIELDS.has(key)) return '[content omitted]';
  // Check scalar types before recursion: an object or number cannot bypass an enum.
  if (Object.hasOwn(PUBLIC_VALUES, key)) {
    return typeof value === 'string' && PUBLIC_VALUES[key].includes(value) ? value : '[content omitted]';
  }
  if (/^(session_id|agent_id|tool_use_id|prompt_id)$/.test(key) || key === 'claudecode/toolUseId') {
    if (typeof value !== 'string') return '[content omitted]';
    if (historical && value.startsWith(key + '-') && /^[a-f0-9]{12}$/.test(value.slice(key.length + 1))) return value;
    return alias(value, key);
  }
  if (/path$|^cwd$|^scratchpad_dir$/.test(key)) {
    if (typeof value !== 'string') return '[content omitted]';
    const existing = historical && value.match(/^\/anonymous\/(path-[a-f0-9]{12})\//);
    const name = value.endsWith('.jsonl') ? 'transcript.jsonl' : '[name omitted]';
    return ['/anonymous', existing?.[1] ?? alias(value, 'path'), name].join('/');
  }
  if (Array.isArray(value)) return value.map((item) => anonymize(item, key, historical));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([k]) => PUBLIC_FIELDS.has(k))
      .map(([k, v]) => [k, anonymize(v, k, historical)]));
  }
  if (value === null) return null;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 &&
    ((key === 'limit' && value <= 10000) || (key === 'duration_ms' && value <= 3600000))) return value;
  if (typeof value === 'boolean' && ['is_interrupt', 'run_in_background', 'stop_hook_active', 'listChanged'].includes(key)) return value;
  return typeof value === 'string' ? redact(value) : '[content omitted]';
}

/** Probe endpoints accept authenticated loopback clients and no browser Origin. */
export function validProbeHeaders(headers, port, token) {
  const expected = Buffer.from('Bearer ' + token);
  const supplied = Buffer.from(headers.authorization ?? '');
  return headers.host === '127.0.0.1:' + port && headers.origin === undefined &&
    supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** Produce session-only HTTP-hook settings; the probe never grants permission. */
export function hookSettings(port, timeout = 1) {
  return {
    hooks: Object.fromEntries(EVENTS.map((event) => [event, [{ hooks: [{
      type: 'http', url: `http://127.0.0.1:${port}/v1/hooks/${event}`,
      timeout, headers: { Authorization: 'Bearer $SCRIBE_PROBE_TOKEN' },
      allowedEnvVars: ['SCRIBE_PROBE_TOKEN'],
    }] }]])),
  };
}
