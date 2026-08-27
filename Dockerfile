FROM python:3.11-slim

# pywebview の GTK バックエンドに必要なパッケージ
# (argostranslate のビルドに必要な build-essential も含む)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-gi \
    python3-gi-cairo \
    gir1.2-gtk-3.0 \
    gir1.2-webkit2-4.1 \
    libgirepository1.0-dev \
    libcairo2-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# ホストの X サーバーに接続してウィンドウを表示する
ENV DISPLAY=:0

CMD ["python", "GUI.py"]
