/**
 * Voice Synthesis Testing Script
 * Run in browser DevTools console to test voice synthesis functionality
 */

console.log('=== Voice Synthesis Testing Started ===');

// Test 1: Check WebSocket connection
console.log('\n[TEST 1] WebSocket Connection');
if (window.claudeChat) {
    const ready = window.claudeChat.isReady();
    console.log(`  Claude Chat ready: ${ready}`);
    if (!ready) {
        console.warn('  ⚠️ Claude Chat not ready');
    } else {
        console.log('  ✅ Connected to dev-server');
    }
} else {
    console.error('  ❌ claudeChat not initialized');
}

// Test 2: Check MCP Bridge
console.log('\n[TEST 2] MCP Bridge');
if (window.mcpBridge) {
    const connected = window.mcpBridge.isConnected();
    console.log(`  MCP Bridge connected: ${connected}`);
    if (!connected) {
        console.warn('  ⚠️ MCP Bridge not connected yet (may connect on first tool call)');
    } else {
        console.log('  ✅ MCP Bridge connected');
    }
} else {
    console.warn('  ⚠️ mcpBridge not initialized (normal in non-Claude-Code mode)');
}

// Test 3: Test VOICEVOX availability
console.log('\n[TEST 3] VOICEVOX Availability');
const voicevoxPort = Number(localStorage.getItem('voicevoxPort') || 50021);
console.log(`  Configured VOICEVOX port: ${voicevoxPort}`);

fetch(`http://localhost:${voicevoxPort}/version`)
    .then(r => {
        if (r.ok) {
            console.log(`  ✅ VOICEVOX responding on port ${voicevoxPort}`);
            return r.json();
        } else {
            throw new Error(`Status ${r.status}`);
        }
    })
    .then(data => {
        console.log(`  Version: ${data.version || 'unknown'}`);
    })
    .catch(err => {
        console.warn(`  ⚠️ VOICEVOX not available: ${err.message}`);
        console.log(`     (Will fallback to Web Speech API)`);
    });

// Test 4: Test Web Speech API
console.log('\n[TEST 4] Web Speech API');
if (window.SpeechSynthesisUtterance) {
    console.log('  ✅ Web Speech API available');
    const voices = window.speechSynthesis.getVoices();
    const jpVoices = voices.filter(v => v.lang.includes('ja'));
    console.log(`  Found ${voices.length} total voices, ${jpVoices.length} Japanese voices`);
} else {
    console.warn('  ⚠️ Web Speech API not available');
}

// Test 5: Test direct voice synthesis
console.log('\n[TEST 5] Direct Voice Synthesis Test');
console.log('  Running test_directVoiceSynthesis()...');
window.test_directVoiceSynthesis = async function() {
    console.log('\n>>> Starting direct voice synthesis test');
    try {
        const result = await window.bridge.executor.toio.speakText('テスト音声です', 'ja');
        console.log('✅ Direct synthesis succeeded:', result);
    } catch (err) {
        console.error('❌ Direct synthesis failed:', err.message);
    }
};

// Test 6: Test narration logic
console.log('\n[TEST 6] Narration Decision Logic');
window.test_narrationLogic = function() {
    console.log('\n>>> Testing narration decision logic');

    const testCases = [
        {
            name: 'Should narrate: direct response',
            text: 'こんにちは！何かお手伝いできることはありますか？',
            narrationPlan: { should_narrate: true, text: 'こんにちは！何かお手伝いできることはありますか？' },
            expected: 'SPEAK'
        },
        {
            name: 'Should NOT narrate: explicit NO_NARRATE',
            text: '移動完了しました',
            narrationPlan: { should_narrate: false, text: '移動完了しました' },
            expected: 'SKIP'
        },
        {
            name: 'Should NOT narrate: single line completion (heuristic)',
            text: '移動完了しました',
            narrationPlan: null,
            expected: 'SKIP'
        },
        {
            name: 'Should narrate: multi-line with completion keyword',
            text: '移動完了しました。\n次は何しましょう？',
            narrationPlan: null,
            expected: 'SPEAK'
        }
    ];

    testCases.forEach(testCase => {
        const lastAssistantText = testCase.text;
        const lastNarrationPlan = testCase.narrationPlan;

        const isSingleLineCompletion =
            lastAssistantText.trim().split('\n').length === 1 &&
            /^(.*?(完了|終了|完了しました|してきました|到達しました).*)$/.test(lastAssistantText);

        let decision = 'UNKNOWN';
        if (lastNarrationPlan && lastNarrationPlan.should_narrate === false) {
            decision = 'SKIP';
        } else if (isSingleLineCompletion) {
            decision = 'SKIP';
        } else if (lastAssistantText.trim()) {
            decision = 'SPEAK';
        }

        const status = decision === testCase.expected ? '✅' : '❌';
        console.log(`${status} ${testCase.name}`);
        console.log(`   Expected: ${testCase.expected}, Got: ${decision}`);
    });
};

// Test 7: Simulate chat message flow
console.log('\n[TEST 7] Chat Message Flow Simulation');
window.test_chatFlow = function(userMessage) {
    console.log(`\n>>> Simulating chat flow for: "${userMessage}"`);
    console.log('  Step 1: User input validation');
    console.log(`  ✓ Input: "${userMessage}"`);

    if (window.claudeChat && window.claudeChat.isReady()) {
        console.log('  Step 2: Send to WebSocket');
        console.log(`  ✓ Sending to ws://localhost:3000/claude`);
        window.claudeChat.send(userMessage);
        console.log('  ✓ Message sent. Waiting for response...');

        // Log next incoming messages
        const originalOnMessage = window.claudeChat.onMessage;
        let messageCount = 0;
        window.claudeChat.onMessage = function(msg) {
            messageCount++;
            console.log(`  <- Message ${messageCount}: type='${msg.type}'${msg.text ? ` text="${msg.text.substring(0, 50)}..."` : ''}${msg.narrationPlan ? ` narrationPlan=${JSON.stringify(msg.narrationPlan)}` : ''}`);

            // Call original handler
            originalOnMessage.call(this, msg);

            // Restore after first result
            if (msg.type === 'result') {
                window.claudeChat.onMessage = originalOnMessage;
                console.log('  Step 3: Response complete');
            }
        };
    } else {
        console.error('  ❌ Claude Chat not ready');
    }
};

// Print usage instructions
console.log('\n=== Testing Commands Available ===');
console.log('Run these in the console:');
console.log('  1. test_directVoiceSynthesis()   - Test direct voice synthesis');
console.log('  2. test_narrationLogic()         - Test narration decision logic');
console.log('  3. test_chatFlow("こんにちは！") - Simulate full chat flow');
console.log('\n=== End of Tests Setup ===\n');
