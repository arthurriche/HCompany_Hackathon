# Surfer-H Local Feedback (Minimal)

This extension runs the Surfer-H CLI against your local dev server (e.g., `http://localhost:3000`) and writes a `feedback.md` report to your workspace root.

## Setup
1. Install your Surfer-H CLI repo somewhere on your machine.
2. In VS Code/Cursor settings, set:
   - **surferH.repoPath** → absolute path to the CLI repo.
   - **surferH.command** → command that launches the CLI (default assumes `run-on-holo.sh`).
   - **surferH.haiApiKey / modelName / modelUrl** if needed.
3. Run the command: **Surfer-H: Run Feedback on Localhost**.
4. Enter your port (e.g., 3000). The extension will spawn the CLI, capture a markdown slice from stdout, and save it to `feedback.md`.

## Notes
- The task template asks Surfer-H to print markdown between `=== FEEDBACK START ===` and `=== FEEDBACK END ===`. If your CLI produces different markers, tweak `defaultTask` or the markers in `extension.ts`.
- The CLI should launch a headless or controlled Chrome that can access `http://localhost:<port>`.
