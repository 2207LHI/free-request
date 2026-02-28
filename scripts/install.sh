#!/usr/bin/env bash
set -euo pipefail

VSIX_URL="https://github.com/WangChengXiang-carizon/free-request/releases/download/v0.0.5/free-request-0.0.5.vsix"
VSIX_NAME="free-request-0.0.5.vsix"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
VSIX_PATH="$TMP_DIR/$VSIX_NAME"

find_code_cmd() {
  if command -v code >/dev/null 2>&1; then
    echo "code"
    return 0
  fi

  if command -v code-insiders >/dev/null 2>&1; then
    echo "code-insiders"
    return 0
  fi

  if [[ -x "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" ]]; then
    echo "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
    return 0
  fi

  if [[ -x "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code" ]]; then
    echo "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code"
    return 0
  fi

  for path in \
    "/usr/bin/code" \
    "/usr/local/bin/code" \
    "/snap/bin/code" \
    "/var/lib/flatpak/exports/bin/com.visualstudio.code" \
    "$HOME/.local/share/flatpak/exports/bin/com.visualstudio.code"
  do
    if [[ -x "$path" ]]; then
      echo "$path"
      return 0
    fi
  done

  return 1
}

echo "Downloading VSIX..."
curl -fL "$VSIX_URL" -o "$VSIX_PATH"

if ! CODE_CMD="$(find_code_cmd)"; then
  echo "❌ VS Code CLI not found."
  echo "macOS: run 'Shell Command: Install \"code\" command in PATH' in VS Code command palette."
  echo "Linux: ensure VS Code is installed and 'code' is available in PATH."
  exit 1
fi

echo "Using CLI: $CODE_CMD"
echo "Installing extension..."
"$CODE_CMD" --install-extension "$VSIX_PATH" --force

echo "✅ Installed: $VSIX_NAME"
