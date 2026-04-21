#!/bin/bash
# Test if system prompt is correctly applied

PROMPT_FILE="prompts/claude-code-system.txt"

if [ ! -f "$PROMPT_FILE" ]; then
  echo "❌ Prompt file not found: $PROMPT_FILE"
  exit 1
fi

PROMPT_CONTENT=$(cat "$PROMPT_FILE")
PROMPT_BYTES=${#PROMPT_CONTENT}

echo "[Test] System prompt file: $PROMPT_FILE"
echo "[Test] File size: $PROMPT_BYTES bytes"
echo "[Test] First 100 chars:"
head -c 100 "$PROMPT_FILE"
echo ""
echo ""
echo "[Test] Testing if claude command recognizes system prompt:"

# Test if claude command is available
if ! command -v claude &> /dev/null; then
  echo "❌ claude CLI not found in PATH"
  echo "[Test] Please install: npm install -g @anthropic-ai/claude"
  exit 1
fi

echo "[Test] ✅ claude CLI found"

# Test if .mcp.json is readable
if [ ! -f ".mcp.json" ]; then
  echo "❌ .mcp.json not found"
  exit 1
fi

echo "[Test] ✅ .mcp.json found"
echo "[Test] MCP configuration:"
cat .mcp.json | head -10

echo ""
echo "[Test] Testing claude with system prompt:"
# Create a test input
TEST_INPUT='{"type":"user","message":{"role":"user","content":"前に進んで"}}'
echo "[Test] Input: $TEST_INPUT"
echo "[Test] Running: echo ... | claude -p --append-system-prompt ... --model claude-haiku-4-5-20251001"

# Run claude with system prompt
echo "$TEST_INPUT" | timeout 15 claude -p \
  --input-format stream-json \
  --output-format stream-json \
  --verbose \
  --append-system-prompt "$PROMPT_CONTENT" \
  --model claude-haiku-4-5-20251001 2>&1 | head -30

echo ""
echo "[Test] Test completed"
