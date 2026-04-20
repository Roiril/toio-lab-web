# VOICEVOX Setup and Configuration Guide

This guide covers setting up VOICEVOX for high-quality Japanese voice synthesis in toio-lab-web.

---

## What is VOICEVOX?

VOICEVOX is an open-source, free text-to-speech (TTS) engine that provides high-quality Japanese voice synthesis. It offers multiple character voices and professional audio quality, making it ideal for interactive applications like toio-lab-web.

**Official Site**: https://voicevox.port.in.net/

---

## Installation

### Windows

#### Option 1: Standalone Installer (Recommended)

1. Download VOICEVOX from the official site
2. Run the installer
3. Launch the VOICEVOX application
4. The API server will automatically start on `http://localhost:50021`

**Verification**:
```bash
curl http://localhost:50021/version
# Should return: {"version":"..."}
```

#### Option 2: Docker

If you have Docker installed:

```bash
docker run -p 50021:50021 voicevoxengine/voicevox_engine:latest
```

### macOS

1. Download VOICEVOX for macOS from the official site
2. Drag to Applications folder
3. Launch the application
4. Verify API is running on port 50021

### Linux

```bash
# Ubuntu/Debian example - check official site for latest
wget https://github.com/VOICEVOX/voicevox_engine/releases/download/0.X.X/voicevox_engine-0.X.X-linux-cpu.zip
unzip voicevox_engine-0.X.X-linux-cpu.zip
cd voicevox_engine
./run.sh
```

---

## Startup & Configuration

### Starting VOICEVOX

**Windows GUI**: Launch the VOICEVOX application from Start Menu or desktop

**Command Line** (any OS):
```bash
# From VOICEVOX directory
voicevox_engine --host 0.0.0.0 --port 50021 --cpu_num_threads 4
```

**Verify Running**:
```bash
# In browser or curl
http://localhost:50021/version
http://localhost:50021/speakers
```

### Port Configuration

Default port is 50021. To use a different port:

**In VOICEVOX Application**:
- Settings → Server Port → Enter custom port → Apply

**In toio-lab-web**:

Open browser DevTools Console:
```javascript
localStorage.setItem('voicevoxPort', '50022');
location.reload();
```

Or modify directly in `toio-combined.js`:
```javascript
const voicevoxPort = Number(localStorage.getItem('voicevoxPort') || 50021);
```

---

## Speaker Configuration

### Available Speakers

VOICEVOX comes with several built-in character voices (default installation):

| ID | Character | Gender | Notes |
|----|-----------|--------|-------|
| 0 | Zundamon | Male | Standard male voice |
| 1 | Zundamon | Female | Standard female voice |
| 2 | Zunko | Female | Classic VOICEVOX voice |
| 3 | Zundamon | Female (Character) | Current default in toio-lab-web |
| 4+ | Additional | Varies | Depends on installation |

**View All Available Speakers**:
```javascript
// In browser console
const port = Number(localStorage.getItem('voicevoxPort') || 50021);
fetch(`http://localhost:${port}/speakers`)
    .then(r => r.json())
    .then(speakers => {
        speakers.forEach(s => {
            console.log(`ID ${s.speaker_uuid}: ${s.name}`);
            s.styles.forEach(st => console.log(`  - ${st.name}`));
        });
    });
```

### Changing Default Speaker

**Current Implementation**: Fixed at Speaker ID 3 (Zundamon female character voice)

**To Change**:

1. Edit `js/toio-combined.js`:
```javascript
// Line 95: Change default speakerId
async speakText(text, language = 'ja', speakerId = 3) {
    // Change 3 to desired speaker ID
}
```

2. Update `js/tool-executor.js` (line 279):
```javascript
resultData = await this.toio.speakText(text, language, 3); // Change 3 here too
```

3. Reload browser

---

## Testing & Verification

### Quick API Test

**Browser Console**:
```javascript
const port = Number(localStorage.getItem('voicevoxPort') || 50021);

// Test connection
fetch(`http://localhost:${port}/version`)
    .then(r => r.json())
    .then(v => console.log('VOICEVOX Version:', v))
    .catch(e => console.error('VOICEVOX not running:', e));
```

### Test Voice Synthesis

**Via Browser**:
```javascript
// Test direct synthesis
const port = Number(localStorage.getItem('voicevoxPort') || 50021);
const text = 'こんにちは';
const speakerId = 3;

const query = new URLSearchParams({ text, speaker: speakerId });
fetch(`http://localhost:${port}/audio_query?${query}`, { method: 'POST' })
    .then(r => r.json())
    .then(audioQuery => 
        fetch(`http://localhost:${port}/synthesis?speaker=${speakerId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(audioQuery)
        })
    )
    .then(r => r.blob())
    .then(blob => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
    })
    .catch(e => console.error('Error:', e));
```

### Test Tool Integration

```javascript
// Test via tool executor
window.bridge.call('speak_text', {
    text: 'ボイスボックステストです',
    language: 'ja'
}).then(console.log).catch(console.error);
```

---

## Troubleshooting

### VOICEVOX Not Running

**Symptoms**: 
- Error: "VOICEVOX audio_query failed: 404"
- Voice feedback falls back to Web Speech API
- Console: "[speakText] VOICEVOX unavailable..."

**Solutions**:

1. **Verify VOICEVOX is Running**:
```bash
# Windows PowerShell
netstat -ano | findstr 50021

# macOS/Linux
lsof -i :50021
```

2. **Start VOICEVOX**:
   - Windows: Launch application from Start Menu
   - Command line: `voicevox_engine --host 0.0.0.0 --port 50021`

3. **Check Firewall**:
   - Windows: Ensure VOICEVOX is allowed through firewall
   - macOS: System Preferences → Security & Privacy → Firewall

4. **Verify Port**:
```javascript
// Check configured port
localStorage.getItem('voicevoxPort')

// Test connection
fetch(`http://localhost:${Number(localStorage.getItem('voicevoxPort') || 50021)}/version`)
```

### Wrong Port Configuration

**Symptoms**:
- VOICEVOX runs, but fallback to Web Speech API occurs

**Solutions**:
1. Check VOICEVOX application settings for actual port
2. Update localStorage:
```javascript
localStorage.setItem('voicevoxPort', '50022');
location.reload();
```

3. Verify new port:
```javascript
const port = Number(localStorage.getItem('voicevoxPort'));
console.log('Using port:', port);
fetch(`http://localhost:${port}/version`).then(r => r.json()).then(console.log);
```

### CORS / Network Errors

**Symptoms**:
- "Failed to fetch" or CORS errors in console
- Synthesis fails immediately

**Solutions**:

1. **Verify Network Access**:
```javascript
// VOICEVOX should allow localhost requests by default
// If running on different machine:
const port = 50021;
const host = '192.168.1.10'; // VOICEVOX machine IP
fetch(`http://${host}:${port}/version`);
```

2. **VOICEVOX CORS Configuration** (if needed):
   - Run with: `voicevox_engine --host 0.0.0.0 --port 50021`
   - Allows requests from any origin

3. **Browser Security**:
   - toio-lab-web should be on `http://` (not `https://`) for localhost access
   - Or VOICEVOX needs proper CORS headers

### Audio Playback Issues

**Symptoms**:
- Synthesis succeeds, but no sound
- Audio blob received but doesn't play

**Solutions**:

1. **Check System Volume**: Ensure Windows/macOS volume is not muted

2. **Test Browser Audio**:
```javascript
// Simple browser audio test
const audio = new Audio('data:audio/wav;base64,UklGRi4AAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAAA=');
audio.play();
```

3. **Test Direct VOICEVOX Audio**:
   - Download audio file from VOICEVOX API
   - Open in media player to verify synthesized audio quality

4. **Browser Permissions**:
   - Ensure autoplay is enabled in browser settings
   - Check speaker output is properly connected

### Speaker ID Not Found

**Symptoms**:
- Error: "VOICEVOX synthesis failed: 400"
- Speaker not available in /speakers endpoint

**Solutions**:

1. **View Available Speakers**:
```javascript
const port = Number(localStorage.getItem('voicevoxPort') || 50021);
fetch(`http://localhost:${port}/speakers`)
    .then(r => r.json())
    .then(speakers => console.table(speakers.map((s, i) => ({
        id: s.speaker_uuid,
        name: s.name,
        styles: s.styles.map(st => st.name).join(', ')
    }))));
```

2. **Update Speaker ID**:
   - Identify correct speaker from list
   - Update `js/toio-combined.js` line 95
   - Reload page

3. **Reinstall VOICEVOX**:
   - Uninstall VOICEVOX completely
   - Remove cache/data directories
   - Reinstall latest version

---

## Performance Optimization

### Caching Frequently-Used Phrases

Current implementation does not cache, but you could add:

```javascript
// Simple cache in ToioCombined
const voiceCache = new Map();

async speakText(text, language = 'ja', speakerId = 3) {
    const cacheKey = `${text}-${speakerId}`;
    if (voiceCache.has(cacheKey)) {
        return this._playAudio(voiceCache.get(cacheKey));
    }
    
    const blob = await this._synthesize(text, speakerId);
    voiceCache.set(cacheKey, blob);
    return this._playAudio(blob);
}
```

### Parallel Synthesis

Multiple `speak_text` calls await sequentially. For true parallel synthesis, modify:

```javascript
// Current: Sequential
await toio.speakText(text1);
await toio.speakText(text2);

// Future: Parallel (would require queueing)
Promise.all([
    toio.speakText(text1),
    toio.speakText(text2)
]);
```

### Network Optimization

- **Use VOICEVOX locally** (same PC) for lowest latency
- **Pre-synthesis** messages during idle time
- **Compress audio** if bandwidth is constrained

---

## Network Access (Multi-PC Setup)

### Running VOICEVOX on Different PC

1. **VOICEVOX Machine**:
```bash
voicevox_engine --host 0.0.0.0 --port 50021
```
(Note: `0.0.0.0` allows external connections)

2. **toio-lab-web Machine**:

Get VOICEVOX machine IP:
```bash
# On VOICEVOX machine
ipconfig getifaddr en0  # macOS
hostname -I             # Linux
ipconfig                # Windows (look for IPv4 Address)
```

Set in browser console:
```javascript
const voicevoxIp = '192.168.1.10'; // VOICEVOX machine IP
localStorage.setItem('voicevoxPort', '50021@' + voicevoxIp);
// Or for simplicity, modify toio-combined.js directly
```

3. **Test Connection**:
```javascript
fetch('http://192.168.1.10:50021/version')
    .then(r => r.json())
    .then(console.log);
```

---

## Resource Requirements

### Minimum System Requirements

| Component | Requirement |
|-----------|------------|
| CPU | 2+ cores |
| RAM | 2GB minimum, 4GB+ recommended |
| Storage | 1GB free (for installation + cache) |
| Disk Type | SSD recommended for faster synthesis |

### Performance Metrics

| Metric | Value |
|--------|-------|
| Startup Time | 5-10 seconds |
| Synthesis Latency | 200-500ms (depends on text length) |
| Memory Usage | ~300-500MB running |
| Typical File Size | 50-100KB per synthesized audio (5-10 seconds speech) |

### GPU Acceleration

VOICEVOX can use GPU if available:

```bash
# NVIDIA CUDA support
voicevox_engine --use_gpu --port 50021

# AMD ROCm
voicevox_engine --use_gpu_amd --port 50021
```

Check if GPU is detected:
```javascript
fetch(`http://localhost:50021/version`)
    .then(r => r.json())
    .then(v => console.log('GPU Available:', v.includes('gpu')));
```

---

## Advanced Configuration

### Environment Variables

```bash
# Set on startup
VOICEVOX_PORT=50022
VOICEVOX_CORES=4
VOICEVOX_CPU_THREADS=4

voicevox_engine
```

### Logging & Debugging

Enable verbose logging:

```bash
voicevox_engine --log_level DEBUG --port 50021
```

Monitor in real-time:
```bash
# On same machine
tail -f ~/.voicevox/logs/*.log
```

### API Rate Limiting

Current implementation has no built-in rate limiting. To add:

```javascript
// Simple rate limiter
class VoiceLimiter {
    constructor(maxPerSecond = 5) {
        this.maxPerSecond = maxPerSecond;
        this.queue = [];
    }
    
    async speak(text, language, speakerId) {
        // Wait if queue is full
        while (this.queue.length >= this.maxPerSecond) {
            await new Promise(r => setTimeout(r, 100));
        }
        this.queue.push(Date.now());
        // Remove old entries
        const oneSecAgo = Date.now() - 1000;
        this.queue = this.queue.filter(t => t > oneSecAgo);
        
        return await toio.speakText(text, language, speakerId);
    }
}
```

---

## Support & Resources

### Official Documentation

- VOICEVOX: https://voicevox.port.in.net/
- API Documentation: https://github.com/VOICEVOX/voicevox_engine
- GitHub Issues: https://github.com/VOICEVOX/voicevox_engine/issues

### Community

- GitHub Discussions: https://github.com/VOICEVOX/voicevox_engine/discussions
- Japanese Community: https://github.com/VOICEVOX

### Debugging Resources

- Browser DevTools Network tab (F12)
- Console logs: Search for `[speakText]` and `[ToolExecutor]`
- Network tab: Monitor `/audio_query` and `/synthesis` requests

