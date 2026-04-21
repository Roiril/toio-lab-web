# Voice Synthesis System Architecture

This document details the current voice synthesis (text-to-speech) implementation in toio-lab-web.

## Overview

The voice synthesis system provides automatic voice feedback during toio interactions using two fallback mechanisms:

1. **VOICEVOX** (preferred): High-quality Japanese TTS via local HTTP API
2. **Web Speech API** (fallback): Browser-native TTS

### Key Features

- Dual-engine architecture for robustness
- Automatic fallback to Web Speech API if VOICEVOX unavailable
- Support for Japanese and English
- Integration at multiple layers (auto feedback + explicit tool)
- Narration plan markers for Claude responses
- Character voice support (Zundamon/Speaker ID 3)

---

## Architecture Components

### 1. Voice Synthesis Entry Point: `toio-combined.js`

**File**: [js/toio-combined.js](js/toio-combined.js)

The `ToioCombined` class aggregates commands to both simulator and physical BLE cube. The `speakText()` method is the primary voice synthesis interface:

```javascript
async speakText(text, language = 'ja', speakerId = 3)
```

**Flow**:
1. Attempts VOICEVOX synthesis
2. Falls back to Web Speech API on error
3. Returns status object with engine info

#### VOICEVOX Implementation

```javascript
async _speakWithVoiceVox(text, speakerId = 3)
```

**Process**:
1. Reads VOICEVOX port from localStorage (`voicevoxPort`, default 50021)
2. Calls `/audio_query` endpoint with text and speaker ID
3. Receives audio query parameters from VOICEVOX
4. Posts to `/synthesis` endpoint with query parameters
5. Receives WAV/MP3 audio blob
6. Plays audio via `_playAudio()`

**Example Request Flow**:
```
POST http://localhost:50021/audio_query?text=こんにちは&speaker=3
→ JSON response with audio parameters

POST http://localhost:50021/synthesis?speaker=3
Body: {audioQuery...}
→ Audio blob (WAV/MP3)

_playAudio() → Audio element → playback
```

**Configuration**:
- Port: Stored in `localStorage.getItem('voicevoxPort')` or defaults to 50021
- Speaker ID: Fixed at 3 (Zundamon female character)
- Text encoding: UTF-8

#### Web Speech API Implementation

```javascript
async _speakWithWebSpeechAPI(text, language = 'ja')
```

**Process**:
1. Creates `SpeechSynthesisUtterance` object
2. Sets language: 'ja-JP' for Japanese, 'en-US' for English
3. Uses browser's native TTS engine
4. Waits for `onend` event before resolving

**Supported Languages**:
- `'ja'` → `'ja-JP'`
- `'en'` → `'en-US'`

**Browser Support**: Chrome, Edge, Firefox (requires system TTS voices)

#### Audio Playback

```javascript
async _playAudio(audioBlob)
```

Generic audio playback:
1. Creates object URL from blob
2. Creates Audio element
3. Plays audio
4. Cleans up object URL on completion or error

---

### 2. Tool Execution Layer: `tool-executor.js`

**File**: [js/tool-executor.js](js/tool-executor.js:261-284)

The `ToolExecutor` handles the `speak_text` tool calls from Claude:

```javascript
case "speak_text": {
    const text = args.text || "";
    const language = args.language || "ja";
    
    // Validation: 1-500 characters
    if (!text.trim()) { /* error */ }
    if (text.length > 500) { /* error */ }
    
    try {
        resultData = await this.toio.speakText(text, language);
    } catch (error) {
        resultData = { status: "error", error: error.message };
    }
}
```

**Constraints**:
- Maximum 500 characters per call
- Empty text results in error
- Errors caught and returned as `{ status: "error", error: ... }`

### Auto Voice Feedback Integration

Several tool completion handlers include automatic voice feedback:

| Tool | Feedback |
|------|----------|
| `stop()` | "停止しました" (stopped) |
| `spin()` | "右回転完了しました" or "左回転完了しました" |
| `set_light()` | Color name + "に設定完了しました" |
| `play_sound()` | "音の再生完了しました" |
| `play_melody()` | "メロディの再生完了しました" |
| `set_light_pattern()` | "ライトパターンの再生完了しました" |
| `move_to()` | "移動完了しました" (on success) |
| `move_path()` | Per-waypoint: "ポイントN に到着しました" + final: "すべてのウェイポイントに到達しました" |

**Implementation Pattern**:
```javascript
case "move_to": {
    // ... execution ...
    if (moveRes && moveRes.result === 0x00) {
        try {
            await this.toio.speakText("移動完了しました", "ja");
        } catch (err) {
            console.warn("[ToolExecutor] Failed to speak:", err.message);
        }
    }
}
```

**Error Handling**: Auto-feedback errors are logged but non-fatal (don't break the main tool execution).

---

### 3. Claude Integration Layer: `dev-server.js`

**File**: [scripts/dev-server.js](scripts/dev-server.js:150-176)

The dev-server includes narration instructions in the system prompt sent to Claude:

```
## ナレーション指示（IMPORTANT）
応答の最後に **必ず** 以下のマーカーを追加：

- **ユーザーへの直接応答** → [SHOULD_NARRATE]
- **単純な完了報告のみ** → [NO_NARRATE]
```

**Narration Plan Extraction** ([dev-server.js:290-314](scripts/dev-server.js)):

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

**Result**: Returns object with cleaned text and narration decision:
```javascript
{
    cleanText: "response text without markers",
    narrationPlan: {
        should_narrate: true/false,
        text: "text to narrate"
    }
}
```

---

### 4. Browser UI Layer: `app.js`

**File**: [js/app.js](js/app.js:174-202)

Handles Claude responses and triggers voice feedback:

```javascript
case 'assistant': {
    const displayText = msg.text || '(空のレスポンス)';
    addMessage('ai', displayText);
    lastAssistantText = msg.text || '';
    lastNarrationPlan = msg.narrationPlan || null;
    break;
}

case 'result': {
    // Heuristic: skip narration for simple completion messages
    const isSingleLineCompletion = lastAssistantText.trim().split('\n').length === 1 &&
        /^(.*?(完了|終了|完了しました|してきました|到達しました).*)$/.test(lastAssistantText);

    if (lastNarrationPlan && lastNarrationPlan.should_narrate === false) {
        console.log('[ClaudeChat] Narration plan: skip');
    } else if (isSingleLineCompletion) {
        console.log('[ClaudeChat] Heuristic: skip simple completion');
    } else if (lastAssistantText.trim() && bridge && bridge.isConnected()) {
        console.log('[ClaudeChat] Speak response');
        const textToSpeak = lastNarrationPlan?.text || lastAssistantText;
        bridge.call('speak_text', {
            text: textToSpeak,
            language: 'ja'
        }).catch(err => console.error('[speak_text] Failed:', err));
    }
}
```

**Decision Logic**:
1. Check explicit narration plan (`[SHOULD_NARRATE]` or `[NO_NARRATE]`)
2. Apply heuristic: skip if single-line completion message
3. If both criteria pass and MCP bridge connected: call `speak_text` tool

---

### 5. Tool Definitions: `tools-schema.js`

**File**: [js/tools-schema.js:264-288](js/tools-schema.js)

Defines `speak_text` tool for Claude:

```json
{
  "type": "function",
  "function": {
    "name": "speak_text",
    "description": "Convert text to speech and play through PC speakers using Web Speech API. Supports Japanese and English. Max 500 characters per call.",
    "parameters": {
      "type": "object",
      "properties": {
        "text": {
          "type": "string",
          "description": "Text to speak (max 500 characters)",
          "maxLength": 500
        },
        "language": {
          "type": "string",
          "enum": ["ja", "en"],
          "default": "ja",
          "description": "Language code (ja=Japanese, en=English)"
        }
      },
      "required": ["text"]
    }
  }
}
```

---

## Data Flow Diagram

### Auto Feedback Flow (Tool Completion)

```
Tool Execution (move_to, spin, etc.)
    ↓
Completion Check (success condition)
    ↓
Call this.toio.speakText(feedbackText, "ja")
    ↓
ToioCombined.speakText()
    ├─→ Try: VOICEVOX API
    │   ├─→ /audio_query
    │   ├─→ /synthesis
    │   └─→ _playAudio()
    │
    └─→ Catch: Web Speech API
        └─→ SpeechSynthesisUtterance
```

### Claude Response Narration Flow

```
Claude AI Response
    ↓
dev-server extracts [SHOULD_NARRATE]/[NO_NARRATE] markers
    ↓
Broadcast to browser with narrationPlan
    ↓
Browser receives 'assistant' message
    ├─→ Stores lastNarrationPlan
    └─→ Displays text (markers removed)
    ↓
Turn completes ('result' message)
    ↓
Decision Logic:
    ├─→ If plan.should_narrate === false: SKIP
    ├─→ If single-line completion heuristic: SKIP
    ├─→ Otherwise: Call bridge.call('speak_text', ...)
    ↓
MCP Bridge → speak_text Tool Call
    ↓
ToolExecutor.speak_text
    ↓
ToioCombined.speakText() [same as auto feedback]
```

---

## Configuration

### VOICEVOX Port

**Storage**: `localStorage.voicevoxPort`

**Default**: 50021

**Usage**:
```javascript
const voicevoxPort = Number(localStorage.getItem('voicevoxPort') || 50021);
```

**Set via browser console**:
```javascript
localStorage.setItem('voicevoxPort', '50022');
```

### Speaker ID

**Currently Fixed**: Speaker ID 3 (Zundamon female character)

**Location**: Hardcoded in `ToioCombined.speakText(text, language, speakerId = 3)`

**VOICEVOX Available Speakers** (if configured):
- 0: Zundamon (male)
- 1: Zundamon (female) - standard
- 2: Zunko
- 3: Zundamon (character voice)
- Many others depending on VOICEVOX installation

### Language Support

**Supported in Web Speech API**:
- `'ja'` → `'ja-JP'`
- `'en'` → `'en-US'`

**In VOICEVOX**: Speaker availability depends on installation; text is passed as-is.

---

## Error Handling

### VOICEVOX Connection Error
```javascript
try {
    return await this._speakWithVoiceVox(text, speakerId);
} catch (error) {
    console.warn('[speakText] VOICEVOX unavailable, falling back to Web Speech API:', error.message);
    return await this._speakWithWebSpeechAPI(text, language);
}
```

**Common Errors**:
- `VOICEVOX audio_query failed: 404` — VOICEVOX not running on specified port
- `VOICEVOX synthesis failed: 400` — Invalid audio query response
- Network errors if VOICEVOX API is inaccessible

### Tool Execution Error
```javascript
try {
    resultData = await this.toio.speakText(text, language);
} catch (error) {
    resultData = { status: "error", error: error.message };
}
```

**Constraints Checked**:
- Empty text → error
- Text > 500 chars → error
- VOICEVOX unavailable → fallback to Web Speech API
- Web Speech API error → error response returned

### Auto Feedback Error Handling

```javascript
try {
    await this.toio.speakText("move complete", "ja");
} catch (err) {
    console.warn("[ToolExecutor] Failed to speak:", err.message);
    // Execution continues; feedback failure is non-fatal
}
```

**Behavior**: Auto feedback errors are logged but don't interrupt tool execution.

---

## Performance Characteristics

### VOICEVOX
- **Latency**: 200-500ms (includes synthesis time)
- **Quality**: High (professional TTS)
- **Dependency**: Local HTTP service running
- **Pros**: Natural Japanese voice, character quality
- **Cons**: Requires separate VOICEVOX installation and running

### Web Speech API
- **Latency**: 100-300ms
- **Quality**: Varies by OS/browser (system TTS)
- **Dependency**: Browser native API
- **Pros**: No external dependency, works offline
- **Cons**: Voice quality depends on system

### Combined (Current Implementation)
- **Default**: Fast path via VOICEVOX if available
- **Fallback**: Automatic degradation to Web Speech API
- **User Impact**: Seamless experience even if VOICEVOX unavailable

---

## Testing & Debugging

### Manual Voice Synthesis Test

**Browser Console**:
```javascript
// Test VOICEVOX
window.bridge.call('speak_text', { text: 'テストです', language: 'ja' });

// Direct call
const executor = window.bridge.executor;
await executor.toio.speakText('こんにちは', 'ja');
```

### Check VOICEVOX Status

```javascript
// In browser console
const port = Number(localStorage.getItem('voicevoxPort') || 50021);
fetch(`http://localhost:${port}/audio_query?text=test&speaker=3`, { method: 'POST' })
    .then(r => r.json())
    .then(console.log)
    .catch(err => console.error('VOICEVOX unavailable:', err));
```

### Monitor Voice Synthesis
Open DevTools Console:
```
[speakText] VOICEVOX unavailable, falling back to Web Speech API: ...
[ClaudeChat] Speak response
[speak_text] Failed: ...
[ToolExecutor] Failed to speak completion: ...
```

### Environment Debugging
```javascript
// Check configuration
localStorage.getItem('voicevoxPort')      // VOICEVOX port
navigator.onLine                           // Network status
window.speechSynthesis.getVoices()         // Available system voices
```

---

## Dependencies & References

### External APIs
- **VOICEVOX API**: Local HTTP service (typically `localhost:50021`)
- **Web Speech API**: W3C standard (`window.speechSynthesis`)

### Related Files
- [js/toio-combined.js](js/toio-combined.js) — Voice synthesis implementations
- [js/tool-executor.js](js/tool-executor.js) — Tool invocations and auto-feedback
- [js/app.js](js/app.js) — UI integration and narration logic
- [scripts/dev-server.js](scripts/dev-server.js) — Claude narration prompt and extraction
- [js/tools-schema.js](js/tools-schema.js) — Tool definitions for Claude
- [js/mcp-bridge.js](js/mcp-bridge.js) — Tool call routing from Claude

### Claude System Prompt Sections
- Narration instructions: [dev-server.js:160-176](scripts/dev-server.js)
- Tool availability: Listed in system prompt
- Tips: Guidance on speak_text usage

---

## Future Enhancements

### Potential Improvements
1. **Speaker Selection UI**: Allow user to choose VOICEVOX speaker at runtime
2. **Voice Rate/Pitch Control**: Expose pronunciation settings in tool parameters
3. **Audio Caching**: Cache frequently-used phrases to reduce latency
4. **Streaming TTS**: Return audio chunks for lower latency feedback
5. **Custom Voices**: Support additional voice engines (Azure TTS, Google Cloud TTS)
6. **Concurrent Synthesis**: Handle multiple speak_text calls in parallel
7. **Status Tracking**: Display TTS engine status in UI (VOICEVOX availability indicator)

### Known Limitations
- VOICEVOX port is fixed at startup (requires page refresh to change)
- No support for speech rate/pitch customization
- Web Speech API quality varies across browsers/OS
- No audio volume control exposed
- Synchronous playback (blocks further voice synthesis until complete)

---

## Maintenance Notes

### Adding New Auto-Feedback
1. Identify tool completion condition
2. Add try-catch block: `await this.toio.speakText(feedbackText, "ja")`
3. Log non-fatal errors (don't break tool execution)

**Example**:
```javascript
case "my_tool": {
    // ... tool execution ...
    
    // Auto voice feedback
    try {
        await this.toio.speakText("my tool完了しました", "ja");
    } catch (err) {
        console.warn("[ToolExecutor] Failed to speak:", err.message);
    }
    break;
}
```

### Updating Narration Prompts
Edit [dev-server.js:160-176](scripts/dev-server.js) to change Claude's narration instructions.

Remember to:
1. Update both the positive case (`[SHOULD_NARRATE]`) and negative case (`[NO_NARRATE]`)
2. Include clear examples for Claude
3. Test with actual Claude responses to verify extraction logic

