class SessionMemory {
    constructor() {
        this.storageKey = 'toio_session_memory';
        this.memory = this._load();
    }

    _load() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (data) {
                const parsed = JSON.parse(data);
                if (!parsed.calibrations) parsed.calibrations = {};
                return parsed;
            }
        } catch (e) {
            console.error('Failed to load session memory', e);
        }
        return { summaries: [], facts: {}, calibrations: {} };
    }

    _save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.memory));
        } catch (e) {
            console.error('Failed to save session memory', e);
        }
    }

    addSummary(summary) {
        this.memory.summaries.push({ summary, timestamp: Date.now() });
        if (this.memory.summaries.length > 1) {
            this.memory.summaries.shift();
        }
        this._save();
    }

    getRecentSummary() {
        if (this.memory.summaries.length === 0) return null;
        return this.memory.summaries[this.memory.summaries.length - 1].summary;
    }

    saveFact(key, value) {
        this.memory.facts[key] = value;
        this._save();
    }

    getFacts() {
        return this.memory.facts;
    }

    /**
     * ユーザー語彙の校正辞書を記録する。
     * LLM が推論した「ちょっと=20mm」のようなマッピングを永続化する。
     */
    saveCalibration(word, meaning) {
        if (!word || !meaning) return;
        this.memory.calibrations[word] = {
            meaning,
            timestamp: Date.now()
        };
        this._save();
    }

    getCalibrations() {
        return this.memory.calibrations || {};
    }

    removeCalibration(word) {
        if (!this.memory.calibrations) return;
        delete this.memory.calibrations[word];
        this._save();
    }

    buildContextString() {
        const parts = [];
        const summary = this.getRecentSummary();
        if (summary) {
            parts.push(`前回のセッションの要約: ${summary}`);
        }

        const facts = Object.entries(this.memory.facts);
        if (facts.length > 0) {
            parts.push(`永続的な記憶（ファクト）:`);
            facts.forEach(([key, value]) => {
                parts.push(`- ${key}: ${value}`);
            });
        }

        const calibrations = Object.entries(this.memory.calibrations || {});
        if (calibrations.length > 0) {
            parts.push(`ユーザー語彙の校正辞書（優先して解釈に使うこと）:`);
            calibrations.forEach(([word, entry]) => {
                parts.push(`- 「${word}」 → ${entry.meaning}`);
            });
        }

        return parts.length > 0 ? `## 記憶\n${parts.join('\n')}` : "";
    }

    clear() {
        this.memory = { summaries: [], facts: {}, calibrations: {} };
        this._save();
    }
}
