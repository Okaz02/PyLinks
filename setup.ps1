# PyLinks セットアップスクリプト (Windows PowerShell)
$ErrorActionPreference = "Stop"

Set-Location -Path $PSScriptRoot

$VenvDir = ".venv"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "python が見つかりません。Python 3.10 以上をインストールしてください。"
    exit 1
}

if (-not (Test-Path $VenvDir)) {
    Write-Host "==> 仮想環境を作成しています ($VenvDir)"
    python -m venv $VenvDir
} else {
    Write-Host "==> 既存の仮想環境を再利用します ($VenvDir)"
}

$ActivateScript = Join-Path $VenvDir "Scripts\Activate.ps1"
. $ActivateScript

Write-Host "==> pip を更新しています"
python -m pip install --upgrade pip

Write-Host "==> 依存パッケージをインストールしています"
pip install -r requirements.txt

Write-Host ""
Write-Host "セットアップが完了しました。"
Write-Host "アプリを起動するには:"
Write-Host "  $ActivateScript"
Write-Host "  python GUI.py"
