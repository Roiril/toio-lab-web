/**
 * Main App Logic integrated with Agent Loop
 */

document.addEventListener("DOMContentLoaded", () => {
    // --- UI Elements ---
    const chatHistory = document.getElementById("chat-history");
    const chatInput = document.getElementById("chat-input");
    const sendBtn = document.getElementById("send-btn");
    const cancelBtn = document.getElementById("cancel-btn");
    
    const ollamaStatusDot = document.getElementById("ollama-status-dot");
    const ollamaStatusText = document.getElementById("ollama-status-text");
    
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
    const ollamaUrlInput = document.getElementById("ollama-url");
    const ollamaModelInput = document.getElementById("ollama-model");
    const maxIterationsInput = document.getElementById("max-iterations");
    const clearMemoryBtn = document.getElementById("clear-memory-btn");

    // --- State & Instances ---
    const toioBle = new ToioBLE();
    const toioSim = new ToioSim();
    
    const combinedToio = new ToioCombined(toioSim, toioBle);

    let ollama = new OllamaClient();
    const sessionMemory = new SessionMemory();
    const spatialAwareness = new SpatialAwareness();
    const environment = new Environment(toioSim, toioBle, spatialAwareness);
    const executor = new ToolExecutor(combinedToio, environment);
    
    // UI state
    let isProcessingChat = false;
    let isAgentRunning = false;
    let currentThinkingNode = null;

    // Agent Loop initialization
    let agentLoop = new AgentLoop(ollama, executor, environment, sessionMemory, spatialAwareness, {
        maxIterations: parseInt(maxIterationsInput.value, 10),
        onStep: handleAgentStep
    });

    // --- initialization ---
    checkOllamaConnection();
    updateToioUIState();

    // --- Synchronization Loop ---
    setInterval(() => {
        if (isAgentRunning) return; // ✅ Agent実行中は同期を停止して干渉を防ぐ
        if (!toioBle.isConnected || toioBle.isMoving || toioSim.isMoving) return;

        const target = toioSim.simToMat(toioSim.x, toioSim.y);
        
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
        addMessage("system", "toioキューブが切断されました。");
    };

    toioBle.onBatteryUpdateCallback = (batt) => {
        batteryLevel.innerText = `${batt}%`;
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
        const newUrl = ollamaUrlInput.value.trim();
        const newModel = ollamaModelInput.value.trim();
        ollama = new OllamaClient(newUrl, newModel);
        
        // Re-init agent loop
        agentLoop = new AgentLoop(ollama, executor, environment, sessionMemory, spatialAwareness, {
            maxIterations: parseInt(maxIterationsInput.value, 10) || 10,
            onStep: handleAgentStep
        });
        
        settingsModal.classList.remove('active');
        checkOllamaConnection();
    });

    // Quick Actions were removed from UI


    // --- Functions ---
    function updateToioUIState() {
        const connected = toioBle.isConnected;

        if (connected) {
            toioStatusDot.className = "dot connected";
            toioStatusText.innerText = "Connected (BLE + Sim)";
            cubeInfo.style.display = "block";
            connectToioBtn.disabled = true;
            disconnectToioBtn.disabled = false;
        } else {
            toioStatusDot.className = "dot connected"; // Sim is always connected
            toioStatusText.innerText = "Simulator Only";
            cubeInfo.style.display = "block";
            batteryLevel.innerText = "100%";
            connectToioBtn.disabled = false;
            disconnectToioBtn.disabled = true;
        }
    }

    async function checkOllamaConnection() {
        ollamaStatusText.innerText = "Ollama: Checking...";
        const ok = await ollama.checkConnection();
        if (ok) {
            ollamaStatusDot.className = "dot connected";
            ollamaStatusText.innerText = `Ollama: Ready (${ollama.model})`;
        } else {
            ollamaStatusDot.className = "dot disconnected";
            ollamaStatusText.innerText = "Ollama: Error (CORS or Off)";
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
            await agentLoop.run(text, toioTools);
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
                // If message changed significantly, finalize old one and start new
                if (!currentText.includes(step.message)) {
                    currentThinkingNode.classList.remove('thinking');
                    currentThinkingNode = renderSystemMessage(`🤔 ${step.message}`, stepContextText, true);
                } else {
                    // Update in place if it's the same base message
                    currentThinkingNode.querySelector('.message-content').innerHTML = `
                        <div class="step-header">${stepContextText}</div>
                        🤔 ${step.message}
                    `;
                }
            } else {
                currentThinkingNode = renderSystemMessage(`🤔 ${step.message}`, stepContextText, true);
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
                    tasksHtml += `<div class="plan-reasoning">📋 ${escapeHTML(step.plan.reasoning)}</div>`;
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
                    return `🔧 <span style="font-weight:bold">${tc.function.name}</span>(${JSON.stringify(tc.function.arguments)})`;
                }).join("<br>");
                renderSystemMessage(`<div class="tool-call-block">${toolsHtml}</div>`, stepContextText, false);
                break;
            case 'done':
                if (step.content) {
                    addMessage("ai", step.content);
                }
                break;
            case 'error':
                renderSystemMessage(`⚠️ エラー発生: ${step.error}`, stepContextText, false);
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
