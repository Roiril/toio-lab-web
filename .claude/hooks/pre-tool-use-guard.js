#!/usr/bin/env node
// Project-specific PreToolUse guard: toio-lab-web 固有チェックのみ。
// 汎用的な不可逆操作ガードはグローバル ~/.claude/hooks/pre-tool-use-guard.js
// 側で行われる。両方が登録されていれば両方走る。
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => (buf += d));
process.stdin.on('end', () => {
  try {
    const j = JSON.parse(buf || '{}');
    const tool = j.tool_name || '';
    const input = j.tool_input || {};
    const reasons = [];

    if (tool === 'Write' || tool === 'Edit' || tool === 'NotebookEdit') {
      const fp = String(input.file_path || '');
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
