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
    const maxIterationsInput = document.getElementById("max-iterations");
    const clearMemoryBtn = document.getElementById("clear-memory-btn");

    // --- State & Instances ---
    const spatialAwareness = new SpatialAwareness();
    const toioBle = new ToioBLE();
    const toioSim = new ToioSim(spatialAwareness);

    const combinedToio = new ToioCombined(toioSim, toioBle);

    // LocalStorage を優先し、未設定時のみ config.js にフォールバック
    const savedProvider = localStorage.getItem('llm_provider') || window.APP_CONFIG?.LLM_PROVIDER || 'ollama';
    const savedApiKey = localStorage.getItem('gemini_api_key') || window.APP_CONFIG?.GEMINI_API_KEY || '';
    const savedGeminiModel = localStorage.getItem('gemini_model') || window.APP_CONFIG?.GEMINI_MODEL || 'gemini-2.5-flash';
    const savedOllamaBaseUrl = localStorage.getItem('ollama_base_url') || window.APP_CONFIG?.OLLAMA_URL || 'http://localhost:11434';
    const savedOllamaModel = localStorage.getItem('ollama_model') || window.APP_CONFIG?.OLLAMA_MODEL || 'gemma4:e4b';

    if (llmProviderSelect) llmProviderSelect.value = savedProvider;
    if (geminiApiKeyInput) geminiApiKeyInput.value = savedApiKey;
    if (geminiModelInput) geminiModelInput.value = savedGeminiModel;
    if (ollamaBaseUrlInput) ollamaBaseUrlInput.value = savedOllamaBaseUrl;
    if (ollamaModelInput) ollamaModelInput.value = savedOllamaModel;

    // プロバイダー変更時に設定の表示を切り替える
    const updateSettingsVisibility = () => {
        if (llmProviderSelect.value === 'ollama') {
            geminiSettingsGroup.style.display = 'none';
            ollamaSettingsGroup.style.display = 'block';
        } else {
            geminiSettingsGroup.style.display = 'block';
            ollamaSettingsGroup.style.display = 'none';
        }
    };
    if (llmProviderSelect) {
        llmProviderSelect.addEventListener('change', updateSettingsVisibility);
        updateSettingsVisibility();
    }

    let llmClient;
    if (savedProvider === 'ollama') {
        llmClient = new OllamaClient(savedOllamaBaseUrl, savedOllamaModel);
    } else {
        llmClient = new GeminiClient(savedApiKey, savedGeminiModel);
    }
    const sessionMemory = new SessionMemory();
    const environment = new Environment(toioSim, toioBle, spatialAwareness);
    const executor = new ToolExecutor(combinedToio, environment);

    // UI state
    let isAgentRunning = false;
    let isProcessingChat = false;
    let currentThinkingNode = null;
    let hasSyncedInitialPosition = false;

    // Agent Loop initialization
    let agentLoop = new AgentLoop(llmClient, executor, environment, sessionMemory, spatialAwareness, {
        maxIterations: parseInt(maxIterationsInput.value, 10),
        onStep: handleAgentStep
    });

    // --- initialization ---
    checkLlmConnection();
    updateToioUIState();

    // --- Synchronization Loop ---
    setInterval(() => {
        if (isAgentRunning) return; // ✅ Agent実行中は同期を停止して干渉を防ぐ
        if (!toioBle.isConnected || toioBle.isMoving || toioSim.isMoving) return;

        const target = { x: toioSim.x, y: toioSim.y };
        
        const dx = Math.abs(toioBle.x - target.x);
        const dy = Math.abs(toioBle.y - target.y);
        const da = Math.abs(toioBle.angle - toioSim.angle) % 360;
        const diffA = Math.min(da, 360 - da);

        if (dx > 20 || dy > 20 || diffA > 15) {
            toioBle.moveTo(target.x, target.y, toioSim.angle);
        }
    }, 200);

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
        // 初回接続時にシミュレーションの位置を実機に合わせる（スナップ）
        if (!hasSyncedInitialPosition) {
            toioSim.x = pos.x;
            toioSim.y = pos.y;
            toioSim.angle = pos.angle;
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

        localStorage.setItem('llm_provider', newProvider);
        localStorage.setItem('gemini_api_key', newApiKey);
        localStorage.setItem('gemini_model', newGeminiModel);
        localStorage.setItem('ollama_base_url', newOllamaBaseUrl);
        localStorage.setItem('ollama_model', newOllamaModel);

        if (newProvider === 'ollama') {
            llmClient = new OllamaClient(newOllamaBaseUrl, newOllamaModel);
        } else {
            llmClient = new GeminiClient(newApiKey, newGeminiModel);
        }

        // Re-init agent loop
        agentLoop = new AgentLoop(llmClient, executor, environment, sessionMemory, spatialAwareness, {
            maxIterations: parseInt(maxIterationsInput.value, 10) || 10,
            onStep: handleAgentStep
        });

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
        const stepContextText = `step ${step.iteration}/${agentLoop.maxIterations}`;

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
