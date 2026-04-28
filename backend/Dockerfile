FROM python:3.10-slim

# Install system dependencies for video/audio processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libchromaprint-tools \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create data directory (used as fallback or temporary storage)
RUN mkdir -p data

# Expose port
EXPOSE 8080

# Start FastAPI server (Cloud Run provides PORT)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
