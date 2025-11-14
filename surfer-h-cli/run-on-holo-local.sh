#!/bin/bash
set -euo pipefail

echo "🚀 Starting Surfer H - Holo Model Run"
echo "======================================"

# Load environment variables using Python helper
eval "$(uv run python3 load_env.py HAI_API_KEY HAI_MODEL_URL HAI_MODEL_NAME)"
echo ""
uv sync --reinstall-package surfer-h-cli

# Default task/URL values (used only if not provided via environment)
DEFAULT_TASK="Inspect the website and come up with a list of concrete action plans to improve the UI. be extra detailed and specific in your recommendations."
DEFAULT_URL="http://localhost:5173/"

# Respect TASK/TARGET_URL env vars from callers (e.g., VS Code extension)
TASK="${TASK:-$DEFAULT_TASK}"
if [[ -n "${TARGET_URL:-}" ]]; then
  URL="$TARGET_URL"
else
  URL="${URL:-$DEFAULT_URL}"
fi



echo "🎯 Starting task: $TASK"
echo "🌐 Target URL: $URL"
echo "🤖 Model: $HAI_MODEL_NAME"
echo ""

# Sync dependencies
echo "📦 Syncing dependencies..."
uv sync

# Set up API keys for the run
export API_KEY_NAVIGATION="$HAI_API_KEY"
export API_KEY_LOCALIZATION="$HAI_API_KEY"

# Run the surfer-h-cli command
uv run surfer-h-cli \
    --task "$TASK" \
    --url "$URL" \
    --max_n_steps 30 \
    --base_url_localization "$HAI_MODEL_URL" \
    --model_name_localization "$HAI_MODEL_NAME" \
    --temperature_localization 0.7 \
    --base_url_navigation "$HAI_MODEL_URL" \
    --model_name_navigation "$HAI_MODEL_NAME" \
    --temperature_navigation 0.0
