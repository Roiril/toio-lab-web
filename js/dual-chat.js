/**
 * 2台モード（トム + イオ）のチャット並走コントローラ。
 * - 既存 chat-area の中身を退避し、縦 2 カラム UI を構築する。
 * - 各カラムごとに独立した LLM / AgentLoop / ToolExecutor を持ち、
 *   ユーザーは各キューブに別々に話しかける。
 * - 1台モードに戻すと UI ・インスタンスを片付けて元に戻す。
 *
 * 使い方:
 *   const dual = new DualChatController({
 *     spatial, sessionMemory, toioBle, simA, chatAreaEl,
 *     llmFactory: () => createLlmClient(),
 *     onProcessingChange: (busy) => { ... },
 *   });
 *   dual.enable();   // 2台モード ON
 *   dual.disable();  // 1台モードに戻す
 */
class DualChatController {
    constructor(opts) {
        this.spatial = opts.spatial;
        this.sessionMemory = opts.sessionMemory;
        this.toioBle = opts.toioBle;
        this.simA = opts.simA;
        this.chatAreaEl = opts.chatAreaEl;
        this.llmFactory = opts.llmFactory;
        this.onProcessingChange = opts.onProcessingChange || (() => {});

        this.simB = null;
        this.dualWrapEl = null;
        this.singleSnapshots = null;
        this.ctxs = [];
    }

    get isEnabled() { return !!this.dualWrapEl; }

    isProcessing() {
        return this.ctxs.some(c => c.isProcessing);
    }

    /** 2台モードを有効化 */
    enable() {
        if (this.isEnabled) return;

        // sim-cube-2 表示 + simB を作成
        const simBEl = document.getElementById('sim-cube-2');
        if (simBEl) simBEl.style.display = 'flex';

        // simA をトム位置にリセット（BLE 接続中なら BLE 通知で上書きされる）
        this.simA.x = 200; this.simA.y = 250; this.simA.angle = 0;

        this.simB = new ToioSim(this.spatial, {
            cubeElementId: 'sim-cube-2',
            initialX: 300, initialY: 250, initialAngle: 180,
        });

        // 既存 chat-area 内の要素を退避
        const chatHistoryEl = this.chatAreaEl.querySelector('.chat-history');
        const chatInputCtnEl = this.chatAreaEl.querySelector('.chat-input-container');
        const scenarioProgressEl = this.chatAreaEl.querySelector('#scenario-progress');
        this.singleSnapshots = {
            chatHistoryEl, chatInputCtnEl, scenarioProgressEl,
            chatHistoryDisplay: chatHistoryEl?.style.display || '',
            chatInputDisplay: chatInputCtnEl?.style.display || '',
        };
        if (chatHistoryEl) chatHistoryEl.style.display = 'none';
        if (chatInputCtnEl) chatInputCtnEl.style.display = 'none';
        if (scenarioProgressEl) scenarioProgressEl.style.display = 'none';

        // dual UI を構築して append
        this.dualWrapEl = this._buildDualUI();
        this.chatAreaEl.appendChild(this.dualWrapEl);

        // ctx 2 つ作成
        const tomCtx = this._buildCtx({
            name: 'トム', cubeKey: 'tom',
            sim: this.simA, ble: this.toioBle, peerName: 'イオ',
        });
        const ioCtx = this._buildCtx({
            name: 'イオ', cubeKey: 'io',
            sim: this.simB, ble: null, peerName: 'トム',
        });
        // peer リファレンスを互いに繋ぐ
        tomCtx.env.setPeer({ sim: ioCtx.sim, ble: null, name: 'イオ' });
        ioCtx.env.setPeer({ sim: tomCtx.sim, ble: this.toioBle, name: 'トム' });

        this.ctxs = [tomCtx, ioCtx];
    }

    /** 2台モードを無効化（1台モードに戻す） */
    disable() {
        if (!this.isEnabled) return;

        // 進行中タスクのキャンセル
        this.ctxs.forEach(c => {
            try { c.agentLoop?.cancel?.(); } catch {}
            try { c.llmClient?.cancel?.(); } catch {}
        });
        this.ctxs = [];

        // dual UI を撤去
        if (this.dualWrapEl) this.dualWrapEl.remove();
        this.dualWrapEl = null;

        // sim-cube-2 を非表示、simB 破棄
        const simBEl = document.getElementById('sim-cube-2');
        if (simBEl) simBEl.style.display = 'none';
        this.simB = null;

        // simA を中央に戻す（BLE 接続中なら直後に BLE 通知で上書きされる）
        this.simA.x = 250; this.simA.y = 250; this.simA.angle = 0;

        // 既存 chat-area の要素を復元
        if (this.singleSnapshots) {
            const { chatHistoryEl, chatInputCtnEl, chatHistoryDisplay, chatInputDisplay } = this.singleSnapshots;
            if (chatHistoryEl) chatHistoryEl.style.display = chatHistoryDisplay;
            if (chatInputCtnEl) chatInputCtnEl.style.display = chatInputDisplay;
            // scenarioProgress は元々 inline の display:none なので触らない
            this.singleSnapshots = null;
        }

        this.onProcessingChange(false);
    }

    /** sim-readout を 2 行表示用にレンダリングするデータを返す */
    getReadoutLines() {
        if (!this.isEnabled) return null;
        return this.ctxs.map(c => {
            const snap = c.env.getSnapshot();
            return {
                key: c.cubeKey,
                name: c.cubeName,
                x: Math.round(snap.cube.x),
                y: Math.round(snap.cube.y),
                angle: Math.round(snap.cube.angle),
            };
        });
    }

    // ------- private -------

    _buildDualUI() {
        const wrap = document.createElement('div');
        wrap.className = 'dual-chat';
        wrap.appendChild(this._buildColumn({
            cubeKey: 'tom', name: 'トム', role: 'シアンのキューブ担当',
            placeholder: 'トムに話しかける... (Enterで送信)',
        }));
        wrap.appendChild(this._buildColumn({
            cubeKey: 'io', name: 'イオ', role: 'マゼンタのキューブ担当 (シミュ専用)',
            placeholder: 'イオに話しかける... (Enterで送信)',
        }));
        return wrap;
    }

    _buildColumn({ cubeKey, name, role, placeholder }) {
        const col = document.createElement('div');
        col.className = 'chat-column';
        col.dataset.cube = cubeKey;
        col.innerHTML = `
            <div class="chat-column-header">
                <span class="cube-tag ${cubeKey}"></span>
                <span class="cube-name">${name}</span>
                <span class="cube-role">${role}</span>
            </div>
            <div class="chat-history">
                <div class="dual-welcome">
                    <div class="dual-welcome-title">${name} と話そう</div>
                    <div>左右で別々のエージェントが動きます。お互い衝突しないよう動きます。</div>
                </div>
            </div>
            <div class="chat-input-container">
                <div class="chat-input-row">
                    <textarea class="chat-input" rows="1" placeholder="${placeholder}"></textarea>
                    <button class="send-btn" disabled aria-label="送信">
                        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                    <button class="stop-btn" style="display:none" aria-label="キャンセル">
                        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none">
                            <rect x="6" y="6" width="12" height="12"></rect>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        return col;
    }

    _buildCtx({ name, cubeKey, sim, ble, peerName }) {
        const colEl = this.dualWrapEl.querySelector(`.chat-column[data-cube="${cubeKey}"]`);
        const chatHistoryEl = colEl.querySelector('.chat-history');
        const chatInputEl = colEl.querySelector('.chat-input');
        const sendBtnEl = colEl.querySelector('.send-btn');
        const cancelBtnEl = colEl.querySelector('.stop-btn');

        const env = new Environment(sim, ble, this.spatial, { selfName: name });
        const toioInterface = new ToioCombined(sim, ble);
        const executor = new ToolExecutor(toioInterface, env, this.sessionMemory);
        const llmClient = this.llmFactory();

        const ctx = {
            cubeName: name, cubeKey, sim, ble, env, executor, llmClient,
            chatHistoryEl, chatInputEl, sendBtnEl, cancelBtnEl,
            isProcessing: false,
            currentActionCard: null,
            ephemeralHint: null,
            agentLoop: null,
        };

        if (llmClient) {
            ctx.agentLoop = new AgentLoop(
                llmClient, executor, env, this.sessionMemory, this.spatial,
                {
                    cubeName: name,
                    peerName: peerName,
                    onStep: (step) => this._handleStep(ctx, step),
                }
            );
        }

        // イベントバインド
        sendBtnEl.addEventListener('click', () => this._submit(ctx));
        cancelBtnEl.addEventListener('click', () => {
            try { ctx.agentLoop?.cancel(); } catch {}
            cancelBtnEl.disabled = true;
        });
        chatInputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._submit(ctx);
            }
        });
        chatInputEl.addEventListener('input', () => {
            sendBtnEl.disabled = chatInputEl.value.trim().length === 0 || ctx.isProcessing;
        });

        return ctx;
    }

    async _submit(ctx) {
        if (ctx.isProcessing) return;
        const text = ctx.chatInputEl.value.trim();
        if (!text) return;
        if (!ctx.agentLoop) {
            this._addMessage(ctx, 'system', 'LLM が接続されていません。設定を確認してください。');
            return;
        }

        ctx.chatInputEl.value = '';
        this._setProcessing(ctx, true);
        this._addMessage(ctx, 'user', text);

        try {
            await ctx.agentLoop.run(text, agentTools);
        } catch (e) {
            this._addMessage(ctx, 'system', 'エラーが発生しました: ' + e.message);
        } finally {
            this._setProcessing(ctx, false);
            this._clearEphemeralHint(ctx);
            if (ctx.currentActionCard) {
                this._finalizeActionCard(ctx, ctx.currentActionCard, '完了');
                ctx.currentActionCard = null;
            }
        }
    }

    _setProcessing(ctx, busy) {
        ctx.isProcessing = busy;
        ctx.sendBtnEl.style.display = busy ? 'none' : '';
        ctx.cancelBtnEl.style.display = busy ? '' : 'none';
        ctx.cancelBtnEl.disabled = false;
        if (!busy && ctx.chatInputEl.value.trim().length > 0) {
            ctx.sendBtnEl.disabled = false;
        } else {
            ctx.sendBtnEl.disabled = true;
        }
        this.onProcessingChange(this.isProcessing());
    }

    _handleStep(ctx, step) {
        if (step.type === 'thinking') {
            if (ctx.currentActionCard) {
                this._finalizeActionCard(ctx, ctx.currentActionCard, step.message);
                ctx.currentActionCard = null;
            } else if (step.iteration === 0) {
                this._renderEphemeralHint(ctx, step.message);
            }
            return;
        }
        this._clearEphemeralHint(ctx);

        switch (step.type) {
            case 'acting':
                if (step.content) this._addMessage(ctx, 'ai', step.content);
                ctx.currentActionCard = this._renderActionCard(ctx, step.toolCalls);
                break;
            case 'done':
                if (ctx.currentActionCard) {
                    this._finalizeActionCard(ctx, ctx.currentActionCard, '完了');
                    ctx.currentActionCard = null;
                }
                if (step.content) this._addMessage(ctx, 'ai', step.content);
                break;
            case 'error':
                if (ctx.currentActionCard) {
                    this._finalizeActionCard(ctx, ctx.currentActionCard, `エラー: ${step.error}`);
                    ctx.currentActionCard = null;
                }
                this._addMessage(ctx, 'system', `エラー: ${step.error}`);
                break;
        }
        this._maybeScroll(ctx);
    }

    _addMessage(ctx, role, text) {
        const div = document.createElement('div');
        div.className = `message ${role}`;
        div.innerHTML = `<div class="message-content">${this._escapeHTML(text)}</div>`;
        ctx.chatHistoryEl.appendChild(div);
        this._maybeScroll(ctx);
    }

    _renderEphemeralHint(ctx, msg) {
        this._clearEphemeralHint(ctx);
        const div = document.createElement('div');
        div.className = 'message system thinking';
        div.innerHTML = `<div class="message-content">${this._escapeHTML(msg)}</div>`;
        ctx.chatHistoryEl.appendChild(div);
        ctx.ephemeralHint = div;
        this._maybeScroll(ctx);
    }

    _clearEphemeralHint(ctx) {
        if (ctx.ephemeralHint) { ctx.ephemeralHint.remove(); ctx.ephemeralHint = null; }
    }

    _renderActionCard(ctx, toolCalls) {
        const card = document.createElement('div');
        card.className = 'message action-card running';
        toolCalls.forEach((tc) => {
            const row = document.createElement('div');
            row.className = 'action-row';

            const icon = document.createElement('span');
            icon.className = 'action-icon';
            icon.textContent = '▶';

            const label = document.createElement('span');
            label.className = 'action-label';
            label.textContent = this._toolLabel(tc);

            const toggle = document.createElement('button');
            toggle.className = 'action-detail-toggle';
            toggle.textContent = 'JSON';
            const detail = document.createElement('div');
            detail.className = 'action-detail';
            detail.textContent = `${tc.function.name}(${JSON.stringify(tc.function.arguments)})`;
            toggle.addEventListener('click', () => detail.classList.toggle('open'));

            row.appendChild(icon);
            row.appendChild(label);
            row.appendChild(toggle);
            card.appendChild(row);
            card.appendChild(detail);
        });
        ctx.chatHistoryEl.appendChild(card);
        this._maybeScroll(ctx);
        return { el: card, toolCalls };
    }

    _finalizeActionCard(ctx, entry, evalMessage) {
        const { el } = entry;
        const isDone = /^完了/.test(evalMessage);
        el.classList.remove('running');
        el.classList.add(isDone ? 'done' : 'warn');
        el.querySelectorAll('.action-icon').forEach(icon => {
            icon.textContent = isDone ? '✓' : '⚠';
        });
        if (!isDone) {
            const note = document.createElement('div');
            note.className = 'action-note';
            note.textContent = evalMessage;
            el.appendChild(note);
        }
        this._maybeScroll(ctx);
    }

    _maybeScroll(ctx) {
        const el = ctx.chatHistoryEl;
        if ((el.scrollHeight - el.scrollTop - el.clientHeight) < 40) {
            el.scrollTop = el.scrollHeight;
        }
    }

    _escapeHTML(str) {
        return String(str).replace(/[&<>'"]/g,
            tag => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[tag] || tag));
    }

    _toolLabel(tc) {
        const name = tc.function.name;
        const a = tc.function.arguments || {};
        const dirMap = { forward:"前", backward:"後ろ", right:"右", left:"左", up:"上", down:"下" };
        const landmarkMap = {
            center:"中央", top:"上", bottom:"下", left:"左", right:"右",
            "top-left":"左上", "top-right":"右上", "bottom-left":"左下", "bottom-right":"右下"
        };
        const presetMap = { small:"少し", medium:"", large:"大きく" };
        switch (name) {
            case "move_relative": {
                const dir = dirMap[a.direction] || a.direction || "前";
                if (a.distance_mm) return `${dir}に ${a.distance_mm}mm 動く`;
                const pre = presetMap[a.distance] ?? "";
                return pre ? `${dir}に${pre}動く` : `${dir}に動く`;
            }
            case "turn": {
                const deg = a.degrees ?? 0;
                if (Math.abs(deg) >= 360) return `その場で${Math.abs(deg) / 360 | 0}回転`;
                return `${Math.abs(deg)}° ${deg >= 0 ? "時計回り" : "反時計回り"}に向く`;
            }
            case "move_to_landmark": {
                const lm = landmarkMap[a.landmark] || a.landmark;
                return `${lm}に移動`;
            }
            case "move_to":      return `座標 (${a.x}, ${a.y}) に移動`;
            case "move_path":    return `経路を辿る (${a.waypoints?.length || 0}点)`;
            case "spin":         return `${((a.duration_ms || 0) / 1000).toFixed(1)}秒 スピン`;
            case "stop":         return "停止";
            case "set_light":    return `光る (rgb ${a.red},${a.green},${a.blue})`;
            case "set_light_pattern": return `光のパターン (${a.frames?.length || 0}色${a.repetitions === 0 ? ' / ループ' : ''})`;
            case "play_sound":   return `音を鳴らす`;
            case "play_melody":  return `メロディを奏でる (${a.notes?.length || 0}音)`;
            case "wait":         return `${((a.duration_ms || 0) / 1000).toFixed(1)}秒 待機`;
            case "get_position": return "位置を確認";
            case "get_battery":  return "バッテリーを確認";
            case "learn_calibration": return `「${a.word}」= ${a.meaning} を記憶`;
            default: return name;
        }
    }
}
