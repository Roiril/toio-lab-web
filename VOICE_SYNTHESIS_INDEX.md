# Voice Synthesis Documentation Index

Complete documentation of the voice synthesis (text-to-speech) system in toio-lab-web.

---

## 📚 Documentation Files

### 1. **VOICE_SYNTHESIS_SYSTEM.md** ⭐ (Start Here)
**Complete architectural overview** — read this first for comprehensive understanding.

**Covers:**
- System architecture and components
- Data flow diagrams
- Configuration options
- Error handling strategies
- Testing & debugging procedures
- Dependencies and references

**Best for:**
- Understanding how everything connects
- Troubleshooting integration issues
- Knowing where to find specific code

---

### 2. **VOICEVOX_SETUP_GUIDE.md** 🔧
**Installation, configuration, and troubleshooting** — practical setup guide.

**Covers:**
- VOICEVOX installation (Windows/macOS/Linux)
- Port and speaker configuration
- Network access setup (multi-PC)
- Troubleshooting common issues
- Performance optimization
- Resource requirements

**Best for:**
- Getting VOICEVOX running
- Fixing connection issues
- Multi-PC setups
- Optimizing performance

---

### 3. **VOICE_SYNTHESIS_EXAMPLES.md** 💻
**Code examples and integration patterns** — practical reference.

**Covers:**
- Browser console examples
- Tool integration patterns
- Claude narration integration
- Custom voice engines
- Advanced features (streaming, caching)
- Monitoring and debugging
- Error handling patterns
- Testing examples
- Performance benchmarks

**Best for:**
- Copy-paste code examples
- Implementing new features
- Understanding patterns
- Debugging voice issues

---

## 🎯 Quick Start by Use Case

### I want to understand how voice synthesis works
1. Read: [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md) → Architecture & Data Flow sections
2. Reference: [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md) → Browser Integration

### I want to set up VOICEVOX
1. Follow: [VOICEVOX_SETUP_GUIDE.md](VOICEVOX_SETUP_GUIDE.md) → Installation & Startup
2. Test: [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md) → Test VOICEVOX Status

### Voice synthesis isn't working
1. Check: [VOICEVOX_SETUP_GUIDE.md](VOICEVOX_SETUP_GUIDE.md) → Troubleshooting section
2. Verify: [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md) → Check VOICEVOX Status
3. Debug: [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md) → Testing & Debugging section

### I want to add voice to my own tool
1. Reference: [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md) → Adding Voice to Your Own Tools
2. Understand: [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md) → Tool Execution Layer section

### I want to modify Claude's narration
1. Reference: [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md) → Claude Integration Layer
2. Examples: [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md) → Claude Integration section

### I want to add a different TTS engine
1. Study: [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md) → Advanced: Custom Voice Engines
2. Understand: [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md) → Architecture Components

---

## 🔍 Finding Information by Topic

### Architecture & Design
- **Main components** → [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md#architecture-components)
- **Data flow** → [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md#data-flow-diagram)
- **Integration patterns** → [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md#adding-voice-to-your-own-tools)

### VOICEVOX
- **Installation** → [VOICEVOX_SETUP_GUIDE.md](VOICEVOX_SETUP_GUIDE.md#installation)
- **Configuration** → [VOICEVOX_SETUP_GUIDE.md](VOICEVOX_SETUP_GUIDE.md#startup--configuration)
- **Troubleshooting** → [VOICEVOX_SETUP_GUIDE.md](VOICEVOX_SETUP_GUIDE.md#troubleshooting)
- **API details** → [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md#voicevox-implementation)
- **Testing** → [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md#check-voicevox-status)

### Web Speech API
- **Implementation** → [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md#web-speech-api-implementation)
- **Browser support** → [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md#web-speech-api-implementation)
- **Testing** → [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md#direct-voice-synthesis)

### Tool Integration
- **speak_text tool definition** → [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md#tool-definitions-tools-schemajs)
- **Auto voice feedback** → [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md#auto-voice-feedback-integration)
- **Adding to custom tools** → [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md#adding-voice-to-your-own-tools)

### Claude Integration
- **Narration system prompt** → [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md#claude-integration-layer-dev-serverjs)
- **Narration plan extraction** → [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md#narration-plan-extraction)
- **Browser response handling** → [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md#browser-ui-layer-appjs)
- **Custom narration logic** → [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md#custom-narration-decision-logic)

### Configuration
- **VOICEVOX port** → [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md#voicevox-port)
- **Speaker selection** → [VOICEVOX_SETUP_GUIDE.md](VOICEVOX_SETUP_GUIDE.md#speaker-configuration)
- **Language support** → [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md#language-support)

### Debugging & Testing
- **Error handling** → [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md#error-handling)
- **Manual tests** → [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md#testing--debugging)
- **Network monitoring** → [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md#network-monitoring)
- **Performance monitoring** → [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md#enable-detailed-logging)

### Performance
- **Latency characteristics** → [VOICEVOX_SETUP_GUIDE.md](VOICEVOX_SETUP_GUIDE.md#performance-metrics)
- **Optimization** → [VOICEVOX_SETUP_GUIDE.md](VOICEVOX_SETUP_GUIDE.md#performance-optimization)
- **Benchmarks** → [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md#performance-benchmarks)

### Advanced Features
- **Custom TTS engines** → [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md#add-alternative-tts-engine)
- **Audio streaming** → [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md#add-audio-streaming)
- **Caching** → [VOICEVOX_SETUP_GUIDE.md](VOICEVOX_SETUP_GUIDE.md#caching-frequently-used-phrases)

---

## 🔗 File References

### Code Files Mentioned

| File | Purpose |
|------|---------|
| [js/toio-combined.js](js/toio-combined.js) | Main voice synthesis implementations (VOICEVOX + Web Speech API) |
| [js/tool-executor.js](js/tool-executor.js) | Tool invocations and auto-feedback logic |
| [js/app.js](js/app.js) | UI layer, Claude response handling, narration |
| [scripts/dev-server.js](scripts/dev-server.js) | Claude system prompt, narration extraction |
| [js/tools-schema.js](js/tools-schema.js) | speak_text tool definition |
| [js/mcp-bridge.js](js/mcp-bridge.js) | MCP bridge for tool calls |
| [js/toio-ble.js](js/toio-ble.js) | BLE interface (no TTS) |
| [js/toio-sim.js](js/toio-sim.js) | Simulator interface |

---

## 🎓 Learning Path

**For Complete Understanding (3-4 hours)**
1. [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md) — Full read
2. [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md) — Full read
3. [VOICEVOX_SETUP_GUIDE.md](VOICEVOX_SETUP_GUIDE.md) — Skim for reference
4. Examine source code files in order:
   - `js/toio-combined.js` (voice implementations)
   - `js/tool-executor.js` (tool handling)
   - `js/app.js` (UI integration)
   - `scripts/dev-server.js` (Claude integration)

**For Practical Setup (30-60 min)**
1. [VOICEVOX_SETUP_GUIDE.md](VOICEVOX_SETUP_GUIDE.md) — Installation & Configuration
2. [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md) — Testing section
3. Verify in browser console

**For Integration (1-2 hours)**
1. [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md) — Relevant pattern
2. [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md) — Related architecture section
3. Copy example code and adapt

**For Troubleshooting (15-30 min)**
1. [VOICEVOX_SETUP_GUIDE.md](VOICEVOX_SETUP_GUIDE.md#troubleshooting) — Targeted solutions
2. [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md#monitoring--debugging) — Debug techniques

---

## 📋 System Summary

### Voice Synthesis Flow (High Level)

```
Tool Execution / Claude Response
         ↓
    speakText(text, language, speakerId)
         ↓
    Try: VOICEVOX (localhost:50021)
         ├→ /audio_query → JSON params
         ├→ /synthesis → Audio blob
         └→ playAudio() → HTML Audio element
         ↓ (on error)
    Fallback: Web Speech API
         ├→ SpeechSynthesisUtterance
         └→ window.speechSynthesis.speak()
         ↓ (on error)
    Error logged, execution continues
```

### Components at a Glance

| Component | File | Responsibility |
|-----------|------|-----------------|
| **Voice Synthesis** | `toio-combined.js` | VOICEVOX/Web Speech selection & execution |
| **Tool Handler** | `tool-executor.js` | Auto-feedback + speak_text tool execution |
| **UI Integration** | `app.js` | Claude response → narration decision |
| **Claude Prompt** | `dev-server.js` | Narration markers + extraction |
| **Tool Definition** | `tools-schema.js` | speak_text tool schema for Claude |
| **MCP Bridge** | `mcp-bridge.js` | Tool call routing |

### Technologies

- **VOICEVOX**: Open-source Japanese TTS engine (HTTP API)
- **Web Speech API**: Browser native TTS (W3C standard)
- **Web Bluetooth API**: Physical toio communication (in toio-ble.js)
- **Claude AI**: LLM driving narration decisions
- **Node.js**: dev-server for streaming Claude responses

---

## ❓ FAQ

**Q: Where do I configure VOICEVOX port?**
A: Browser localStorage. See [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md#voicevox-port) or [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md#configure-voicevox-port)

**Q: Can I use a different voice?**
A: Yes. Edit speaker ID in `toio-combined.js` line 95. See [VOICEVOX_SETUP_GUIDE.md](VOICEVOX_SETUP_GUIDE.md#changing-default-speaker)

**Q: What if VOICEVOX isn't running?**
A: System automatically falls back to Web Speech API. See [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md#error-handling) or [VOICEVOX_SETUP_GUIDE.md](VOICEVOX_SETUP_GUIDE.md#troubleshooting)

**Q: How do I add voice to my custom tool?**
A: Use auto-feedback pattern. See [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md#adding-voice-to-your-own-tools)

**Q: Can I modify Claude's narration behavior?**
A: Yes. Edit system prompt in `dev-server.js` or decision logic in `app.js`. See [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md#claude-integration)

**Q: What languages are supported?**
A: VOICEVOX (Japanese primarily), Web Speech API (ja-JP, en-US). See [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md#language-support)

**Q: How do I debug voice issues?**
A: Use browser console examples. See [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md#check-voicevox-status) and [VOICEVOX_SETUP_GUIDE.md](VOICEVOX_SETUP_GUIDE.md#troubleshooting)

**Q: Can I add a different TTS engine?**
A: Yes, but requires code modification. See [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md#add-alternative-tts-engine) for example with Google Cloud TTS

---

## 📞 Support Resources

- **VOICEVOX Official**: https://voicevox.port.in.net/
- **VOICEVOX GitHub**: https://github.com/VOICEVOX/voicevox_engine
- **Web Speech API MDN**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API
- **Claude Code Docs**: https://claude.com/help/claude-code

---

## 🔄 Version & Updates

**Documentation created**: April 21, 2026

**Last updated**: April 21, 2026

**Relevant code commits**:
- `ba83a9b` - Add voice feedback at action start and completion
- `55713d0` - Integrate VOICEVOX for character voice synthesis (Zundamon)
- `55a7b72` - Enhance system prompt for continuous narration
- `694d511` - Add speak_text to Claude system prompt

**Known Limitations**:
- VOICEVOX port requires page reload to change
- No speaker selection UI (hardcoded at startup)
- Synchronous audio playback (queuing would improve responsiveness)

---

## 💡 Tips

- **Test mode**: Use browser console to test voice synthesis without full UI
- **Silent fallback**: Web Speech API degrades gracefully when VOICEVOX unavailable
- **Performance**: VOICEVOX is faster but requires setup; Web Speech is built-in
- **Debugging**: Check DevTools Console for `[speakText]`, `[ToolExecutor]`, `[ClaudeChat]` logs
- **Multi-PC**: Use VOICEVOX host IP in toio-combined.js baseUrl for network access

---

**End of Index**

For specific information, navigate to the relevant documentation file above.

