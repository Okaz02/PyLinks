#!/usr/bin/env bash
# PyLinks セットアップスクリプト (macOS / Linux)
set -euo pipefail

cd "$(dirname "$0")"

PYTHON_BIN="${PYTHON_BIN:-python3}"
VENV_DIR=".venv"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "エラー: $PYTHON_BIN が見つかりません。Python 3.10 以上をインストールしてください。" >&2
  exit 1
fi

if [ ! -d "$VENV_DIR" ]; then
  echo "==> 仮想環境を作成しています ($VENV_DIR)"
  "$PYTHON_BIN" -m venv "$VENV_DIR"
else
  echo "==> 既存の仮想環境を再利用します ($VENV_DIR)"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

echo "==> pip を更新しています"
pip install --upgrade pip

echo "==> 依存パッケージをインストールしています"
pip install -r requirements.txt

echo ""
echo "セットアップが完了しました。"
echo "アプリを起動するには:"
echo "  source $VENV_DIR/bin/activate"
echo "  python GUI.py"
