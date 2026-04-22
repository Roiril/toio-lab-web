#!/usr/bin/env node
// SessionStart hook: inject recent git activity, active plans, and working tree status.
// stdout becomes additional context for the session.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const sections = [];

function run(cmd) {
  try {
    return execSync(cmd, { cwd: projectDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const log = run('git log --oneline -5');
if (log) sections.push('## 直近のコミット\n```\n' + log + '\n```');

const status = run('git status --short');
if (status) sections.push('## 未コミットの変更\n```\n' + status + '\n```');

try {
  const plansDir = path.join(projectDir, '.agent', 'plans');
  if (fs.existsSync(plansDir)) {
    const files = fs.readdirSync(plansDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse()
      .slice(0, 10);
    const active = [];
    for (const f of files) {
      const content = fs.readFileSync(path.join(plansDir, f), 'utf8');
      const fm = content.match(/^---\n([\s\S]*?)\n---/);
      let status = '';
      if (fm) {
        const m = fm[1].match(/^status:\s*(.+)$/m);
        status = m ? m[1].trim() : '';
      } else {
        if (/\[DONE\]/i.test(content.split('\n')[0] || '')) status = 'done';
      }
      if (status && status !== 'done' && status !== 'archived') {
        const titleLine = content.split('\n').find(l => l.startsWith('# ')) || f;
        active.push(`- **${status}** ${f} — ${titleLine.replace(/^#\s*/, '').trim()}`);
      }
    }
    if (active.length) sections.push('## 進行中の計画\n' + active.join('\n'));
  }
} catch {}

if (sections.length) {
  process.stdout.write('# セッション開始時の状態\n\n' + sections.join('\n\n') + '\n');
}
