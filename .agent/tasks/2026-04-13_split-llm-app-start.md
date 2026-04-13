# Task List: Split LLM and App Startup

- [x] 1. Create `task.md` and initialize tracking.
- [x] 2. Update frontend to support dynamic config:
  - [x] Add `<script src="js/config.js"></script>` to `index.html`.
  - [x] Modify `js/app.js` to read `window.APP_CONFIG.OLLAMA_URL`.
  - [x] Create a default `js/config.js`.
- [x] 3. Create `start-llm.ps1` and `start-llm.bat`.
  - [x] Expose `OLLAMA_HOST` and `OLLAMA_ORIGINS`.
  - [x] Add firewall rules for port 11434.
  - [x] Print IPv4 address for user.
- [x] 4. Create `start-app.ps1` and `start-app.bat`.
  - [x] Ask for LLM PC IP.
  - [x] Test HTTP connection to `http://<IP>:11434/api/tags`.
  - [x] Generate `js/config.js` dynamically on success.
  - [x] Start `npx serve`.
- [x] 5. Convert `start.ps1` and `start.bat` into a unified launcher menu.
- [x] 6. Copy plans/tasks to `.agent/tasks/` for persistence.
