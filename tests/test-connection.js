/**
 * Simple connection test to dev-server
 * Detects the correct port and tests basic connectivity
 */

const WebSocket = require('ws');

async function findAndTestServer() {
    const ports = [3000, 3001, 3002, 3003, 3004, 3005];

    for (const port of ports) {
        try {
            console.log(`\n[test] Trying port ${port}...`);

            const ws = new WebSocket(`ws://localhost:${port}/claude`);

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    ws.close();
                    reject(new Error(`Port ${port}: timeout`));
                }, 2000);

                ws.on('open', () => {
                    clearTimeout(timeout);
                    console.log(`✅ Connected to port ${port}!`);

                    // Send test message
                    const testMsg = {
                        type: 'user',
                        text: 'こんにちは'
                    };

                    console.log('[test] Sending test message:', testMsg.text);
                    ws.send(JSON.stringify(testMsg));

                    let receivedCount = 0;
                    ws.on('message', (data) => {
                        try {
                            const obj = JSON.parse(data);
                            receivedCount++;
                            console.log(`[response ${receivedCount}] type='${obj.type}'${obj.text ? ` | text="${obj.text.substring(0, 80)}..."` : ''}`);

                            if (obj.type === 'result' || receivedCount >= 10) {
                                ws.close();
                                resolve({ port, success: true });
                            }
                        } catch (e) {
                            console.log('[raw]', data.toString().slice(0, 100));
                        }
                    });

                    ws.on('error', (err) => {
                        console.error(`[error on ${port}]`, err.message);
                        reject(err);
                    });
                });

                ws.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(new Error(`Port ${port}: ${err.message}`));
                });
            });
        } catch (err) {
            console.log(`✗ Port ${port}: ${err.message}`);
        }
    }

    throw new Error('No dev-server found on any port');
}

findAndTestServer()
    .then(result => {
        console.log(`\n✅ Test completed successfully on port ${result.port}!`);
        process.exit(0);
    })
    .catch(err => {
        console.error(`\n❌ Test failed: ${err.message}`);
        process.exit(1);
    });

// Auto-exit after 15 seconds
setTimeout(() => {
    console.log('\n⏱️ Timeout - exiting');
    process.exit(1);
}, 15000);
