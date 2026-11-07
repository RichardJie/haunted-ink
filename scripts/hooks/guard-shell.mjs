// PreToolUse (shell): enforce project rules before any shell command runs.
// Exit 2 blocks the call and returns stderr to the agent.
import { readEvent, logEvidence, commandOf } from './lib.mjs';

const OTHER_MODEL_CLIS = new Set([
  'codex', 'claude', 'gemini', 'kimi', 'kimi-code', 'aider', 'ollama', 'llm', 'opencode',
  'cursor-agent', 'oracle', 'pi', 'qwen', 'copilot', 'crush', 'goose', 'amp',
]);

const RULES = [
  [/\bkiro-cli\s+(crew|settings(?!\s+list\b)|login|logout|update|integrations)\b/, 'Kiro CLI crew/settings/login/update changes are out of scope.'],
  [/\b(api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|openrouter\.ai|api\.mistral\.ai|api\.moonshot\.(ai|cn)|api\.deepseek\.com|api\.groq\.com|api\.together\.xyz)\b/i, 'External model APIs are not allowed. Runtime AI must use the local kiro-cli only.'],
  [/\b[A-Z0-9_]*(OPENAI|ANTHROPIC|GEMINI|GOOGLE|MOONSHOT|KIMI|OPENROUTER|MISTRAL|DEEPSEEK|KIRO)_API_KEY\b/, 'API keys are not allowed in this project.'],
  [/\bgit\s+push\b|\bnpm\s+publish\b|\bgh\s+(repo\s+create|release|pr\s+create)\b|\b(vercel|netlify|wrangler|flyctl|firebase)\b.*\bdeploy\b|\bfly\s+deploy\b/, 'Publishing, pushing and deploying are out of scope for this phase.'],
  [/\bnpm\s+(config\s+set|(i|install|add)\b[^;&|]*\s(-g|--global)\b)|\bgit\s+config\s+--global\b|\bbrew\s+(install|upgrade|uninstall)\b|\bdefaults\s+write\b/, 'Changing global configuration or global packages is not allowed.'],
  [/(>|>>|\btee\b|\bcp\b|\bmv\b|\brm\b)[^;&|]*(~|\$HOME|\/Users\/[^/\s]+)\/\.kiro\b/, 'Writing to the global ~/.kiro directory is not allowed.'],
  [/\bsudo\b/, 'sudo is not allowed.'],
  [/\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\s+(\/|~|\$HOME|\.\.)(\s|\/?$)/, 'Recursive deletion of root, home or parent directories is blocked.'],
  [/\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f)/, 'Destructive git commands require an explicit user request.'],
];

function commandWords(cmd) {
  // Split compound commands and return the effective program name of each part.
  return cmd
    .split(/;|&&|\|\||\||\n|\$\(|`/)
    .map((part) => part.trim().split(/\s+/).filter(Boolean))
    .map((words) => {
      let i = 0;
      while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++; // env assignments
      while (i < words.length && ['env', 'exec', 'time', 'nohup', 'command'].includes(words[i])) i++;
      if (['npx', 'bunx'].includes(words[i])) { i++; while (words[i]?.startsWith('-')) i++; }
      if (words[i] === 'pnpm' && words[i + 1] === 'dlx') i += 2;
      return (words[i] ?? '').replace(/^.*\//, '').replace(/@.*$/, '');
    })
    .filter(Boolean);
}

const event = await readEvent();
const cmd = commandOf(event.tool_input);

const offender = commandWords(cmd).find((w) => OTHER_MODEL_CLIS.has(w.toLowerCase()));
if (offender) {
  logEvidence('guard-shell', event, 'block', `other model CLI: ${offender}`);
  console.error(`Blocked by Haunted Ink hook: "${offender}" is another model CLI. Only kiro-cli may be used.`);
  process.exit(2);
}
for (const [re, why] of RULES) {
  if (re.test(cmd)) {
    logEvidence('guard-shell', event, 'block', why);
    console.error(`Blocked by Haunted Ink hook: ${why}`);
    process.exit(2);
  }
}
logEvidence('guard-shell', event, 'allow', cmd.split(/\s+/).slice(0, 4).join(' '));
process.exit(0);
