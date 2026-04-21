const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3002/claude');

ws.on('open', () => {
    console.log('[test] Connected to dev-server');

    // Send test message
    const msg = JSON.stringify({
        type: 'user',
        text: 'こんにちは'
    });

    console.log('[test] Sending:', msg);
    ws.send(msg);
});

ws.on('message', (data) => {
    try {
        const obj = JSON.parse(data);
        console.log('[test] Received:', JSON.stringify(obj, null, 2));
    } catch (e) {
        console.log('[test] Raw message:', data.toString().slice(0, 500));
    }
});

ws.on('error', (err) => {
    console.error('[test] WebSocket error:', err.message);
});

ws.on('close', () => {
    console.log('[test] Disconnected');
    process.exit(0);
});

// Auto-close after 10 seconds
setTimeout(() => {
    console.log('[test] Timeout - closing');
    ws.close();
}, 10000);
