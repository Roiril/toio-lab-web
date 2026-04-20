/**
 * Main App Logic integrated with Agent Loop
 */

document.addEventListener("DOMContentLoaded", () => {
    // --- UI Elements ---
    const chatHistory = document.getElementById("chat-history");
    const chatInput = document.getElementById("chat-input");
    const sendBtn = document.getElementById("send-btn");
    const cancelBtn = document.getElementById("cancel-btn");
    const emergencyStopBtn = document.getElementById("emergency-stop-btn");
    
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

    // LocalStorage を優先し、未設定時のみ config.js にフォールバック
    const savedProvider = localStorage.getItem('llm_provider') || window.APP_CONFIG?.LLM_PROVIDER || 'claude-code';
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
        if (llmProviderSelect.value === 'ollama') {
            geminiSettingsGroup.style.display = 'none';
            ollamaSettingsGroup.style.display = 'block';
        } else if (llmProviderSelect.value === 'claude-code') {
            geminiSettingsGroup.style.display = 'none';
            ollamaSettingsGroup.style.display = 'none';
        } else {
            geminiSettingsGroup.style.display = 'block';
            ollamaSettingsGroup.style.display = 'none';
        }
        // Update emergency stop button visibility
        emergencyStopBtn.style.display = llmProviderSelect.value === 'claude-code' ? 'block' : 'none';
    };
    if (llmProviderSelect) {
        llmProviderSelect.addEventListener('change', updateSettingsVisibility);
        updateSettingsVisibility();
    }

    let llmClient;
    if (savedProvider === 'ollama') {
        llmClient = new OllamaClient(savedOllamaBaseUrl, savedOllamaModel);
    } else if (savedProvider === 'claude-code') {
        // Claude Code mode: initialize ClaudeChatClient for dev-server communication
        window.claudeClient = new ClaudeChatClient({
            onMessage: (msg) => {
                handleClaudeCodeMessage(msg);
            },
            onStatus: (status) => {
                console.log('[Claude Code] Status:', status.state);
                // Update connection status when ClaudeChatClient status changes
                if (status.state === 'open') {
                    checkLlmConnection();
                }
            }
        });
        window.claudeClient.connect();
        llmClient = null; // Claude Code doesn't use traditional LLM client
    } else {
        llmClient = new GeminiClient(savedApiKey, savedGeminiModel);
    }
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

    // Voice synthesis queue to prevent overlapping audio
    let voiceSynthesisQueue = [];
    let isProcessingVoice = false;

    const enqueueVoiceSynthesis = async (textToSpeak) => {
        voiceSynthesisQueue.push(textToSpeak);
        processVoiceSynthesisQueue();
    };

    const processVoiceSynthesisQueue = async () => {
        if (isProcessingVoice || voiceSynthesisQueue.length === 0) return;

        isProcessingVoice = true;
        const text = voiceSynthesisQueue.shift();

        try {
            await window.combinedToio.speakText(text, 'ja');
        } catch (err) {
            console.error('[speak_text] Failed:', err);
        } finally {
            isProcessingVoice = false;
            if (voiceSynthesisQueue.length > 0) {
                processVoiceSynthesisQueue();
            }
        }
    };

    // Agent Loop initialization
    let agentLoop = new AgentLoop(llmClient, executor, environment, sessionMemory, spatialAwareness, {
        onStep: handleAgentStep
    });

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

    emergencyStopBtn.addEventListener('click', () => {
        if (confirm('Claude Code プロセスを強制停止しますか？')) {
            if (window.claudeClient && window.claudeClient.stop()) {
                addMessage("system", "🛑 Claude Code に停止要求を送信しました");
            } else {
                addMessage("system", "⚠️ Claude Code への接続がありません");
            }
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

        localStorage.setItem('llm_provider', newProvider);
        localStorage.setItem('gemini_api_key', newApiKey);
        localStorage.setItem('gemini_model', newGeminiModel);
        localStorage.setItem('ollama_base_url', newOllamaBaseUrl);
        localStorage.setItem('ollama_model', newOllamaModel);

        if (newProvider === 'ollama') {
            llmClient = new OllamaClient(newOllamaBaseUrl, newOllamaModel);
        } else if (newProvider === 'claude-code') {
            // Claude Code mode: initialize ClaudeChatClient for dev-server communication
            if (!window.claudeClient) {
                window.claudeClient = new ClaudeChatClient({
                    onMessage: (msg) => console.log('[Claude Code] Message:', msg.type),
                    onStatus: (status) => console.log('[Claude Code] Status:', status.state)
                });
            }
            window.claudeClient.connect();
            llmClient = null;
        } else {
            llmClient = new GeminiClient(newApiKey, newGeminiModel);
        }

        // Re-init agent loop only if llmClient is set
        if (llmClient) {
            agentLoop = new AgentLoop(llmClient, executor, environment, sessionMemory, spatialAwareness, {
                onStep: handleAgentStep
            });
        }

        const newCameraUrl = cameraUrlInput.value.trim();
        localStorage.setItem('camera_url', newCameraUrl);
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
        let providerName, ok, reason;

        if (!llmClient) {
            // Claude Code mode
            providerName = "Claude Code";
            llmStatusText.innerText = `${providerName}: Connecting...`;
            const isReady = window.claudeClient && window.claudeClient.isReady();
            if (isReady) {
                ok = true;
                reason = "Ready";
            } else {
                ok = false;
                reason = "dev-server に接続中... ブラウザコンソールを確認してください";
            }
        } else {
            // Ollama or Gemini mode
            const isOllama = llmClient instanceof OllamaClient;
            providerName = isOllama ? "Ollama" : "Gemini";
            llmStatusText.innerText = `${providerName}: Checking...`;

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
        }

        if (ok) {
            llmStatusDot.className = "dot connected";
            if (llmClient && llmClient.model) {
                llmStatusText.innerText = `${providerName}: Ready (${llmClient.model})`;
            } else {
                llmStatusText.innerText = `${providerName}: Ready`;
            }
        } else {
            llmStatusDot.className = "dot disconnected";
            llmStatusText.innerText = `${providerName}: Error — ${reason || "Connection failed"}`;
        }
    }

    async function submitChat() {
        if (isProcessingChat || !chatInput.value.trim()) return;

        const text = chatInput.value.trim();
        chatInput.value = "";

        setChatProcessingState(true);
        isAgentRunning = true;
        addMessage("user", text);

        try {
            if (!llmClient) {
                // Claude Code mode: send via WebSocket to dev-server
                if (window.claudeClient && window.claudeClient.isReady()) {
                    window.claudeClient.send(text);
                } else {
                    addMessage("system", "⚠️ Claude Code への接続がありません。設定を確認してください。");
                }
            } else {
                // Agent Loop mode (Ollama or Gemini)
                // カメラ添付画像があればLLMクライアントにセット
                if (pendingCameraCapture) {
                    llmClient.pendingImage = pendingCameraCapture;
                    pendingCameraCapture = null;
                    clearCameraAttach();
                }

                await agentLoop.run(text, agentTools);
            }
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

    function stripEnglishTranslation(text) {
        // Remove English translations in parentheses at the end: " (English text)"
        return text.replace(/\s*\([^)]*[a-zA-Z][^)]*\)\s*$/, '').trim();
    }

    function handleClaudeCodeMessage(msg) {
        console.log('[Claude Code] Received message type:', msg.type);

        if (msg.type === 'ready') {
            // Initial ready message from dev-server
            console.log('[Claude Code] dev-server ready, model:', msg.model);
        } else if (msg.type === 'working') {
            setChatProcessingState(true);
        } else if (msg.type === 'assistant' && msg.text) {
            // Strip English translations from display
            const displayText = stripEnglishTranslation(msg.text);
            addMessage("assistant", displayText);

            // Handle voice synthesis via narrationPlan
            if (msg.narrationPlan) {
                console.log('[Claude Code] narrationPlan:', msg.narrationPlan);
                if (msg.narrationPlan.should_narrate === true) {
                    // Strip English translations from narration text too
                    const textToSpeak = stripEnglishTranslation(msg.narrationPlan.text);
                    enqueueVoiceSynthesis(textToSpeak);
                }
                // If should_narrate === false, don't speak (e.g., simple completion message)
            }
        } else if (msg.type === 'result') {
            // End of turn
            setChatProcessingState(false);
        } else if (msg.type === 'error') {
            // Display error
            addMessage("system", `エラー: ${msg.error}`);
            setChatProcessingState(false);
        } else if (msg.type === 'disconnected') {
            // dev-server disconnected
            addMessage("system", "⚠️ dev-server との接続が切断されました");
            setChatProcessingState(false);
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
