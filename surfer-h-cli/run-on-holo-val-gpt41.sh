 #!/bin/bash
set -euo pipefail

echo "🚀 Starting Surfer H - Holo1 Model Run with GPT-4o Validation"
echo "=============================================================="

# Load environment variables using Python helper
eval "$(uv run python3 load_env.py HAI_API_KEY HAI_MODEL_URL HAI_MODEL_NAME OPENAI_API_KEY)"
echo ""

# Sync dependencies
echo "📦 Syncing dependencies..."
uv sync

# Set up API keys for the run
export API_KEY_LOCALIZATION="$HAI_API_KEY"
export API_KEY_NAVIGATION="$HAI_API_KEY"

# Ensure the Surfer H sources are importable even when .pth files are skipped
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_EXTRA_PATHS=(
  "$SCRIPT_DIR/src"
  "$SCRIPT_DIR"
)
for extra_path in "${PYTHON_EXTRA_PATHS[@]}"; do
  case ":${PYTHONPATH:-}:" in
    *":$extra_path:"*) ;;
    *)
      if [[ -z "${PYTHONPATH:-}" ]]; then
        PYTHONPATH="$extra_path"
      else
        PYTHONPATH="$PYTHONPATH:$extra_path"
      fi
      ;;
  esac
done
export PYTHONPATH

# Task configuration
DEFAULT_TASK="Explore H Company's website to discover their recent blog posts, click on the latest post and read to the bottom of the page. Summarize the interesting findings and explain why they're significant for the AI and automation industry."
DEFAULT_URL="https://www.hcompany.ai"

TASK="${TASK:-$DEFAULT_TASK}"
if [[ -n "${TARGET_URL:-}" ]]; then
  URL="$TARGET_URL"
else
  URL="${URL:-$DEFAULT_URL}"
fi

echo "🌐 Target URL: $URL"
echo "🤖 Model: $HAI_MODEL_NAME"
echo "🤖 Model URL: $HAI_MODEL_URL"
echo "✅ Validation: GPT-4.1 enabled"
echo ""

# Run the surfer-h-cli command
uv run surfer-h-cli \
    --task "$TASK" \
    --url "$URL" \
    --max_n_steps 30 \
    --base_url_localization "$HAI_MODEL_URL" \
    --model_name_localization "$HAI_MODEL_NAME" \
    --temperature_localization 0.0 \
    --base_url_navigation "$HAI_MODEL_URL" \
    --model_name_navigation "$HAI_MODEL_NAME" \
    --temperature_navigation 0.7 \
    --use_validator \
    --model_name_validation gpt-4.1-2025-04-14 \
    --temperature_validation 0.0 \
    "$@"
