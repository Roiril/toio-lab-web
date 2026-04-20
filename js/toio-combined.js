/**
 * Utility class to multicast commands to both virtual Sim and physical BLE cube.
 */
class ToioCombined {
    constructor(toioSim, toioBle) {
        this.sim = toioSim;
        this.ble = toioBle;
    }

    get isConnected() {
        // Simulator is always considered available.
        return true;
    }

    async move(left, right, durationMs) {
        await Promise.all([
            this.sim.move(left, right, durationMs),
            this.ble.isConnected ? this.ble.move(left, right, durationMs) : Promise.resolve()
        ]);
    }

    _bleSafe(promise, label) {
        return promise.catch(e => console.warn(`[BLE] ${label} failed (non-fatal):`, e.message));
    }

    async stop() {
        await Promise.all([
            this.sim.stop(),
            this.ble.isConnected ? this._bleSafe(this.ble.stop(), 'stop') : Promise.resolve()
        ]);
    }

    async spin(speed, durationMs, direction) {
        await Promise.all([
            this.sim.spin(speed, durationMs, direction),
            this.ble.isConnected ? this._bleSafe(this.ble.spin(speed, durationMs, direction), 'spin') : Promise.resolve()
        ]);
    }

    async setLight(r, g, b, durationMs) {
        await Promise.all([
            this.sim.setLight(r, g, b, durationMs),
            this.ble.isConnected ? this._bleSafe(this.ble.setLight(r, g, b, durationMs), 'setLight') : Promise.resolve()
        ]);
    }

    async playSound(noteId, durationMs) {
        await Promise.all([
            this.sim.playSound(noteId, durationMs),
            this.ble.isConnected ? this._bleSafe(this.ble.playSound(noteId, durationMs), 'playSound') : Promise.resolve()
        ]);
    }

    async playMelody(notes) {
        const blePromise = this.ble.isConnected && this.ble.playMelody
            ? this.ble.playMelody(notes)
            : Promise.resolve();

        await Promise.all([
            this.sim.playMelody(notes),
            blePromise
        ]);
    }

    async setLightPattern(frames, repetitions) {
        await Promise.all([
            this.sim.setLightPattern(frames, repetitions),
            this.ble.isConnected && this.ble.setLightPattern
                ? this._bleSafe(this.ble.setLightPattern(frames, repetitions), 'setLightPattern')
                : Promise.resolve()
        ]);
    }

    async moveTo(x, y, angle) {
        const blePromise = this.ble.isConnected
            ? this._bleSafe(this.ble.moveTo(x, y, angle), 'moveTo')
            : Promise.resolve(null);
        const [, bleResult] = await Promise.all([
            this.sim.moveTo(x, y, angle),
            blePromise
        ]);
        // Return BLE result when connected and succeeded; otherwise synthesize from sim
        return this.ble.isConnected && bleResult != null
            ? bleResult
            : { result: 0x00, resultStr: "Success" };
    }

    async getBattery() {
        if (this.ble.isConnected) {
            return await this.ble.getBattery();
        }
        return await this.sim.getBattery();
    }

    async speakText(text, language = 'ja', speakerId = 3) {
        try {
            return await this._speakWithVoiceVox(text, speakerId);
        } catch (error) {
            console.warn('[speakText] VOICEVOX unavailable, falling back to Web Speech API:', error.message);
            return await this._speakWithWebSpeechAPI(text, language);
        }
    }

    async _speakWithVoiceVox(text, speakerId = 3) {
        const voicevoxPort = Number(localStorage.getItem('voicevoxPort') || 50021);
        const baseUrl = `http://localhost:${voicevoxPort}`;

        const queryParams = new URLSearchParams({ text, speaker: speakerId });
        const queryResponse = await fetch(`${baseUrl}/audio_query?${queryParams}`, {
            method: 'POST',
        });

        if (!queryResponse.ok) {
            throw new Error(`VOICEVOX audio_query failed: ${queryResponse.status}`);
        }

        const audioQuery = await queryResponse.json();

        const synthResponse = await fetch(`${baseUrl}/synthesis?speaker=${speakerId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(audioQuery),
        });

        if (!synthResponse.ok) {
            throw new Error(`VOICEVOX synthesis failed: ${synthResponse.status}`);
        }

        const audioBlob = await synthResponse.blob();
        await this._playAudio(audioBlob);

        return {
            status: "success",
            text_length: text.length,
            engine: "voicevox",
            speaker_id: speakerId
        };
    }

    async _speakWithWebSpeechAPI(text, language = 'ja') {
        return new Promise((resolve, reject) => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = language === 'ja' ? 'ja-JP' : 'en-US';
            utterance.rate = 1.0;
            utterance.pitch = 1.0;

            utterance.onend = () => resolve({
                status: "success",
                text_length: text.length,
                language: language,
                engine: "web_speech_api"
            });
            utterance.onerror = (e) => reject(new Error(`Speech synthesis error: ${e.error}`));

            window.speechSynthesis.speak(utterance);
        });
    }

    async _playAudio(audioBlob) {
        return new Promise((resolve, reject) => {
            try {
                const audioUrl = URL.createObjectURL(audioBlob);
                const audio = new Audio(audioUrl);

                audio.onended = () => {
                    URL.revokeObjectURL(audioUrl);
                    resolve();
                };
                audio.onerror = (e) => {
                    URL.revokeObjectURL(audioUrl);
                    reject(new Error(`Audio playback error: ${e}`));
                };

                audio.play().catch(reject);
            } catch (error) {
                reject(error);
            }
        });
    }
}
