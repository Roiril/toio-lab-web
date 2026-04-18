/**
 * .env.local を読み込んで js/config.js を生成するスクリプト
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env.local');
const configPath = path.join(root, 'js', 'config.js');

const env = {};

if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) env[match[1].trim()] = match[2].trim();
    });
} else {
    console.warn('[gen-config] .env.local が見つかりません。空の config.js を生成します。');
}

const content = `// .env.local から自動生成されたファイルです。git管理外。
window.APP_CONFIG = {
    OLLAMA_URL: "${env.OLLAMA_URL || 'http://localhost:11434'}",
    GEMINI_API_KEY: "${env.GEMINI_API_KEY || ''}",
    GEMINI_MODEL: "${env.GEMINI_MODEL || 'gemini-2.5-flash'}"
};
`;

fs.writeFileSync(configPath, content, 'utf8');
console.log('[gen-config] js/config.js を生成しました。');
