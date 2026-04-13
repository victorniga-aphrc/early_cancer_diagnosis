FROM python:3.12-slim

# System deps for webrtcvad, psycopg, and general build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (layer cache)
# 1) Install torch CPU-only first (much smaller than the default CUDA bundle)
# 2) Then install the rest of the requirements
COPY requirements.txt .
RUN pip install --no-cache-dir --timeout 300 \
        torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir --timeout 300 \
        -r requirements.txt gunicorn

# Copy application code (model included in all-MiniLM-L6-v2/)
COPY . .

EXPOSE 5000

CMD ["gunicorn", \
     "--bind", "0.0.0.0:5000", \
     "--worker-class", "gthread", \
     "--workers", "2", \
     "--threads", "4", \
     "--timeout", "120", \
     "--certfile", "cert.pem", \
     "--keyfile", "cert.key", \
     "app:app"]
