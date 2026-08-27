# PyLinks

PyLinksはブロック形式のpythonエディタです。
ブロック形式ですが、PyLinksはscratchのような自然言語ではなく
pythonの関数名をそのまま表示します。これによりPyLinksの書き出しコストを
ほぼ0にすることを可能にし、ブロック形式のような視覚的見やすさと直感的操作を
可能にしました。
（なおPyLinksはまだアルファ版にも届かない開発バージョンです）

## TODO
- [x] ブロックjson読み込みのパース
- [x] ライブラリチェック
- [x] 関数検索のtoolsBox
- [ ] ブロックの組み合わせを内部でブロックパレットで保持
- [ ] 自由なウィンドウ配置
- [ ] よく使用する順の関数検索
- [ ] 関数のラベル付け
- [ ] 生のテキストコードをウィンドウで表示
- [ ] python以外の多言語に対応
- [ ] リリース

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

- `docker-compose.yml` はカレントディレクトリをコンテナにマウントしているため、コード変更が即座に反映されます。
