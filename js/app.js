/**
 * Main App Logic
 */

document.addEventListener("DOMContentLoaded", () => {
    // --- UI Elements ---
    const chatHistory = document.getElementById("chat-history");
    const chatInput = document.getElementById("chat-input");
    const sendBtn = document.getElementById("send-btn");
    
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

    // --- State & Instances ---
    const toioBle = new ToioBLE();
    const toioSim = new ToioSim();
    let ollama = new OllamaClient();
    let activeToio = toioSim; // Default to Simulator for easier testing
    let isProcessingChat = false;

    // --- initialization ---
    const executor = new ToolExecutor(activeToio);
    checkOllamaConnection();
    
    // Initial UI Setup for Simulator
    const simModeToggle = document.getElementById("sim-mode-toggle");
    simModeToggle.checked = true; // Auto-checked by default in this implementation
    updateToioUIState();

    // --- Event Listeners ---

    // Sim Mode Toggle
    simModeToggle.addEventListener('change', () => {
        if (simModeToggle.checked) {
            activeToio = toioSim;
            addMessage("system", "シミュレーターモードに切り替えました。");
        } else {
            activeToio = toioBle;
            addMessage("system", "Bluetoothモードに切り替えました。接続ボタンを押してください。");
        }
        executor.toio = activeToio;
        updateToioUIState();
    });

    // Toio connection (BLE only)
    connectToioBtn.addEventListener('click', async () => {
        if (activeToio !== toioBle) return;
        try {
            await toioBle.connect();
            updateToioUIState();
            addMessage("system", "toioキューブに接続しました！準備完了です。");
        } catch (e) {
            alert("Bluetooth接続に失敗しました: " + e.message);
        }
    });

    disconnectToioBtn.addEventListener('click', () => {
        if (activeToio === toioBle) {
            toioBle.disconnect();
            updateToioUIState();
        }
    });

    toioBle.onDisconnectCallback = () => {
        updateToioUIState();
        addMessage("system", "toioキューブが切断されました。");
    };

    toioBle.onBatteryUpdateCallback = (batt) => {
        if (activeToio === toioBle) batteryLevel.innerText = `${batt}%`;
    };

    // Chat
    sendBtn.addEventListener('click', handleChatSubmit);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleChatSubmit();
        }
    });
    chatInput.addEventListener('input', () => {
        sendBtn.disabled = chatInput.value.trim().length === 0 || isProcessingChat;
    });

    // Settings
    settingsBtn.addEventListener('click', () => settingsModal.classList.add('active'));
    closeSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('active'));
    saveSettingsBtn.addEventListener('click', () => {
        const newUrl = ollamaUrlInput.value.trim();
        const newModel = ollamaModelInput.value.trim();
        ollama = new OllamaClient(newUrl, newModel);
        settingsModal.classList.remove('active');
        checkOllamaConnection();
    });

    // Quick Actions
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!activeToio.isConnected) return alert("toioが利用可能ではありません（未接続など）");
            const action = btn.dataset.action;
            if (action === "move_forward") activeToio.move(50, 50, 500);
            if (action === "move_backward") activeToio.move(-50, -50, 500);
            if (action === "spin") activeToio.spin(80, 500);
            if (action === "stop") activeToio.stop();
        });
    });

    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!activeToio.isConnected) return alert("toioが利用可能ではありません");
            const [r, g, b] = btn.dataset.color.split(',').map(Number);
            activeToio.setLight(r, g, b, 0); // infinite
        });
    });


    // --- Functions ---
    function updateToioUIState() {
        const connected = activeToio.isConnected;
        const isSim = (activeToio === toioSim);

        if (isSim) {
            toioStatusDot.className = "dot connected";
            toioStatusText.innerText = "Simulator (Active)";
            cubeInfo.style.display = "block";
            batteryLevel.innerText = "100%"; // Sim always 100%
            connectToioBtn.disabled = true;
            disconnectToioBtn.disabled = true;
        } else {
            // BLE Mode
            if (connected) {
                toioStatusDot.className = "dot connected";
                toioStatusText.innerText = "Connected (BLE)";
                cubeInfo.style.display = "block";
                connectToioBtn.disabled = true;
                disconnectToioBtn.disabled = false;
            } else {
                toioStatusDot.className = "dot disconnected";
                toioStatusText.innerText = "Disconnected (BLE)";
                cubeInfo.style.display = "none";
                connectToioBtn.disabled = false;
                disconnectToioBtn.disabled = true;
            }
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

    async function handleChatSubmit() {
        if (isProcessingChat || !chatInput.value.trim()) return;

        const text = chatInput.value.trim();
        chatInput.value = "";
        sendBtn.disabled = true;
        isProcessingChat = true;

        addMessage("user", text);
        scrollChat();

        try {
            // Send to Ollama
            const responseMsg = await ollama.chat(text, toioTools);
            processAssistantMessage(responseMsg);
            
            // If tools were called
            if (responseMsg.tool_calls && responseMsg.tool_calls.length > 0) {
                const results = await executor.executeAll(responseMsg.tool_calls);
                const followUpMsg = await ollama.submitToolResults(responseMsg.tool_calls, results);
                processAssistantMessage(followUpMsg);
            }

        } catch (e) {
            addMessage("system", "エラーが発生しました: " + e.message);
        } finally {
            isProcessingChat = false;
            if (chatInput.value.trim().length > 0) sendBtn.disabled = false;
        }
    }

    function processAssistantMessage(msg) {
        if (msg.content) {
            addMessage("ai", msg.content);
        }
        if (msg.tool_calls && msg.tool_calls.length > 0) {
            let toolsHtml = msg.tool_calls.map(tc => {
                return `🔧 <span style="font-weight:bold">${tc.function.name}</span>(${JSON.stringify(tc.function.arguments)})`;
            }).join("<br>");
            addRawHtmlMessage("system", `<div class="tool-call-block">${toolsHtml}</div>`);
        }
        scrollChat();
    }

    function addMessage(role, text) {
        const div = document.createElement("div");
        div.className = `message ${role}`;
        div.innerHTML = `<div class="message-content">${escapeHTML(text)}</div>`;
        chatHistory.appendChild(div);
        scrollChat();
    }

    function addRawHtmlMessage(role, html) {
        const div = document.createElement("div");
        div.className = `message ${role}`;
        div.innerHTML = `<div class="message-content" style="padding:0; background:transparent; border:none">${html}</div>`;
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
