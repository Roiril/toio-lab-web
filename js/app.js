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

    const claudeCodeSettingsGroup = document.getElementById("claude-code-settings-group");
    const mcpWsPortInput = document.getElementById("mcp-ws-port");

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
    // デフォルトは Claude Code (MCP Bridge) — ブラウザ → dev-server → claude CLI → MCP → BLE。
    const savedProvider = localStorage.getItem('llm_provider') || window.APP_CONFIG?.LLM_PROVIDER || 'claude-code';
    const savedApiKey = localStorage.getItem('gemini_api_key') || window.APP_CONFIG?.GEMINI_API_KEY || '';
    const savedGeminiModel = localStorage.getItem('gemini_model') || window.APP_CONFIG?.GEMINI_MODEL || 'gemini-2.5-flash';
    const savedOllamaBaseUrl = localStorage.getItem('ollama_base_url') || window.APP_CONFIG?.OLLAMA_URL || 'http://localhost:11434';
    const savedOllamaModel = localStorage.getItem('ollama_model') || window.APP_CONFIG?.OLLAMA_MODEL || 'gemma4:e4b';
    const savedMcpWsPort = Number(localStorage.getItem('mcp_ws_port')) || 7777;
    const savedCameraUrl = localStorage.getItem('camera_url') || '';

    if (llmProviderSelect) llmProviderSelect.value = savedProvider;
    if (geminiApiKeyInput) geminiApiKeyInput.value = savedApiKey;
    if (geminiModelInput) geminiModelInput.value = savedGeminiModel;
    if (ollamaBaseUrlInput) ollamaBaseUrlInput.value = savedOllamaBaseUrl;
    if (ollamaModelInput) ollamaModelInput.value = savedOllamaModel;
    if (mcpWsPortInput) mcpWsPortInput.value = savedMcpWsPort;
    if (cameraUrlInput) cameraUrlInput.value = savedCameraUrl;

    // プロバイダー変更時に設定の表示を切り替える
    const updateSettingsVisibility = () => {
        const provider = llmProviderSelect.value;
        geminiSettingsGroup.style.display = provider === 'gemini' ? 'block' : 'none';
        ollamaSettingsGroup.style.display = provider === 'ollama' ? 'block' : 'none';
        if (claudeCodeSettingsGroup) {
            claudeCodeSettingsGroup.style.display = provider === 'claude-code' ? 'block' : 'none';
        }
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
    // provider === 'claude-code' → llmClient stays null; chat input is disabled.

    const sessionMemory = new SessionMemory();
    const environment = new Environment(toioSim, toioBle, spatialAwareness);
    const executor = new ToolExecutor(combinedToio, environment);
    const cameraClient = new CameraClient(savedCameraUrl);

    // UI state
    let isAgentRunning = false;
    let isProcessingChat = false;
    let pendingCameraCapture = null; // base64 string to attach to next LLM message
    let currentThinkingNode = null;
    let hasSyncedInitialPosition = false;

    // Agent Loop initialization (skipped when running as an MCP bridge)
    let agentLoop = llmClient
        ? new AgentLoop(llmClient, executor, environment, sessionMemory, spatialAwareness, { onStep: handleAgentStep })
        : null;

    // --- initialization ---
    checkLlmConnection();
    updateToioUIState();
    if (savedCameraUrl) {
        cameraClient.checkConnection().then(updateCameraStatus);
    }

    // --- MCP Bridge ---
    // Enabled when provider === 'claude-code', or forced via ?mcp=1 URL param.
    const urlParams = new URLSearchParams(window.location.search);
    const forceBridge = urlParams.get('mcp') === '1';
    const bridgeEnabled = forceBridge || savedProvider === 'claude-code';

    if (bridgeEnabled) {
        const mcpPort = Number(urlParams.get('mcpPort')) || savedMcpWsPort;
        const bridge = new McpBridge(executor, {
            port: mcpPort,
            onStatus: ({ state, url }) => {
                if (state === 'open') {
                    addMessage("system", `MCPブリッジ接続 (${url || `ws://localhost:${mcpPort}`}) — toioツールが利用可能になりました。`);
                } else if (state === 'disconnected') {
                    addMessage("system", "MCPブリッジ切断。Claudeがツールを呼ぶと自動で再接続します。");
                }
            }
        });
        bridge.connect();
        window.mcpBridge = bridge;
    }

    // --- Claude Chat Client (for claude-code provider) ---
    // ブラウザのチャット入力を dev-server の /claude WS に中継し、claude CLI へ渡す。
    let claudeChat = null;
    if (savedProvider === 'claude-code') {
        claudeChat = new ClaudeChatClient({
            onMessage: (msg) => {
                switch (msg.type) {
                    case 'ready':
                        console.log('[ClaudeChat] ready, model:', msg.model, 'streaming:', msg.streaming);
                        break;
                    case 'working':
                        // Already showing "processing" from submitChat
                        break;
                    case 'assistant': {
                        const meta = [];
                        if (msg.latency_ms) meta.push(`${Math.round(msg.latency_ms)}ms`);
                        const suffix = meta.length ? `\n\n_(${meta.join(' · ')})_` : '';
                        addMessage('ai', (msg.text || '(空のレスポンス)') + suffix);
                        // Don't close state yet — wait for 'result'
                        break;
                    }
                    case 'result':
                        // Turn complete
                        setChatProcessingState(false);
                        break;
                    case 'error':
                        addMessage('system', `エラー: ${msg.error}`);
                        setChatProcessingState(false);
                        break;
                    case 'reset-ack':
                        addMessage('system', 'Claudeセッションをリセットしました。');
                        break;
                    case 'disconnected':
                        // claude プロセスが落ちた — 次メッセージで再起動される
                        console.log('[ClaudeChat] claude process disconnected');
                        break;
                }
            },
            onStatus: ({ state }) => {
                if (state === 'open') {
                    addMessage('system', 'Claude Code バックエンド接続 (Haiku, streaming mode)。');
                } else if (state === 'closed') {
                    addMessage('system', 'Claude Code バックエンド切断。再接続を試行中...');
                }
            }
        });
        claudeChat.connect();
        window.claudeChat = claudeChat;
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

    settingsBtn.addEventListener('click', () => settingsModal.classList.add('active'));
    closeSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('active'));
    
    clearMemoryBtn.addEventListener('click', () => {
        sessionMemory.clear();
        alert("セッション記憶をクリアしました。");
    });

    saveSettingsBtn.addEventListener('click', () => {
        const newProvider = llmProviderSelect.value;
        const newApiKey = geminiApiKeyInput.value.trim();
        const newGeminiModel = geminiModelInput.value.trim() || 'gemini-2.5-flash';
        const newOllamaBaseUrl = ollamaBaseUrlInput.value.trim() || 'http://localhost:11434';
        const newOllamaModel = ollamaModelInput.value.trim() || 'gemma4:e4b';
        const newMcpWsPort = Number(mcpWsPortInput?.value) || 7777;

        localStorage.setItem('llm_provider', newProvider);
        localStorage.setItem('gemini_api_key', newApiKey);
        localStorage.setItem('gemini_model', newGeminiModel);
        localStorage.setItem('ollama_base_url', newOllamaBaseUrl);
        localStorage.setItem('ollama_model', newOllamaModel);
        localStorage.setItem('mcp_ws_port', String(newMcpWsPort));

        const newCameraUrl = cameraUrlInput.value.trim();
        localStorage.setItem('camera_url', newCameraUrl);

        // Switching between claude-code and local-LLM providers (or changing
        // the MCP port) requires re-wiring the bridge and chat input — reload
        // is simpler and safer than migrating state mid-session.
        const providerChanged = newProvider !== savedProvider;
        const portChanged = newProvider === 'claude-code' && newMcpWsPort !== savedMcpWsPort;
        if (providerChanged || portChanged) {
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
            llmStatusDot.className = "dot connected";
            llmStatusText.innerText = "Claude Code (MCP Bridge)";
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

        // --- Claude Code (MCP Bridge) mode: route through dev-server /claude WS ---
        if (claudeChat) {
            if (!claudeChat.isReady()) {
                addMessage("system", "Claude Code バックエンドに接続できていません。`npm run dev` が実行中か確認してください。");
                return;
            }
            addMessage("user", text);
            setChatProcessingState(true);
            claudeChat.send(text);
            // Assistant response / error arrives via claudeChat.onMessage, which
            // calls setChatProcessingState(false).
            return;
        }

        // --- Local LLM (Ollama / Gemini) ---
        if (pendingCameraCapture) {
            llmClient.pendingImage = pendingCameraCapture;
            pendingCameraCapture = null;
            clearCameraAttach();
        }

        setChatProcessingState(true);
        isAgentRunning = true;
        addMessage("user", text);

        try {
            await agentLoop.run(text, agentTools);
        } catch (e) {
            addMessage("system", "エラーが発生しました: " + e.message);
        } finally {
            isAgentRunning = false;
            setChatProcessingState(false);
            if (currentThinkingNode) {
                currentThinkingNode.classList.remove('thinking');
                currentThinkingNode = null;
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
    }

    function handleAgentStep(step) {
        const stepContextText = `step ${step.iteration}`;

        // Handle thinking node transitions
        if (step.type === 'thinking') {
            if (currentThinkingNode) {
                const currentText = currentThinkingNode.querySelector('.message-content').innerText;
                if (!currentText.includes(step.message)) {
                    currentThinkingNode.classList.remove('thinking');
                    currentThinkingNode = renderSystemMessage(step.message, stepContextText, true);
                } else {
                    currentThinkingNode.querySelector('.message-content').innerHTML = `
                        <div class="step-header">${stepContextText}</div>
                        ${step.message}
                    `;
                }
            } else {
                currentThinkingNode = renderSystemMessage(step.message, stepContextText, true);
            }
            scrollChat();
            return;
        }

        // For non-thinking types, finalize any active thinking node
        if (currentThinkingNode) {
            currentThinkingNode.classList.remove('thinking');
            currentThinkingNode = null;
        }

        switch (step.type) {
            case 'planned':
                let tasksHtml = `<div class="task-list-container">`;
                if (step.plan.reasoning) {
                    tasksHtml += `<div class="plan-reasoning">${escapeHTML(step.plan.reasoning)}</div>`;
                }
                tasksHtml += `<ul class="plan-tasks">`;
                tasksHtml += step.plan.tasks.map(t => `<li><span class="task-bullet"></span> ${escapeHTML(t.description)}</li>`).join("");
                tasksHtml += `</ul></div>`;
                renderSystemMessage(tasksHtml, "Plan Established", false);
                break;
            case 'acting':
                if (step.content) {
                    addMessage("ai", step.content);
                }
                let toolsHtml = step.toolCalls.map(tc => {
                    return `<span style="font-weight:bold">${tc.function.name}</span>(${JSON.stringify(tc.function.arguments)})`;
                }).join("<br>");
                renderSystemMessage(`<div class="tool-call-block">${toolsHtml}</div>`, stepContextText, false);
                break;
            case 'done':
                if (step.content) {
                    addMessage("ai", step.content);
                }
                break;
            case 'error':
                renderSystemMessage(`error: ${step.error}`, stepContextText, false);
                break;
        }
        scrollChat();
    }

    function renderSystemMessage(htmlContent, headerText, isThinking) {
        const div = document.createElement("div");
        div.className = `message system ${isThinking ? 'thinking' : ''}`;
        
        let headerHtml = headerText ? `<div class="step-header">${headerText}</div>` : '';
        
        div.innerHTML = `<div class="message-content" ${!isThinking && htmlContent.includes('tool-call-block') ? 'style="padding:0; background:transparent; border:none"' : ''}>
            ${headerHtml}
            ${htmlContent}
        </div>`;
        
        chatHistory.appendChild(div);
        scrollChat();
        return div;
    }

    function addMessage(role, text) {
        const div = document.createElement("div");
        div.className = `message ${role}`;
        div.innerHTML = `<div class="message-content">${escapeHTML(text)}</div>`;
        chatHistory.appendChild(div);
        scrollChat();
    }

    function scrollChat() {
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }
});
