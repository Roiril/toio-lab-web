class SessionMemory {
    constructor() {
        this.storageKey = 'toio_session_memory';
        this.memory = this._load();
    }

    _load() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            console.error('Failed to load session memory', e);
        }
        return { summaries: [], facts: {} };
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
        // Keep only the most recent summary to save tokens
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
        
        return parts.length > 0 ? `## 記憶\n${parts.join('\n')}` : "";
    }

    clear() {
        this.memory = { summaries: [], facts: {} };
        this._save();
    }
}
