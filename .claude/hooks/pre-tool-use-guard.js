#!/usr/bin/env node
// PreToolUse guard: under bypassPermissions, still prompt before irreversible
// or sensitive operations (per ~/.claude/CLAUDE.md exception list).
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => (buf += d));
process.stdin.on('end', () => {
  try {
    const j = JSON.parse(buf || '{}');
    const tool = j.tool_name || '';
    const input = j.tool_input || {};
    const reasons = [];

    if (tool === 'Bash') {
      const cmd = String(input.command || '');
      if (/\bgit\s+push\b[^\n]*--force(?!-with-lease)/.test(cmd)) reasons.push('git push --force');
      if (/\bgit\s+reset\s+--hard\b/.test(cmd)) reasons.push('git reset --hard');
      if (/\bgit\s+branch\s+-D\b/.test(cmd)) reasons.push('git branch -D');
      if (/\brm\s+-rf?\s+[\/~]/.test(cmd)) reasons.push('rm -rf on root/home');
      if (/\bnpm\s+(uninstall|remove|rm)\b/.test(cmd)) reasons.push('npm uninstall (依存削除)');
    }

    if (tool === 'Write' || tool === 'Edit' || tool === 'NotebookEdit') {
      const fp = String(input.file_path || '');
      if (/(^|[\\/])\.env(\.|$)/i.test(fp)) reasons.push('.env 直接編集');
      if (/js[\\/]config\.js$/i.test(fp)) reasons.push('js/config.js 手動編集（start-app.bat が自動生成）');
    }

    if (reasons.length) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: '⚠️ ' + reasons.join(' / ')
        }
      }));
    }
  } catch {
    // never block on hook error
  }
});
