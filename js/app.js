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
    const toio = new ToioBLE();
    let ollama = new OllamaClient();
    const executor = new ToolExecutor(toio);
    let isProcessingChat = false;

    // --- initialization ---
    checkOllamaConnection();

    // --- Event Listeners ---

    // Toio connection
    connectToioBtn.addEventListener('click', async () => {
        try {
            await toio.connect();
            updateToioState(true);
            addMessage("system", "toioキューブに接続しました！準備完了です。");
        } catch (e) {
            alert("Bluetooth接続に失敗しました: " + e.message);
        }
    });

    disconnectToioBtn.addEventListener('click', () => {
        toio.disconnect();
        updateToioState(false);
    });

    toio.onDisconnectCallback = () => {
        updateToioState(false);
        addMessage("system", "toioキューブが切断されました。");
    };

    toio.onBatteryUpdateCallback = (batt) => {
        batteryLevel.innerText = `${batt}%`;
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
            if (!toio.isConnected) return alert("toioが接続されていません");
            const action = btn.dataset.action;
            if (action === "move_forward") toio.move(50, 50, 500);
            if (action === "move_backward") toio.move(-50, -50, 500);
            if (action === "spin") toio.spin(80, 500);
            if (action === "stop") toio.stop();
        });
    });

    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!toio.isConnected) return alert("toioが接続されていません");
            const [r, g, b] = btn.dataset.color.split(',').map(Number);
            toio.setLight(r, g, b, 0); // infinite
        });
    });


    // --- Functions ---
    function updateToioState(connected) {
        if (connected) {
            toioStatusDot.className = "dot connected";
            toioStatusText.innerText = "Connected";
            cubeInfo.style.display = "block";
            connectToioBtn.disabled = true;
            disconnectToioBtn.disabled = false;
        } else {
            toioStatusDot.className = "dot disconnected";
            toioStatusText.innerText = "Disconnected";
            cubeInfo.style.display = "none";
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
