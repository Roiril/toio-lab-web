/**
 * ScenarioPanel — シナリオモードの UI コンポーネント
 *
 * 2つのビュー:
 *   library — シナリオ一覧
 *   editor  — 新規作成 / 編集
 *
 * 実行中の進捗は chat モードに切り替え、index.html の
 * #scenario-progress ウィジェット（app.js が管理）で表示する。
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
        const initialSteps = this._parseSteps(body);

        const crumbLeaf = isNew ? '新規' : '編集';
        this.el.innerHTML = `
            <div class="sc-toolbar">
                <nav class="sc-breadcrumb" aria-label="現在地">
                    <button type="button" class="sc-crumb sc-crumb-link" id="sc-crumb-root">SCENARIOS</button>
                    <span class="sc-crumb-sep" aria-hidden="true">/</span>
                    <span class="sc-crumb sc-crumb-current">${escapeHTML(crumbLeaf)}${name ? ': ' + escapeHTML(meta.title || name) : ''}</span>
                </nav>
            </div>
            <div class="sc-editor-body">
                <div class="sc-field">
                    <label class="sc-label" for="sc-title-input">タイトル <span class="sc-required">*</span></label>
                    <input type="text" id="sc-title-input" class="sc-input" value="${escapeHTML(meta.title || '')}" placeholder="シナリオのタイトル">
                    <div class="sc-error" id="sc-title-error"></div>
                </div>
                <div class="sc-field">
                    <label class="sc-label" for="sc-desc-input">説明</label>
                    <input type="text" id="sc-desc-input" class="sc-input" value="${escapeHTML(meta.description || '')}" placeholder="概要（任意）">
                </div>
                <div class="sc-field sc-field-grow">
                    <div class="sc-steps-header">
                        <label class="sc-label">ステップ <span class="sc-step-count" id="sc-step-count">0</span></label>
                    </div>
                    <div class="sc-step-list" id="sc-step-list"></div>
                    <button type="button" class="secondary-btn sc-add-step-btn" id="sc-add-step-btn">＋ ステップを追加</button>
                </div>
            </div>
            <div class="sc-editor-footer">
                <span class="sc-editor-hint" id="sc-editor-hint">Ctrl+S 保存 · Esc キャンセル</span>
                <button class="secondary-btn" id="sc-cancel-btn">キャンセル</button>
                <button class="primary-btn" id="sc-save-btn">保存</button>
            </div>`;

        // ─── state ───
        const state = {
            steps: initialSteps.length ? initialSteps : [''],
            initialSnapshot: '',
            dirty: false,
        };
        const snapshot = () => JSON.stringify({
            t: document.getElementById('sc-title-input').value,
            d: document.getElementById('sc-desc-input').value,
            s: state.steps,
        });

        const renderSteps = (focusIndex = -1) => {
            const list = document.getElementById('sc-step-list');
            list.innerHTML = '';
            state.steps.forEach((text, idx) => {
                const row = document.createElement('div');
                row.className = 'sc-step-edit-row';
                row.innerHTML = `
                    <span class="sc-step-edit-num">${idx + 1}</span>
                    <input type="text" class="sc-input sc-step-edit-input" data-idx="${idx}" value="${escapeHTML(text)}" placeholder="ステップの内容">
                    <button type="button" class="icon-btn sc-step-up" data-idx="${idx}" title="上へ移動" ${idx === 0 ? 'disabled' : ''}>↑</button>
                    <button type="button" class="icon-btn sc-step-down" data-idx="${idx}" title="下へ移動" ${idx === state.steps.length - 1 ? 'disabled' : ''}>↓</button>
                    <button type="button" class="icon-btn sc-step-del" data-idx="${idx}" title="削除">✕</button>`;
                list.appendChild(row);
            });
            document.getElementById('sc-step-count').textContent = state.steps.length;

            if (focusIndex >= 0) {
                const inp = list.querySelector(`.sc-step-edit-input[data-idx="${focusIndex}"]`);
                if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
            }
            markDirty();
        };

        const markDirty = () => {
            state.dirty = snapshot() !== state.initialSnapshot;
        };

        const showError = (msg) => {
            const e = document.getElementById('sc-title-error');
            e.textContent = msg;
            e.classList.toggle('visible', !!msg);
        };

        const tryClose = () => {
            if (state.dirty) {
                if (!confirm('未保存の変更があります。破棄してライブラリに戻りますか？')) return;
            }
            this.showLibrary();
        };

        const doSave = () => {
            const title = document.getElementById('sc-title-input').value.trim();
            const desc  = document.getElementById('sc-desc-input').value.trim();
            if (!title) {
                showError('タイトルを入力してください');
                document.getElementById('sc-title-input').focus();
                return;
            }
            showError('');
            const steps = state.steps.map(s => s.trim()).filter(Boolean);
            const stepsBody = steps.map(s => `- [ ] ${s}`).join('\n');
            const markdown = `---\ntitle: "${title.replace(/"/g, '\\"')}"\ndescription: "${desc.replace(/"/g, '\\"')}"\n---\n\n${stepsBody}\n`;
            const sanitized = title.replace(/[^\w-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
            const saveName = name || sanitized || ('scenario-' + Date.now());
            if (this.onSave) this.onSave(saveName, markdown);
        };

        // ─── bindings ───
        document.getElementById('sc-crumb-root').addEventListener('click', tryClose);
        document.getElementById('sc-cancel-btn').addEventListener('click', tryClose);
        document.getElementById('sc-save-btn').addEventListener('click', doSave);

        document.getElementById('sc-title-input').addEventListener('input', () => {
            if (document.getElementById('sc-title-input').value.trim()) showError('');
            markDirty();
        });
        document.getElementById('sc-desc-input').addEventListener('input', markDirty);

        document.getElementById('sc-add-step-btn').addEventListener('click', () => {
            state.steps.push('');
            renderSteps(state.steps.length - 1);
        });

        const list = document.getElementById('sc-step-list');
        list.addEventListener('input', (e) => {
            const inp = e.target.closest('.sc-step-edit-input');
            if (inp) {
                state.steps[+inp.dataset.idx] = inp.value;
                markDirty();
            }
        });
        list.addEventListener('click', (e) => {
            const up = e.target.closest('.sc-step-up');
            const dn = e.target.closest('.sc-step-down');
            const del = e.target.closest('.sc-step-del');
            if (up) {
                const i = +up.dataset.idx;
                [state.steps[i - 1], state.steps[i]] = [state.steps[i], state.steps[i - 1]];
                renderSteps(i - 1);
            } else if (dn) {
                const i = +dn.dataset.idx;
                [state.steps[i + 1], state.steps[i]] = [state.steps[i], state.steps[i + 1]];
                renderSteps(i + 1);
            } else if (del) {
                const i = +del.dataset.idx;
                state.steps.splice(i, 1);
                if (state.steps.length === 0) state.steps.push('');
                renderSteps(Math.min(i, state.steps.length - 1));
            }
        });
        list.addEventListener('keydown', (e) => {
            const inp = e.target.closest('.sc-step-edit-input');
            if (!inp) return;
            const i = +inp.dataset.idx;
            if (e.key === 'Enter') {
                e.preventDefault();
                state.steps.splice(i + 1, 0, '');
                renderSteps(i + 1);
            } else if (e.key === 'Backspace' && inp.value === '' && state.steps.length > 1) {
                e.preventDefault();
                state.steps.splice(i, 1);
                renderSteps(Math.max(0, i - 1));
            }
        });

        // keyboard shortcuts (scoped to editor view)
        this._editorKeyHandler = (e) => {
            if (this.currentView !== 'editor') return;
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                doSave();
            } else if (e.key === 'Escape' && !e.target.matches('input, textarea')) {
                tryClose();
            }
        };
        document.removeEventListener('keydown', this._editorKeyHandler_prev || (() => {}));
        document.addEventListener('keydown', this._editorKeyHandler);
        this._editorKeyHandler_prev = this._editorKeyHandler;

        renderSteps();
        state.initialSnapshot = snapshot();
        state.dirty = false;
    }

    _parseSteps(body) {
        if (!body) return [];
        const out = [];
        body.split('\n').forEach(line => {
            const m = line.match(/^-\s*\[[ xX]\]\s*(.+)/);
            if (m) out.push(m[1].trim());
        });
        return out;
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

}

// escapeHTML はグローバルに定義されていることを前提とするが、
// app.js のスコープの外なので念のためローカル定義する。
function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}
