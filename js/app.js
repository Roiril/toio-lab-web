/**
 * Main App Logic integrated with Agent Loop
 */

document.addEventListener("DOMContentLoaded", () => {
    // --- UI Elements ---
    const chatHistory = document.getElementById("chat-history");
    const chatInput = document.getElementById("chat-input");
    const sendBtn = document.getElementById("send-btn");
    const cancelBtn = document.getElementById("cancel-btn");
    
    const llmStatusDot = document.getElementById("llm-status-dot");
    const llmStatusText = document.getElementById("llm-status-text");
    
    const llmProviderSelect = document.getElementById("llm-provider");
    const geminiSettingsGroup = document.getElementById("gemini-settings-group");
    const ollamaSettingsGroup = document.getElementById("ollama-settings-group");
    const ollamaBaseUrlInput = document.getElementById("ollama-base-url");
    const ollamaModelInput = document.getElementById("ollama-model");

    const geminiApiKeyInput = document.getElementById("gemini-api-key");
    const geminiModelInput = document.getElementById("gemini-model");

    const toioStatusDot = document.getElementById("toio-status-dot");
    const toioStatusText = document.getElementById("toio-status-text");
    const cubeInfo = document.getElementById("cube-info");
    const batteryLevel = document.getElementById("battery-level");
    const connectToioBtn = document.getElementById("connect-toio-btn");
    const disconnectToioBtn = document.getElementById("disconnect-toio-btn");

    const settingsBtn = document.getElementById("settings-btn");
    const settingsModal = document.getElementById("settings-modal");
    const closeSettingsBtn = document.getElementById("close-settings-btn");
    const saveSettingsBtn = document.getElementById("save-settings-btn");
    const clearMemoryBtn = document.getElementById("clear-memory-btn");

    // Camera UI elements
    const cameraStatusDot = document.getElementById("camera-status-dot");
    const cameraStatusText = document.getElementById("camera-status-text");
    const cameraPreviewImg = document.getElementById("camera-preview-img");
    const cameraPlaceholder = document.getElementById("camera-placeholder");
    const cameraConnectBtn = document.getElementById("camera-connect-btn");
    const cameraPreviewBtn = document.getElementById("camera-preview-btn");
    const cameraCaptureBtn = document.getElementById("camera-capture-btn");
    const cameraAttachPreview = document.getElementById("camera-attach-preview");
    const cameraAttachImg = document.getElementById("camera-attach-img");
    const cameraAttachClear = document.getElementById("camera-attach-clear");
    const cameraUrlInput = document.getElementById("camera-url-input");

    // --- State & Instances ---
    const spatialAwareness = new SpatialAwareness();
    const toioBle = new ToioBLE();
    const toioSim = new ToioSim(spatialAwareness);

    const combinedToio = new ToioCombined(toioSim, toioBle);

    // LocalStorage を優先し、未設定時のみ config.js にフォールバック。
    const savedProvider = localStorage.getItem('llm_provider') || window.APP_CONFIG?.LLM_PROVIDER || 'ollama';
    const savedApiKey = localStorage.getItem('gemini_api_key') || window.APP_CONFIG?.GEMINI_API_KEY || '';
    const savedGeminiModel = localStorage.getItem('gemini_model') || window.APP_CONFIG?.GEMINI_MODEL || 'gemini-2.5-flash';
    const savedOllamaBaseUrl = localStorage.getItem('ollama_base_url') || window.APP_CONFIG?.OLLAMA_URL || 'http://localhost:11434';
    const savedOllamaModel = localStorage.getItem('ollama_model') || window.APP_CONFIG?.OLLAMA_MODEL || 'gemma4:e4b';
    const savedCameraUrl = localStorage.getItem('camera_url') || '';

    if (llmProviderSelect) llmProviderSelect.value = savedProvider;
    if (geminiApiKeyInput) geminiApiKeyInput.value = savedApiKey;
    if (geminiModelInput) geminiModelInput.value = savedGeminiModel;
    if (ollamaBaseUrlInput) ollamaBaseUrlInput.value = savedOllamaBaseUrl;
    if (ollamaModelInput) ollamaModelInput.value = savedOllamaModel;
    if (cameraUrlInput) cameraUrlInput.value = savedCameraUrl;

    // プロバイダー変更時に設定の表示を切り替える
    const updateSettingsVisibility = () => {
        const provider = llmProviderSelect.value;
        geminiSettingsGroup.style.display = provider === 'gemini' ? 'block' : 'none';
        ollamaSettingsGroup.style.display = provider === 'ollama' ? 'block' : 'none';
    };
    if (llmProviderSelect) {
        llmProviderSelect.addEventListener('change', updateSettingsVisibility);
        updateSettingsVisibility();
    }

    let llmClient = null;
    if (savedProvider === 'ollama') {
        llmClient = new OllamaClient(savedOllamaBaseUrl, savedOllamaModel);
    } else if (savedProvider === 'gemini') {
        llmClient = new GeminiClient(savedApiKey, savedGeminiModel);
    }

    const sessionMemory = new SessionMemory();
    const environment = new Environment(toioSim, toioBle, spatialAwareness);
    const executor = new ToolExecutor(combinedToio, environment, sessionMemory);
    const cameraClient = new CameraClient(savedCameraUrl);

    // UI state
    let isProcessingChat = false;
    let pendingCameraCapture = null; // base64 string to attach to next LLM message
    let hasSyncedInitialPosition = false;

    // Agent Loop initialization
    let agentLoop = llmClient
        ? new AgentLoop(llmClient, executor, environment, sessionMemory, spatialAwareness, { onStep: handleAgentStep })
        : null;

    // --- initialization ---
    checkLlmConnection();
    updateToioUIState();
    if (savedCameraUrl) {
        cameraClient.checkConnection().then(updateCameraStatus);
    }

    // Sync loop removed: sim now mirrors BLE via onIdUpdateCallback.

    // --- Event Listeners ---

    connectToioBtn.addEventListener('click', async () => {
        try {
            await toioBle.connect();
            updateToioUIState();
            addMessage("system", "toioキューブに接続しました！準備完了です。");
        } catch (e) {
            alert("Bluetooth接続に失敗しました: " + e.message);
        }
    });

    disconnectToioBtn.addEventListener('click', () => {
        toioBle.disconnect();
        updateToioUIState();
    });

    toioBle.onDisconnectCallback = () => {
        updateToioUIState();
        hasSyncedInitialPosition = false;
        addMessage("system", "toioキューブが切断されました。自動再接続を試みています...");
    };

    toioBle.onReconnectCallback = () => {
        updateToioUIState();
        addMessage("system", "toioキューブに再接続しました。");
    };

    toioBle.onBatteryUpdateCallback = (batt) => {
        batteryLevel.innerText = `${batt}%`;
    };

    toioBle.onIdUpdateCallback = (pos) => {
        // Always mirror sim to physical cube position for live visual display.
        toioSim.x = pos.x;
        toioSim.y = pos.y;
        toioSim.angle = pos.angle;
        if (!hasSyncedInitialPosition) {
            hasSyncedInitialPosition = true;
            console.log("Initial position synced from physical cube:", pos);
        }

        const ghostCube = document.getElementById('ghost-cube');
        if (ghostCube && toioBle.isConnected) {
            const simPos = toioSim.matToSim(pos.x, pos.y);
            ghostCube.style.left = `${simPos.x}px`;
            ghostCube.style.top = `${simPos.y}px`;
            ghostCube.style.transform = `translate(-50%, -50%) rotate(${pos.angle + 90}deg)`;
        }
    };

    sendBtn.addEventListener('click', submitChat);
    cancelBtn.addEventListener('click', () => {
        if (agentLoop) {
            agentLoop.cancel();
            cancelBtn.disabled = true;
        }
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitChat();
        }
    });

    chatInput.addEventListener('input', () => {
        sendBtn.disabled = chatInput.value.trim().length === 0 || isProcessingChat;
    });

    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('active');
        renderCalibrationList();
    });
    closeSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('active'));

    clearMemoryBtn.addEventListener('click', () => {
        sessionMemory.clear();
        renderCalibrationList();
        alert("セッション記憶をクリアしました。");
    });

    // Quick-start chips（ウェルカム下のクリックで即送信）
    const quickStarts = document.getElementById('quick-starts');
    if (quickStarts) {
        quickStarts.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-prompt]');
            if (!btn || isProcessingChat) return;
            chatInput.value = btn.dataset.prompt;
            submitChat();
        });
    }

    // シミュレータ下の座標/角度表示を更新するループ（軽量）
    const simReadout = document.getElementById('sim-readout');
    if (simReadout) {
        setInterval(() => {
            const snap = environment.getSnapshot();
            const c = snap.cube;
            simReadout.textContent = `(${Math.round(c.x)}, ${Math.round(c.y)}) · ${Math.round(c.angle)}°`;
        }, 120);
    }

    saveSettingsBtn.addEventListener('click', () => {
        const newProvider = llmProviderSelect.value;
        const newApiKey = geminiApiKeyInput.value.trim();
        const newGeminiModel = geminiModelInput.value.trim() || 'gemini-2.5-flash';
        const newOllamaBaseUrl = ollamaBaseUrlInput.value.trim() || 'http://localhost:11434';
        const newOllamaModel = ollamaModelInput.value.trim() || 'gemma4:e4b';

        localStorage.setItem('llm_provider', newProvider);
        localStorage.setItem('gemini_api_key', newApiKey);
        localStorage.setItem('gemini_model', newGeminiModel);
        localStorage.setItem('ollama_base_url', newOllamaBaseUrl);
        localStorage.setItem('ollama_model', newOllamaModel);

        const newCameraUrl = cameraUrlInput.value.trim();
        localStorage.setItem('camera_url', newCameraUrl);

        const providerChanged = newProvider !== savedProvider;
        if (providerChanged) {
            location.reload();
            return;
        }

        if (newProvider === 'ollama') {
            llmClient = new OllamaClient(newOllamaBaseUrl, newOllamaModel);
        } else if (newProvider === 'gemini') {
            llmClient = new GeminiClient(newApiKey, newGeminiModel);
        }

        // Re-init agent loop
        if (llmClient) {
            agentLoop = new AgentLoop(llmClient, executor, environment, sessionMemory, spatialAwareness, {
                onStep: handleAgentStep
            });
        }

        cameraClient.setUrl(newCameraUrl);
        if (newCameraUrl) {
            cameraClient.checkConnection().then(updateCameraStatus);
        } else {
            updateCameraStatus(false);
        }

        settingsModal.classList.remove('active');
        checkLlmConnection();

        const originalText = saveSettingsBtn.textContent;
        saveSettingsBtn.textContent = '保存しました ✓';
        saveSettingsBtn.disabled = true;
        setTimeout(() => {
            saveSettingsBtn.textContent = originalText;
            saveSettingsBtn.disabled = false;
        }, 1500);
    });

    // Camera event listeners
    let isPreviewing = false;

    cameraConnectBtn.addEventListener('click', async () => {
        cameraConnectBtn.disabled = true;
        cameraConnectBtn.textContent = '確認中...';
        const ok = await cameraClient.checkConnection();
        updateCameraStatus(ok);
        cameraConnectBtn.disabled = false;
        cameraConnectBtn.textContent = ok ? 'Reconnect' : 'Connect';
        if (!ok) addMessage("system", "カメラに接続できませんでした。設定でURLを確認してください。");
    });

    cameraPreviewBtn.addEventListener('click', () => {
        if (isPreviewing) {
            cameraClient.stopPreview();
            isPreviewing = false;
            cameraPreviewBtn.textContent = 'Preview';
            cameraPreviewImg.style.display = 'none';
            cameraPlaceholder.style.display = 'flex';
        } else {
            cameraPreviewImg.style.display = 'block';
            cameraPlaceholder.style.display = 'none';
            cameraClient.startPreview(cameraPreviewImg, 5);
            isPreviewing = true;
            cameraPreviewBtn.textContent = 'Stop';
        }
    });

    cameraCaptureBtn.addEventListener('click', async () => {
        cameraCaptureBtn.disabled = true;
        try {
            const base64 = await cameraClient.captureBase64();
            pendingCameraCapture = base64;
            cameraAttachImg.src = base64;
            cameraAttachPreview.style.display = 'flex';
            cameraCaptureBtn.classList.add('has-capture');
        } catch (e) {
            addMessage("system", "カメラキャプチャ失敗: " + e.message);
        } finally {
            cameraCaptureBtn.disabled = false;
        }
    });

    cameraAttachClear.addEventListener('click', clearCameraAttach);

    // Quick Actions were removed from UI


    // --- Functions ---
    function updateToioUIState() {
        const connected = toioBle.isConnected;
        const ghostCube = document.getElementById('ghost-cube');

        if (connected) {
            toioStatusDot.className = "dot connected";
            toioStatusText.innerText = "Connected (BLE + Sim)";
            cubeInfo.style.display = "block";
            connectToioBtn.disabled = true;
            disconnectToioBtn.disabled = false;
            if (ghostCube) ghostCube.style.display = "flex";
        } else {
            toioStatusDot.className = "dot connected"; // Sim is always connected
            toioStatusText.innerText = "Simulator Only";
            cubeInfo.style.display = "block";
            batteryLevel.innerText = "100%";
            connectToioBtn.disabled = false;
            disconnectToioBtn.disabled = true;
            if (ghostCube) ghostCube.style.display = "none";
        }
    }

    async function checkLlmConnection() {
        if (!llmClient) {
            llmStatusDot.className = "dot disconnected";
            llmStatusText.innerText = "No LLM Provider Selected";
            return;
        }
        const isOllama = llmClient instanceof OllamaClient;
        const providerName = isOllama ? "Ollama" : "Gemini";
        llmStatusText.innerText = `${providerName}: Checking...`;
        
        let ok, reason;
        try {
            const res = await llmClient.checkConnection();
            if (typeof res === "object") {
                ok = res.ok;
                reason = res.reason;
            } else {
                ok = res;
                reason = "Unknown Error";
            }
        } catch (e) {
            ok = false;
            reason = e.message;
        }

        if (ok) {
            llmStatusDot.className = "dot connected";
            llmStatusText.innerText = `${providerName}: Ready (${llmClient.model})`;
        } else {
            llmStatusDot.className = "dot disconnected";
            llmStatusText.innerText = `${providerName}: Error — ${reason || "Connection failed"}`;
        }
    }

    async function submitChat() {
        if (isProcessingChat || !chatInput.value.trim()) return;

        const text = chatInput.value.trim();
        chatInput.value = "";

        // --- Local LLM (Ollama / Gemini) ---
        if (pendingCameraCapture) {
            llmClient.pendingImage = pendingCameraCapture;
            pendingCameraCapture = null;
            clearCameraAttach();
        }

        setChatProcessingState(true);
        addMessage("user", text);

        try {
            await agentLoop.run(text, agentTools);
        } catch (e) {
            addMessage("system", "エラーが発生しました: " + e.message);
        } finally {
            setChatProcessingState(false);
            clearEphemeralHint();
            if (currentActionCard) {
                finalizeActionCard(currentActionCard, "完了");
                currentActionCard = null;
            }
        }
    }

    function clearCameraAttach() {
        pendingCameraCapture = null;
        cameraAttachPreview.style.display = 'none';
        cameraAttachImg.src = '';
        cameraCaptureBtn.classList.remove('has-capture');
    }

    function updateCameraStatus(connected) {
        cameraStatusDot.className = connected ? 'dot connected' : 'dot disconnected';
        cameraStatusText.innerText = connected ? 'Connected' : 'Disconnected';
        cameraPreviewBtn.disabled = !connected;
        cameraCaptureBtn.disabled = !connected;
    }

    function setChatProcessingState(isProcessing) {
        isProcessingChat = isProcessing;
        sendBtn.style.display = isProcessing ? 'none' : 'block';
        cancelBtn.style.display = isProcessing ? 'block' : 'none';
        cancelBtn.disabled = false;
        if (!isProcessing && chatInput.value.trim().length > 0) {
            sendBtn.disabled = false;
        } else {
            sendBtn.disabled = true;
        }
        // Quick-start chips は処理中は無効化
        document.querySelectorAll('.quick-starts .chip').forEach(btn => {
            btn.disabled = isProcessing;
        });
    }

    // --- Action card rendering ---
    let currentActionCard = null; // {el, toolCalls}

    function handleAgentStep(step) {
        if (step.type === 'thinking') {
            // 初回の「解析中...」だけは表示。以降の評価メッセージは直前の action card に吸収する。
            if (currentActionCard) {
                finalizeActionCard(currentActionCard, step.message);
                currentActionCard = null;
            } else if (step.iteration === 0) {
                renderEphemeralHint(step.message);
            }
            return;
        }

        // 他の非 thinking メッセージが来たら ephemeral hint は消す
        clearEphemeralHint();

        switch (step.type) {
            case 'acting':
                if (step.content) addMessage("ai", step.content);
                currentActionCard = renderActionCard(step.toolCalls);
                break;
            case 'done':
                if (currentActionCard) {
                    finalizeActionCard(currentActionCard, "完了");
                    currentActionCard = null;
                }
                if (step.content) addMessage("ai", step.content);
                break;
            case 'error':
                if (currentActionCard) {
                    finalizeActionCard(currentActionCard, `エラー: ${step.error}`);
                    currentActionCard = null;
                }
                renderSystemMessage(`エラー: ${step.error}`, 'error', false);
                break;
        }
        maybeScroll();
    }

    // 「解析中…」を一行出して、次のステップで消える一時表示
    let ephemeralHint = null;
    function renderEphemeralHint(msg) {
        clearEphemeralHint();
        const div = document.createElement('div');
        div.className = 'message system thinking';
        div.innerHTML = `<div class="message-content">${escapeHTML(msg)}</div>`;
        chatHistory.appendChild(div);
        ephemeralHint = div;
        maybeScroll();
    }
    function clearEphemeralHint() {
        if (ephemeralHint) { ephemeralHint.remove(); ephemeralHint = null; }
    }

    function renderActionCard(toolCalls) {
        const card = document.createElement('div');
        card.className = 'message action-card running';
        toolCalls.forEach((tc, i) => {
            const row = document.createElement('div');
            row.className = 'action-row';

            const icon = document.createElement('span');
            icon.className = 'action-icon';
            icon.textContent = '▶';

            const label = document.createElement('span');
            label.className = 'action-label';
            label.textContent = toolLabel(tc);

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
        chatHistory.appendChild(card);
        maybeScroll();
        return { el: card, toolCalls };
    }

    function finalizeActionCard(entry, evalMessage) {
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
        maybeScroll();
    }

    function renderSystemMessage(text, className, stick = false) {
        const div = document.createElement('div');
        div.className = `message system ${className || ''}`;
        div.innerHTML = `<div class="message-content">${escapeHTML(text)}</div>`;
        chatHistory.appendChild(div);
        maybeScroll();
        return div;
    }

    function addMessage(role, text) {
        const div = document.createElement("div");
        div.className = `message ${role}`;
        div.innerHTML = `<div class="message-content">${escapeHTML(text)}</div>`;
        chatHistory.appendChild(div);
        maybeScroll();
    }

    // ユーザーが上方にスクロールしていたら下に飛ばさない
    function isScrolledNearBottom() {
        const el = chatHistory;
        return (el.scrollHeight - el.scrollTop - el.clientHeight) < 40;
    }
    function maybeScroll() {
        if (isScrolledNearBottom()) {
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }
    }

    function escapeHTML(str) {
        return String(str).replace(/[&<>'"]/g,
            tag => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;',
                "'": '&#39;', '"': '&quot;'
            }[tag] || tag)
        );
    }

    // --- Tool call → 自然言語ラベル ---
    function toolLabel(tc) {
        const name = tc.function.name;
        const a = tc.function.arguments || {};
        const dirMap = { forward:"前", backward:"後ろ", right:"右", left:"左", up:"上", down:"下" };
        const landmarkMap = {
            center:"中央", top:"上", bottom:"下", left:"左", right:"右",
            "top-left":"左上", "top-right":"右上",
            "bottom-left":"左下", "bottom-right":"右下"
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
            case "set_light": {
                const c = colorName(a.red, a.green, a.blue);
                return `${c}に光る`;
            }
            case "set_light_pattern":
                return `光のパターン (${a.frames?.length || 0}色${a.repetitions === 0 ? ' / ループ' : ''})`;
            case "play_sound":   return `音を鳴らす`;
            case "play_melody":  return `メロディを奏でる (${a.notes?.length || 0}音)`;
            case "wait":         return `${((a.duration_ms || 0) / 1000).toFixed(1)}秒 待機`;
            case "get_position": return "位置を確認";
            case "get_battery":  return "バッテリーを確認";
            case "learn_calibration": return `「${a.word}」= ${a.meaning} を記憶`;
            default: return name;
        }
    }

    // --- Calibration viewer in settings modal ---
    function renderCalibrationList() {
        const list = document.getElementById('calibration-list');
        if (!list) return;
        const entries = Object.entries(sessionMemory.getCalibrations());
        if (entries.length === 0) {
            list.innerHTML = '<div class="calibration-empty">（まだ記憶はありません）</div>';
            return;
        }
        list.innerHTML = '';
        entries
            .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0))
            .forEach(([word, entry]) => {
                const row = document.createElement('div');
                row.className = 'calibration-row';
                const w = document.createElement('span');
                w.className = 'calibration-word';
                w.textContent = word;
                const m = document.createElement('span');
                m.className = 'calibration-meaning';
                m.textContent = entry.meaning;
                const rm = document.createElement('button');
                rm.className = 'calibration-remove';
                rm.textContent = '削除';
                rm.addEventListener('click', () => {
                    sessionMemory.removeCalibration(word);
                    renderCalibrationList();
                });
                row.appendChild(w);
                row.appendChild(m);
                row.appendChild(rm);
                list.appendChild(row);
            });
    }

    function colorName(r, g, b) {
        r = r|0; g = g|0; b = b|0;
        if (r > 200 && g < 80  && b < 80)  return "赤";
        if (r < 80  && g > 200 && b < 80)  return "緑";
        if (r < 80  && g < 80  && b > 200) return "青";
        if (r > 200 && g > 200 && b < 80)  return "黄";
        if (r < 80  && g > 200 && b > 200) return "シアン";
        if (r > 200 && g < 80  && b > 200) return "マゼンタ";
        if (r > 220 && g > 220 && b > 220) return "白";
        if (r < 40  && g < 40  && b < 40)  return "消灯";
        return `rgb(${r},${g},${b})`;
    }
});
