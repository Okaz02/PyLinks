# PyLinks

PyLinksはブロック形式のpythonエディタです。
ブロック形式ですが、PyLinksはscratchのような自然言語ではなく
pythonの関数名をそのまま表示します。これによりPyLinksの書き出しコストを
ほぼ0にすることを可能にし、ブロック形式のような視覚的見やすさと直感的操作を
可能にしました。

## セットアップ

### macOS / Linux

```bash
./setup.sh
```

### Windows (PowerShell)

```powershell
.\setup.ps1
```

セットアップ後、仮想環境を有効化して起動します。

```bash
source .venv/bin/activate
python GUI.py
```

## Docker

pywebview はデスクトップ GUI アプリのため、コンテナ内で表示するにはホストの X サーバーへ接続する必要があります。

### Linux

```bash
xhost +local:docker
docker compose up --build
```

### macOS

[XQuartz](https://www.xquartz.org/) をインストールし、「ネットワーク経由のクライアントからの接続を許可」を有効にした上で:

```bash
xhost +localhost
DISPLAY=host.docker.internal:0 docker compose up --build
```

### 補足

- GUI を表示しない CLI/lint/test 用途であれば、X11 の設定なしで `docker compose run pylinks python -c "..."` のように利用できます。
- `docker-compose.yml` はカレントディレクトリをコンテナにマウントしているため、コード変更が即座に反映されます。
