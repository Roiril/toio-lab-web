# Voice Synthesis Integration Examples

Quick reference guide for common voice synthesis patterns and code examples.

---

## Browser Integration

### Direct Voice Synthesis

**Test in Browser Console**:

```javascript
// Option 1: Via tool executor
window.bridge.call('speak_text', {
    text: 'こんにちは、ズンダモンです！',
    language: 'ja'
}).then(result => console.log('Success:', result))
  .catch(error => console.error('Failed:', error));

// Option 2: Direct call to ToioCombined
window.bridge.executor.toio.speakText('テストです', 'ja')
    .then(result => console.log('Voice output:', result))
    .catch(error => console.error('Error:', error));

// Option 3: Web Speech API directly (no VOICEVOX)
const utterance = new SpeechSynthesisUtterance('こんにちは');
utterance.lang = 'ja-JP';
window.speechSynthesis.speak(utterance);
```

### Check VOICEVOX Status

```javascript
// Get port configuration
const port = Number(localStorage.getItem('voicevoxPort') || 50021);
console.log('VOICEVOX Port:', port);

// Test connection
fetch(`http://localhost:${port}/version`)
    .then(r => r.json())
    .then(v => console.log('VOICEVOX available:', v))
    .catch(e => console.log('VOICEVOX not available:', e.message));

// Get available speakers
fetch(`http://localhost:${port}/speakers`)
    .then(r => r.json())
    .then(speakers => {
        console.log('Available speakers:');
        speakers.forEach(s => console.log(`  ${s.speaker_uuid}: ${s.name}`));
    });
```

### Configure VOICEVOX Port

```javascript
// Save custom port
localStorage.setItem('voicevoxPort', '50022');

// Reload to apply
location.reload();

// Or direct test with custom port
const customPort = 50022;
await window.bridge.executor.toio.speakText('テスト', 'ja'); // Will now use customPort
```

---

## Adding Voice to Your Own Tools

### Pattern 1: Auto-Feedback on Completion

Add automatic voice feedback after tool execution:

```javascript
// In tool-executor.js, inside a tool case:

case "my_custom_tool": {
    // ... perform action ...
    
    // Auto voice feedback on success
    if (success) {
        try {
            await this.toio.speakText("カスタムツール完了しました", "ja");
        } catch (err) {
            console.warn("[ToolExecutor] Failed to speak completion:", err.message);
            // Don't break execution
        }
    }
    break;
}
```

### Pattern 2: Contextual Feedback

Provide different messages based on outcome:

```javascript
case "complex_action": {
    const result = await performAction();
    
    // Voice feedback varies by result
    let feedbackText;
    if (result.success && result.value > 100) {
        feedbackText = "素晴らしい！成功しました！";
    } else if (result.success) {
        feedbackText = "完了しました";
    } else {
        feedbackText = `失敗しました：${result.error}`;
    }
    
    try {
        await this.toio.speakText(feedbackText, "ja");
    } catch (err) {
        console.warn("[ToolExecutor] Voice feedback failed:", err.message);
    }
    
    resultData = { status: result.success ? "success" : "error", ... };
    break;
}
```

### Pattern 3: Multi-Step Feedback

Announce progress at each step:

```javascript
case "multi_step_tool": {
    const steps = ["ステップ1", "ステップ2", "ステップ3"];
    
    for (const step of steps) {
        // Do work for step
        await doWork(step);
        
        // Announce completion
        try {
            await this.toio.speakText(`${step}完了`, "ja");
        } catch (err) {
            console.warn("[ToolExecutor] Step feedback failed:", err.message);
        }
    }
    break;
}
```

---

## Claude Integration

### Narration Plan Markers

**In Claude System Prompt** (dev-server.js):

```javascript
const toioSystemPrompt = `
...
## ナレーション指示（IMPORTANT）
応答の最後に **必ず** 以下のマーカーを追加：

- **ユーザーへの直接応答** → [SHOULD_NARRATE]
- **単純な完了報告のみ** → [NO_NARRATE]

例:
「こんにちは！[SHOULD_NARRATE]」
「移動完了[NO_NARRATE]」
...
`;
```

### Extraction Logic

**In dev-server.js**:

```javascript
function extractNarrationPlan(text) {
    let shouldNarrate = null;
    let cleanText = text;

    if (text.includes('[SHOULD_NARRATE]')) {
        shouldNarrate = true;
        cleanText = text.replace(/\s*\[SHOULD_NARRATE\]\s*$/m, '');
    } else if (text.includes('[NO_NARRATE]')) {
        shouldNarrate = false;
        cleanText = text.replace(/\s*\[NO_NARRATE\]\s*$/m, '');
    }

    return {
        cleanText: cleanText.trim(),
        narrationPlan: shouldNarrate !== null ? {
            should_narrate: shouldNarrate,
            text: cleanText.trim()
        } : null
    };
}
```

**Usage**:
```javascript
const { cleanText, narrationPlan } = extractNarrationPlan(claudeResponse);
broadcast({ 
    type: 'assistant', 
    text: cleanText, 
    narrationPlan: narrationPlan 
});
```

### Custom Narration Decision Logic

**In app.js**, modify the decision logic:

```javascript
case 'result': {
    // Current logic
    const isSingleLineCompletion = lastAssistantText.trim().split('\n').length === 1 &&
        /^(.*?(完了|終了|完了しました|してきました|到達しました).*)$/.test(lastAssistantText);

    if (lastNarrationPlan?.should_narrate === false) {
        // Explicit skip
        console.log('[ClaudeChat] Narration plan: skip');
    } else if (isSingleLineCompletion) {
        // Heuristic skip
        console.log('[ClaudeChat] Heuristic: skip simple completion');
    } else if (lastAssistantText.trim() && bridge && bridge.isConnected()) {
        // Speak
        const textToSpeak = lastNarrationPlan?.text || lastAssistantText;
        bridge.call('speak_text', {
            text: textToSpeak,
            language: 'ja'
        }).catch(err => console.error('[speak_text] Failed:', err));
    }
    
    setChatProcessingState(false);
    lastNarrationPlan = null;
    break;
}
```

**Custom Decision Example** (skip if response contains question):

```javascript
const shouldSkip = 
    lastNarrationPlan?.should_narrate === false ||
    isSingleLineCompletion ||
    lastAssistantText.includes('？');  // Skip questions

if (!shouldSkip && lastAssistantText.trim() && bridge && bridge.isConnected()) {
    // Speak...
}
```

---

## Advanced: Custom Voice Engines

### Add Alternative TTS Engine

**Example: Google Cloud TTS**

```javascript
// In toio-combined.js

async speakText(text, language = 'ja', speakerId = 3) {
    const provider = localStorage.getItem('ttsProvider') || 'voicevox';
    
    try {
        if (provider === 'google') {
            return await this._speakWithGoogleCloud(text, language);
        } else if (provider === 'azure') {
            return await this._speakWithAzure(text, language);
        } else {
            return await this._speakWithVoiceVox(text, speakerId);
        }
    } catch (error) {
        console.warn('[speakText] Primary engine failed, fallback to Web Speech:', error);
        return await this._speakWithWebSpeechAPI(text, language);
    }
}

async _speakWithGoogleCloud(text, language) {
    const apiKey = localStorage.getItem('googleCloudTtsApiKey');
    
    const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            input: { text },
            voice: {
                languageCode: language === 'ja' ? 'ja-JP' : 'en-US',
                name: 'ja-JP-Neural2-B' // Use Neural2 for better quality
            },
            audioConfig: { audioEncoding: 'MP3' }
        })
    });
    
    if (!response.ok) throw new Error(`Google Cloud API error: ${response.status}`);
    
    const data = await response.json();
    const audioBlob = this._base64ToBlob(data.audioContent, 'audio/mp3');
    await this._playAudio(audioBlob);
    
    return {
        status: "success",
        engine: "google_cloud",
        text_length: text.length
    };
}

_base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}
```

**UI for Provider Selection** (add to settings):

```html
<div id="tts-provider-group">
    <label for="tts-provider">TTS Provider</label>
    <select id="tts-provider">
        <option value="voicevox">VOICEVOX (Local)</option>
        <option value="google">Google Cloud</option>
        <option value="azure">Azure Cognitive Services</option>
        <option value="web">Web Speech API</option>
    </select>
</div>

<div id="google-tts-settings" style="display:none;">
    <input type="password" id="google-cloud-api-key" 
           placeholder="Google Cloud TTS API Key">
</div>
```

### Add Audio Streaming

Stream audio as it's synthesized rather than waiting for full completion:

```javascript
async _speakWithVoiceVoxStreaming(text, speakerId = 3) {
    const voicevoxPort = Number(localStorage.getItem('voicevoxPort') || 50021);
    const baseUrl = `http://localhost:${voicevoxPort}`;
    
    // Step 1: Get audio query
    const queryParams = new URLSearchParams({ text, speaker: speakerId });
    const queryResponse = await fetch(`${baseUrl}/audio_query?${queryParams}`, {
        method: 'POST'
    });
    const audioQuery = await queryResponse.json();
    
    // Step 2: Stream synthesis (if supported)
    const synthResponse = await fetch(`${baseUrl}/synthesis_streaming?speaker=${speakerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(audioQuery)
    });
    
    if (!synthResponse.ok) {
        // Fallback to standard synthesis
        return this._speakWithVoiceVox(text, speakerId);
    }
    
    // Stream the response
    const reader = synthResponse.body.getReader();
    const chunks = [];
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        // Could play chunks progressively here
    }
    
    const blob = new Blob(chunks);
    await this._playAudio(blob);
    
    return {
        status: "success",
        engine: "voicevox_streaming",
        speaker_id: speakerId
    };
}
```

---

## Monitoring & Debugging

### Enable Detailed Logging

Add to `toio-combined.js`:

```javascript
async speakText(text, language = 'ja', speakerId = 3) {
    const startTime = performance.now();
    console.log(`[VoiceSynthesis] Starting: "${text}" (${language})`);
    
    try {
        const result = await this._speakWithVoiceVox(text, speakerId);
        const duration = performance.now() - startTime;
        console.log(`[VoiceSynthesis] Completed in ${duration.toFixed(0)}ms`, result);
        return result;
    } catch (error) {
        const duration = performance.now() - startTime;
        console.warn(`[VoiceSynthesis] Failed after ${duration.toFixed(0)}ms:`, error.message);
        console.log(`[VoiceSynthesis] Falling back to Web Speech API`);
        return await this._speakWithWebSpeechAPI(text, language);
    }
}
```

### Monitor Performance

```javascript
// In browser console
const measurements = [];

// Monkey-patch to track calls
const original = window.bridge.executor.toio.speakText;
window.bridge.executor.toio.speakText = async function(text, language, speakerId) {
    const start = performance.now();
    try {
        const result = await original.call(this, text, language, speakerId);
        measurements.push({
            text: text.substring(0, 20),
            duration: performance.now() - start,
            engine: result.engine,
            success: true
        });
        return result;
    } catch (e) {
        measurements.push({
            text: text.substring(0, 20),
            duration: performance.now() - start,
            error: e.message,
            success: false
        });
        throw e;
    }
};

// After running some voice synthesis:
console.table(measurements);
```

### Network Monitoring

```javascript
// Monitor VOICEVOX API calls
const voicevoxPort = Number(localStorage.getItem('voicevoxPort') || 50021);

// In DevTools Network tab, filter by:
// localhost:50021/audio_query
// localhost:50021/synthesis

// Or via console:
fetch(`http://localhost:${voicevoxPort}/stats`)
    .then(r => r.json())
    .then(console.log); // If available
```

---

## Error Handling Patterns

### Graceful Degradation

```javascript
// Primary: VOICEVOX
// Secondary: Web Speech API
// Tertiary: Silent failure (log but continue)

try {
    return await this._speakWithVoiceVox(text, speakerId);
} catch (voicevoxError) {
    console.warn('VOICEVOX failed:', voicevoxError);
    
    try {
        return await this._speakWithWebSpeechAPI(text, language);
    } catch (webSpeechError) {
        console.error('All TTS engines failed:', {
            voicevox: voicevoxError.message,
            webSpeech: webSpeechError.message
        });
        
        // Return success status even though no audio played
        return {
            status: "success_silent",
            message: "TTS failed but execution continues"
        };
    }
}
```

### Timeout Handling

```javascript
async speakText(text, language = 'ja', speakerId = 3) {
    // Set timeout of 10 seconds
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Voice synthesis timeout')), 10000)
    );
    
    try {
        return await Promise.race([
            this._speakWithVoiceVox(text, speakerId),
            timeoutPromise
        ]);
    } catch (error) {
        console.warn('Voice synthesis timed out, using fallback');
        return await this._speakWithWebSpeechAPI(text, language);
    }
}
```

### Retry Logic

```javascript
async speakTextWithRetry(text, language = 'ja', speakerId = 3, maxRetries = 2) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await this.speakText(text, language, speakerId);
        } catch (error) {
            if (attempt < maxRetries) {
                console.log(`Retry ${attempt + 1}/${maxRetries}...`);
                await new Promise(r => setTimeout(r, 500 * (attempt + 1))); // exponential backoff
            } else {
                throw error;
            }
        }
    }
}
```

---

## Testing

### Unit Test Example (Jest)

```javascript
// __tests__/voiceSynthesis.test.js

describe('Voice Synthesis', () => {
    let toioCombined;
    
    beforeEach(() => {
        toioCombined = new ToioCombined(mockSim, mockBle);
        localStorage.setItem('voicevoxPort', '50021');
    });
    
    test('speakText falls back to Web Speech API when VOICEVOX fails', async () => {
        // Mock VOICEVOX failure
        global.fetch = jest.fn()
            .mockRejectedValueOnce(new Error('Connection failed'))
            .mockResolvedValueOnce({
                blob: () => Promise.resolve(new Blob())
            });
        
        const result = await toioCombined.speakText('テスト', 'ja');
        
        expect(result.engine).toBe('web_speech_api');
    });
    
    test('rejects when text exceeds 500 characters', async () => {
        const longText = 'a'.repeat(501);
        
        const result = await toioCombined.speakText(longText, 'ja');
        
        expect(result.status).toBe('error');
        expect(result.error).toContain('too long');
    });
    
    test('respects configured VOICEVOX port', async () => {
        localStorage.setItem('voicevoxPort', '50022');
        
        global.fetch = jest.fn();
        
        try {
            await toioCombined._speakWithVoiceVox('テスト', 3);
        } catch (e) {
            // Expected to fail in test
        }
        
        const callUrl = global.fetch.mock.calls[0][0];
        expect(callUrl).toContain(':50022');
    });
});
```

---

## Performance Benchmarks

### Typical Latencies

```
VOICEVOX:
  audio_query:  50-150ms
  synthesis:    100-300ms
  playback:     varies with duration
  ────────────────────────
  Total:        200-500ms

Web Speech API:
  synthesis:    50-200ms
  playback:     varies with duration
  ────────────────────────
  Total:        100-300ms
```

### Example Measurements

```javascript
// Measure VOICEVOX time to first sound
console.time('voicevox-full');
await toioCombined._speakWithVoiceVox('ボイスボックステスト', 3);
console.timeEnd('voicevox-full');
// voicevox-full: 245.50ms

// Measure Web Speech
console.time('webspeech-full');
await toioCombined._speakWithWebSpeechAPI('テスト', 'ja');
console.timeEnd('webspeech-full');
// webspeech-full: 150.30ms
```

