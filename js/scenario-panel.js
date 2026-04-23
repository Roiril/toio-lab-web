/**
 * ScenarioPanel — シナリオモードの UI コンポーネント
 *
 * 3つのビュー:
 *   library  — シナリオ一覧
 *   editor   — 新規作成 / 編集
 *   runner   — 実行中チェックリスト
 */
class ScenarioPanel {
    constructor(el) {
        this.el = el;
        this.currentView = null;
        // callbacks set from app.js
        this.onRun = null;
        this.onEdit = null;
        this.onDelete = null;
        this.onSave = null;
        this.onStop = null;
        this.onReset = null;
    }

    // ─── Library view ─────────────────────────────────────

    async showLibrary() {
        this.currentView = 'library';
        this.el.innerHTML = `
            <div class="sc-toolbar">
                <span class="sc-view-title">SCENARIOS</span>
                <button class="secondary-btn sc-new-btn" id="sc-new-btn">＋ 新規</button>
            </div>
            <div class="sc-list" id="sc-list">
                <div class="sc-empty">読み込み中...</div>
            </div>`;

        document.getElementById('sc-new-btn').addEventListener('click', () => {
            this.showEditor(null, '');
        });

        try {
            const res = await fetch('/api/scenarios');
            const scenarios = await res.json();
            this._renderLibraryList(scenarios);
        } catch {
            document.getElementById('sc-list').innerHTML =
                '<div class="sc-empty">シナリオの取得に失敗しました</div>';
        }
    }

    _renderLibraryList(scenarios) {
        const list = document.getElementById('sc-list');
        if (!list) return;
        if (!scenarios.length) {
            list.innerHTML = `
                <div class="sc-empty">
                    <div class="sc-empty-title">シナリオがまだありません</div>
                    <div class="sc-empty-sub">右上の「＋ 新規」から最初のシナリオを作成してください</div>
                </div>`;
            return;
        }
        list.innerHTML = '';
        scenarios.forEach(s => {
            const row = document.createElement('div');
            row.className = 'sc-list-row';
            row.dataset.name = s.name;
            row.title = '行をクリックで実行';
            const stepLabel = (s.stepCount || 0) + ' steps';
            row.innerHTML = `
                <div class="sc-list-icon" aria-hidden="true">▶</div>
                <div class="sc-list-info">
                    <div class="sc-list-title-row">
                        <span class="sc-list-title">${escapeHTML(s.title)}</span>
                        <span class="sc-list-meta">${escapeHTML(stepLabel)}</span>
                    </div>
                    <div class="sc-list-desc">${escapeHTML(s.description || '（説明なし）')}</div>
                </div>
                <div class="sc-list-actions">
                    <button class="icon-btn sc-edit-btn" data-name="${escapeHTML(s.name)}" title="編集" aria-label="編集">✎</button>
                    <button class="icon-btn sc-del-btn" data-name="${escapeHTML(s.name)}" title="削除" aria-label="削除">🗑</button>
                </div>`;
            list.appendChild(row);
        });

        list.addEventListener('click', e => {
            const edit = e.target.closest('.sc-edit-btn');
            const del  = e.target.closest('.sc-del-btn');
            if (edit) {
                e.stopPropagation();
                if (this.onEdit) this.onEdit(edit.dataset.name);
                return;
            }
            if (del) {
                e.stopPropagation();
                if (this.onDelete) this.onDelete(del.dataset.name);
                return;
            }
            const row = e.target.closest('.sc-list-row');
            if (row && this.onRun) this.onRun(row.dataset.name);
        });
    }

    // ─── Editor view ──────────────────────────────────────

    showEditor(name, content) {
        this.currentView = 'editor';
        const isNew = !name;
        const { meta, body } = this._splitContent(content);

        this.el.innerHTML = `
            <div class="sc-toolbar">
                <button class="icon-btn sc-back-btn" id="sc-back-btn">←</button>
                <span class="sc-view-title">${isNew ? 'NEW SCENARIO' : 'EDIT SCENARIO'}</span>
            </div>
            <div class="sc-editor-body">
                <div class="sc-field">
                    <label class="sc-label">TITLE</label>
                    <input type="text" id="sc-title-input" class="sc-input" value="${escapeHTML(meta.title || '')}" placeholder="シナリオのタイトル">
                </div>
                <div class="sc-field">
                    <label class="sc-label">DESCRIPTION</label>
                    <input type="text" id="sc-desc-input" class="sc-input" value="${escapeHTML(meta.description || '')}" placeholder="概要（任意）">
                </div>
                <div class="sc-field sc-field-grow">
                    <label class="sc-label">STEPS（チェックリスト）</label>
                    <textarea id="sc-steps-input" class="sc-textarea" placeholder="- [ ] ステップの内容&#10;- [ ] ステップの内容&#10;...">${escapeHTML(body)}</textarea>
                </div>
            </div>
            <div class="sc-editor-footer">
                <button class="secondary-btn" id="sc-cancel-btn">キャンセル</button>
                <button class="primary-btn" id="sc-save-btn">保存</button>
            </div>`;

        document.getElementById('sc-back-btn').addEventListener('click', () => this.showLibrary());
        document.getElementById('sc-cancel-btn').addEventListener('click', () => this.showLibrary());
        document.getElementById('sc-save-btn').addEventListener('click', () => {
            const title = document.getElementById('sc-title-input').value.trim();
            const desc  = document.getElementById('sc-desc-input').value.trim();
            const steps = document.getElementById('sc-steps-input').value.trim();
            if (!title) { alert('タイトルを入力してください'); return; }
            const markdown = `---\ntitle: "${title}"\ndescription: "${desc}"\n---\n\n${steps}\n`;
            const saveName = name || title.replace(/[^\w-]/g, '-').replace(/-+/g, '-').toLowerCase();
            if (this.onSave) this.onSave(saveName, markdown);
        });
    }

    _splitContent(content) {
        if (!content) return { meta: {}, body: '' };
        const meta = {};
        let body = content;
        const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
        if (fm) {
            fm[1].split('\n').forEach(line => {
                const m = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
                if (m) meta[m[1].trim()] = m[2].trim();
            });
            body = fm[2].trim();
        }
        return { meta, body };
    }

    // ─── Runner view ──────────────────────────────────────

    showRunner(runner) {
        this.currentView = 'runner';
        this.el.innerHTML = `
            <div class="sc-toolbar sc-runner-toolbar">
                <button class="icon-btn sc-back-btn" id="sc-back-btn">←</button>
                <span class="sc-view-title sc-runner-title">${escapeHTML(runner.meta.title)}</span>
                <div class="sc-runner-controls">
                    <button class="secondary-btn" id="sc-reset-btn" style="display:none">リセット</button>
                    <button class="primary-btn sc-stop-btn" id="sc-stop-btn">停止</button>
                </div>
            </div>
            <div class="sc-progress-bar-wrap">
                <div class="sc-progress-bar" id="sc-progress-bar" style="width:0%"></div>
            </div>
            <div class="sc-progress-label" id="sc-progress-label">0 / ${runner.steps.length} ステップ完了</div>
            <div class="sc-checklist" id="sc-checklist"></div>
            <div class="sc-status-bar" id="sc-status-bar"></div>`;

        document.getElementById('sc-back-btn').addEventListener('click', () => {
            if (runner.isRunning) runner.stop();
            this.showLibrary();
        });
        document.getElementById('sc-stop-btn').addEventListener('click', () => {
            if (this.onStop) this.onStop();
        });
        document.getElementById('sc-reset-btn').addEventListener('click', () => {
            if (this.onReset) this.onReset();
        });

        this._updateRunnerDOM(runner);
    }

    updateRunner(runner) {
        if (this.currentView !== 'runner') return;
        this._updateRunnerDOM(runner);
    }

    _updateRunnerDOM(runner) {
        const p = runner.progress;

        // progress bar
        const pct = p.total > 0 ? Math.round((p.current / p.total) * 100) : 0;
        const bar = document.getElementById('sc-progress-bar');
        if (bar) bar.style.width = pct + '%';

        const label = document.getElementById('sc-progress-label');
        if (label) label.textContent = `${p.current} / ${p.total} ステップ完了`;

        // progress bar color (complete = ok)
        if (bar) {
            bar.classList.toggle('sc-progress-bar-done', runner.status === 'done');
        }

        // checklist
        const cl = document.getElementById('sc-checklist');
        if (cl) {
            cl.innerHTML = '';
            let activeRow = null;
            runner.steps.forEach(step => {
                const row = document.createElement('div');
                row.className = 'sc-step sc-step-' + step.status;

                const icon = document.createElement('span');
                icon.className = 'sc-step-icon';
                icon.setAttribute('aria-hidden', 'true');

                const text = document.createElement('span');
                text.className = 'sc-step-text';
                text.textContent = step.text;

                row.appendChild(icon);
                row.appendChild(text);

                if (step.note && (step.status === 'done' || step.status === 'error' || step.status === 'active')) {
                    const note = document.createElement('div');
                    note.className = 'sc-step-note';
                    note.textContent = step.note;
                    row.appendChild(note);
                }

                cl.appendChild(row);
                if (step.status === 'active') activeRow = row;
            });

            if (activeRow) {
                activeRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }

        // status bar + button states
        const stopBtn  = document.getElementById('sc-stop-btn');
        const resetBtn = document.getElementById('sc-reset-btn');
        const statusBar = document.getElementById('sc-status-bar');

        const statusText = {
            idle:      '',
            running:   '実行中...',
            done:      'シナリオ完了',
            cancelled: 'キャンセルされました',
            error:     'エラーが発生しました',
        }[runner.status] || '';

        if (statusBar) statusBar.textContent = statusText;

        if (stopBtn) stopBtn.style.display  = runner.status === 'running' ? '' : 'none';
        if (resetBtn) resetBtn.style.display = runner.status !== 'running' && runner.status !== 'idle' ? '' : 'none';
    }
}

// escapeHTML はグローバルに定義されていることを前提とするが、
// app.js のスコープの外なので念のためローカル定義する。
function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}
