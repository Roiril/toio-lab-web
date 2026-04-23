/**
 * ScenarioRunner — システム管理のチェックリスト実行エンジン
 *
 * 設計原則:
 *   - チェックリストの状態はシステムが持つ（LLMは知らない）
 *   - LLMはステップごとに agentLoop.run() を1回呼ばれ、実行のみ担当
 *   - agentLoop.onStep は上書きしない。チャット履歴への描画はそのまま動く
 *   - onStepStart(step) コールバックでステップ開始をアプリ側に通知
 */
class ScenarioRunner {
    constructor(agentLoop, { onStateChange, onStepStart } = {}) {
        this.agentLoop = agentLoop;
        this.onStateChange = onStateChange || (() => {});
        this.onStepStart   = onStepStart   || (() => {});
        this.steps = [];
        this.meta = { title: '', description: '' };
        this.status = 'idle'; // idle | running | done | cancelled | error
        this._cancelRequested = false;
    }

    static parseMarkdown(text) {
        const meta = { title: '', description: '' };
        let body = text;

        const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
        if (fm) {
            fm[1].split('\n').forEach(line => {
                const m = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
                if (m) meta[m[1].trim()] = m[2].trim();
            });
            body = fm[2];
        }

        const steps = [];
        let id = 0;
        body.split('\n').forEach(line => {
            const m = line.match(/^-\s*\[[ xX]\]\s*(.+)/);
            if (m) steps.push({ id: id++, text: m[1].trim(), status: 'pending', note: '' });
        });

        return { meta, steps };
    }

    load(markdown) {
        const { meta, steps } = ScenarioRunner.parseMarkdown(markdown);
        this.meta = meta;
        this.steps = steps;
        this.status = 'idle';
        this._cancelRequested = false;
        this.onStateChange();
    }

    async start() {
        if (this.status === 'running') return;
        this.status = 'running';
        this._cancelRequested = false;
        this.onStateChange();

        for (const step of this.steps) {
            if (this._cancelRequested) break;
            if (step.status === 'done') continue;

            // ステップ開始をアプリ側に通知（チャット履歴に区切り線を入れる等）
            this.onStepStart(step);

            step.status = 'active';
            step.note = '実行中...';
            this.onStateChange();

            try {
                const result = await this.agentLoop.run(
                    this._buildStepPrompt(step),
                    agentTools
                );

                if (this._cancelRequested) {
                    step.status = 'pending';
                    step.note = '';
                    break;
                }

                step.note = (result && result.finalMessage) ? result.finalMessage : '完了';
                step.status = 'done';
            } catch (e) {
                step.note = 'エラー: ' + e.message;
                step.status = 'error';
                this.status = 'error';
                this.onStateChange();
                return;
            }

            this.onStateChange();
        }

        this.status = this._cancelRequested ? 'cancelled' : 'done';
        this.onStateChange();
    }

    stop() {
        this._cancelRequested = true;
        this.agentLoop.cancel();
    }

    reset() {
        if (this.status === 'running') this.stop();
        this.steps.forEach(s => { s.status = 'pending'; s.note = ''; });
        this.status = 'idle';
        this.onStateChange();
    }

    _buildStepPrompt(step) {
        const icons = { done: '✅', active: '⏳', error: '❌', pending: '⬜' };
        const checklist = this.steps
            .map(s => `${icons[s.status] || '⬜'} ${s.text}`)
            .join('\n');

        return [
            `## シナリオ: ${this.meta.title}`,
            ``,
            `【チェックリスト全体】`,
            checklist,
            ``,
            `【今実行するステップ】`,
            step.text,
            ``,
            `このステップだけを実行してください。完了したら短く報告してください。`
        ].join('\n');
    }

    get progress() {
        const done = this.steps.filter(s => s.status === 'done').length;
        return { current: done, total: this.steps.length };
    }

    get isRunning() {
        return this.status === 'running';
    }
}
