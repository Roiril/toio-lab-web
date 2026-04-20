#!/usr/bin/env node
/**
 * Claude Code integration test
 * Tests: User sends command -> Claude processes -> toio simulator responds
 */

const WebSocket = require('ws');
const http = require('http');

const TEST_TIMEOUT_MS = 30000;

// Detect which port dev-server is running on
function findDevServerPort() {
  return new Promise((resolve) => {
    let foundPort = null;
    let portsChecked = 0;
    const maxPort = 3010;

    for (let port = 3000; port <= maxPort; port++) {
      const req = http.get(`http://localhost:${port}`, { timeout: 500 }, (res) => {
        if (!foundPort) {
          foundPort = port;
          console.log(`[Test] ✅ Found dev-server on port ${port}`);
          resolve(port);
        }
        req.destroy();
      });

      req.on('error', () => {
        portsChecked++;
        if (portsChecked === (maxPort - 3000 + 1) && !foundPort) {
          console.error('[Test] ❌ Could not find dev-server on any port 3000-3010');
          process.exit(1);
        }
        req.destroy();
      });

      req.on('timeout', () => {
        portsChecked++;
        req.destroy();
      });
    }
  });
}

let TEST_PORT;
let TEST_URL;

findDevServerPort().then(port => {
  TEST_PORT = port;
  TEST_URL = `ws://localhost:${TEST_PORT}/claude`;
  console.log(`[Test] Connecting to dev-server at ${TEST_URL}...`);
  console.log(`[Test] Test will timeout after ${TEST_TIMEOUT_MS}ms`);
  connectAndTest();
});

function connectAndTest() {
  const ws = new WebSocket(TEST_URL);
  let testPassed = false;
  let messagesSeen = [];
  let receivedReady = false;
  let receivedAssistant = false;
  let receivedResult = false;

  // Set test timeout
  const testTimeout = setTimeout(() => {
    console.error('[Test] ❌ TEST TIMEOUT - No response from Claude');
    console.log('[Test] Messages received:', messagesSeen.map(m => m.type));
    process.exit(1);
  }, TEST_TIMEOUT_MS);

  ws.on('open', () => {
    console.log('[Test] ✅ WebSocket connected to dev-server');

    // Small delay to ensure ready message is processed
    setTimeout(() => {
      const testMessage = '前に進んで';
      console.log(`[Test] Sending command: "${testMessage}"`);
      ws.send(JSON.stringify({
        type: 'user',
        text: testMessage
      }));
    }, 500);
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      messagesSeen.push(msg);

      console.log(`[Test] Received: type="${msg.type}"`);

      if (msg.type === 'ready') {
        receivedReady = true;
        console.log(`[Test]   model: ${msg.model}, sessionId: ${msg.sessionId ? msg.sessionId.substring(0, 8) + '...' : 'none'}`);
      } else if (msg.type === 'working') {
        console.log(`[Test]   Claude is processing...`);
      } else if (msg.type === 'assistant') {
        receivedAssistant = true;
        console.log(`[Test]   Assistant response: ${msg.text ? msg.text.substring(0, 100) : '(empty)'}`);

        // Check if Claude actually recognized the system prompt
        if (msg.text && msg.text.includes('ズンダモン')) {
          console.log('[Test] ✅ System prompt is recognized (contains "ズンダモン")');
        } else {
          console.warn('[Test] ⚠️  System prompt may not be applied (no "ズンダモン" in response)');
        }
      } else if (msg.type === 'result') {
        receivedResult = true;
        console.log(`[Test]   ✅ Claude completed turn`);

        // Test passes if we got: ready -> working -> assistant -> result
        if (receivedReady && receivedAssistant && receivedResult) {
          testPassed = true;
          console.log('[Test] ✅ TEST PASSED: Message flow is complete');
          console.log('[Test] Next: Verify toio simulator actually moved (manual check)');
          clearTimeout(testTimeout);
          setTimeout(() => process.exit(0), 500);
        }
      } else if (msg.type === 'error') {
        console.error(`[Test] ❌ Error: ${msg.error}`);
        clearTimeout(testTimeout);
        process.exit(1);
      }
    } catch (e) {
      console.error('[Test] Failed to parse message:', data.toString().slice(0, 100));
    }
  });

  ws.on('error', (err) => {
    console.error('[Test] ❌ WebSocket error:', err.message);
    clearTimeout(testTimeout);
    process.exit(1);
  });

  ws.on('close', () => {
    console.log('[Test] WebSocket closed');
    if (!testPassed) {
      console.error('[Test] ❌ TEST FAILED: Connection closed prematurely');
      console.log('[Test] Messages received:', messagesSeen.map(m => m.type).join(' -> '));
      clearTimeout(testTimeout);
      process.exit(1);
    }
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('[Test] Interrupted');
    clearTimeout(testTimeout);
    ws.close();
    process.exit(1);
  });
}

