# 🛡 Digital Asset Protection Platform (v4.0)

> **Protecting the Integrity of Digital Sports Media.**

A comprehensive, enterprise-grade Digital Asset Protection platform that identifies, tracks, and flags unauthorized use of proprietary sports media across the internet. By leveraging **Gemini AI**, advanced perceptual hashing (pHash), and audio fingerprinting (Chromaprint), the platform proactively authenticates digital assets and detects anomalies in content propagation in near real-time.

---

## 📖 Table of Contents
1. [The Problem & The Solution](#-the-problem--the-solution)
2. [End-to-End Workflow](#-end-to-end-workflow)
3. [System Architecture](#-system-architecture)
4. [Core Features (The 9 Pillars)](#-core-features-the-9-pillars)
5. [How The Matching Engine Works](#-how-the-matching-engine-works)
6. [Tech Stack](#-tech-stack)
7. [Database Schema](#-database-schema)
8. [Local Development Setup](#-local-development-setup)
9. [Google Cloud Deployment](#-google-cloud-deployment)
10. [API Reference](#-api-reference)

---

## 🎯 The Problem & The Solution

**The Problem:** Sports organizations generate massive volumes of high-value digital media that rapidly scatter across global platforms. This vast visibility gap leaves proprietary content highly vulnerable to widespread digital misappropriation, unauthorized redistribution, and intellectual property violations.

**The Solution:** An automated pipeline that ingests official source video, generates a cryptographic and perceptual fingerprint, actively scans the internet (starting with YouTube) using AI-generated search heuristics, downloads suspected matches, compares them frame-by-frame, and aggregates findings into a premium risk-scoring dashboard with automated DMCA capabilities.

---

## 🔄 End-to-End Workflow

The following diagram illustrates the complete lifecycle of an asset from upload to takedown:

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant GCS as Cloud Storage
    participant Gemini AI
    participant YouTube API
    participant DB as PostgreSQL

    %% Asset Registration Phase
    User->>Frontend: Uploads official MP4 video
    Frontend->>Backend: POST /assets/register
    Backend->>Backend: Extract frames (FFmpeg) & Audio
    Backend->>Backend: Generate pHash & Chromaprint
    Backend->>GCS: Upload video + frames + audio
    Backend->>DB: Save Asset Fingerprint + Certificate
    Backend-->>Frontend: 200 OK + Certificate Hash

    %% Monitoring Phase
    User->>Frontend: Triggers manual scan (or Cron triggers)
    Frontend->>Backend: POST /assets/{id}/scan
    Backend->>Gemini AI: Provide asset title, request search queries
    Gemini AI-->>Backend: Returns 5 smart search queries
    Backend->>YouTube API: Search using queries
    YouTube API-->>Backend: Return top matching videos

    %% Processing & Matching Phase
    loop For each suspected video
        Backend->>Backend: Download sample via yt-dlp
        Backend->>Backend: Extract pHash & Chromaprint
        Backend->>Backend: Compare against original fingerprint
        alt Confidence > Threshold
            Backend->>Gemini AI: Classify violation (Meme/Highlight/News)
            Gemini AI-->>Backend: Classification Result
            Backend->>DB: Save Violation & Update Channel Risk
        end
    end

    %% Resolution Phase
    Backend-->>Frontend: WebSocket Broadcast (matches found)
    Frontend->>User: Update UI (Violations Dashboard)
    User->>Frontend: Review side-by-side comparison
    User->>Frontend: Generate DMCA
    Frontend->>Backend: POST /violations/{id}/takedown
    Backend->>Gemini AI: Generate Legal Notice
    Gemini AI-->>Backend: Formatted Legal Text
    Backend-->>Frontend: Display DMCA Text
```

---

## 🏗 System Architecture

The application is built on a microservice-inspired monolithic architecture, highly decoupled for future scalability.

```mermaid
graph TD
    subgraph Client Layer
        UI[Next.js 15 Frontend]
        WS[WebSocket Client]
    end

    subgraph API Layer - FastAPI
        Router[API Routers]
        WSServer[WebSocket Manager]
        Scheduler[Background Task Scheduler]
    end

    subgraph Intelligence & Processing Layer
        Match[Matching Engine]
        VideoProc[Video Processor - FFmpeg]
        YT[YouTube Scraper - yt-dlp]
        Gemini[Google Gemini API]
    end

    subgraph Data Layer
        DB[(PostgreSQL / SQLite)]
        GCS[Google Cloud Storage]
    end

    UI <-->|HTTP/REST| Router
    UI <-->|WebSocket| WSServer

    Router --> Match
    Router --> VideoProc
    Router --> Scheduler

    Match --> VideoProc
    VideoProc --> GCS

    Scheduler --> YT
    Scheduler --> Gemini
    Match --> Gemini

    Router --> DB
    Match --> DB
    Scheduler --> DB
```

---

## ⭐ Core Features (The 9 Pillars)

This platform implements 9 premium features designed for enterprise-grade asset protection:

1. **Gemini Anomaly Detection**: AI actively analyzes propagation patterns over time, flagging suspicious spikes, identifying bot networks, and providing executive threat assessments.
2. **DMCA Takedown Generator**: Auto-generates professional, legally sound takedown notice PDFs/texts using Gemini, pulling in exact timestamps, channel details, and infringement data.
3. **Side-by-Side Visual Comparison**: Provides irrefutable proof by visually comparing the structural frame count, audio hashes, and perceptual similarity percentages of the original vs. pirated content.
4. **Digital Authentication Certificate**: Upon registration, generates a verifiable SHA-256 fingerprint certificate (incorporating pHash and Chromaprint data) to proactively authenticate digital assets.
5. **Scheduled Auto-Monitoring**: Built-in background thread scheduler allows for periodic, automated scanning (every 6h, 12h, 24h, 48h) for true "set and forget" protection.
6. **WebSocket Live Updates**: Real-time scan progress, query execution logs, and violation alerts are pushed directly to the UI without requiring page refreshes.
7. **CSV Export Reports**: 1-click export of violation data into CSV format for ingestion into enterprise legal systems or BI tools.
8. **Confidence Threshold Tuning**: Allows users to adjust matching sensitivity per asset via a UI slider (e.g., Strict 100% vs Sensitive 0%) to minimize false positives on a case-by-case basis.
9. **Multi-factor Channel Risk Scoring**: Tracks repeat offenders across scans. An automated database-level scoring system escalates channels from Low → Medium → High → Critical risk based on their historical infringement rates.

### Bonus Features (v4.0)

10. **☁️ Google Cloud Storage**: Automatic cloud upload of registered assets (video, frames, audio) with graceful local fallback.
11. **🚀 Batch Scan All**: One-click scan of all registered assets simultaneously with parallel background processing.
12. **📄 Asset Detail Page**: Dedicated deep-dive page per asset showing violations, scan history, fingerprint data, and certificate.
13. **🏥 System Health Dashboard**: Real-time health monitoring of all dependencies (DB, FFmpeg, fpcalc, GCS) on the dashboard.
14. **📱 Responsive Mobile UI**: Mobile-friendly sidebar with hamburger menu and responsive grid layouts.

---

## 🔬 How The Matching Engine Works

The core of the platform is the local matching engine. It does not rely on third-party APIs for similarity comparison; it computes cryptographic differences locally.

1. **Visual Processing (pHash)**:
   - Uses `FFmpeg` to extract frames from the video at regular intervals.
   - Converts frames to grayscale, reduces size to 32x32, computes the Discrete Cosine Transform (DCT), and generates a 64-bit perceptual hash (pHash).
   - *Why pHash?* Unlike MD5 or SHA, perceptual hashing survives video compression, cropping, watermarking, and minor color grading.

2. **Audio Processing (Chromaprint)**:
   - Extracts the audio track as a WAV file.
   - Uses `fpcalc` (Chromaprint) to generate an acoustic fingerprint.
   - *Why Chromaprint?* It is highly resilient to background noise, pitch shifting, and compression artifacts.

3. **Scoring Engine**:
   - The engine calculates the **Hamming Distance** between the source pHash array and the suspected video's pHash array.
   - Visual and audio similarities are weighted to produce an overall **Confidence Score (0% to 100%)**.

---

## 💻 Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, Vanilla CSS (Premium Glassmorphism Dark Theme), Axios.
- **Backend**: Python 3.10+, FastAPI, Uvicorn, Websockets.
- **Database**: PostgreSQL (Production) with SQLite fallback (Local Dev). Uses `psycopg2-binary`.
- **AI Intelligence**: Google Gemini API (`gemini-2.0-flash`).
- **Media Processing**: `FFmpeg`, `imagehash` (Python), `pyacoustid` (Chromaprint/fpcalc), `yt-dlp`.
- **Cloud Storage**: Google Cloud Storage (`google-cloud-storage`).
- **External APIs**: YouTube Data API v3.

---

## 🗄 Database Schema

The persistent state is managed across 6 core tables in PostgreSQL:

- `assets`: Stores registered source media, raw pHashes, and certificate checksums.
- `scans`: Audit log of all manual and scheduled scans, tracking YouTube API queries.
- `violations`: Detected matches, similarity scores, DMCA status workflow (detected → confirmed → takedown).
- `propagation_events`: Time-series data tracking when and where content appeared.
- `channel_risk`: Tracks external entities (YouTube channels), calculating a dynamic risk score based on repeat offenses.
- `scheduled_monitors`: Cron-like configuration table for background scanning intervals.

---

## 🚀 Local Development Setup

### 1. System Requirements
- Node.js 18+
- Python 3.9+
- `ffmpeg` installed (`brew install ffmpeg` or `apt-get install ffmpeg`)
- `fpcalc` installed (`brew install chromaprint` or `apt-get install libchromaprint-tools`)

### 2. Backend Setup
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create .env file (copy from example and fill in your keys)
cp .env.example .env
# Edit .env with your YOUTUBE_API_KEY and GEMINI_API_KEY

# Run the server (Defaults to SQLite if DATABASE_URL is empty)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:3000`.

### 4. Full Stack with Docker Compose + PostgreSQL
```bash
docker compose up --build
```

This local Compose setup now starts:
- `postgres` on `localhost:5432`
- `backend` on `localhost:8000`
- `frontend` on `localhost:3000`

The backend is wired to PostgreSQL automatically inside Compose with:
```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/digital_asset_db
```

The frontend is built with `NEXT_PUBLIC_API_URL=http://localhost:8000`, so browser requests and WebSocket connections resolve correctly from your machine.

---

## ☁️ Google Cloud Deployment

The application is containerized and ready for Google Cloud Run with a persistent Cloud SQL PostgreSQL database and Google Cloud Storage for media files. For a detailed, step-by-step guide, please refer to the [DEPLOYMENT.md](DEPLOYMENT.md) file.

**High-Level Steps:**
1. Create a Google Cloud SQL PostgreSQL instance.
2. Create a Google Cloud Storage bucket for media files.
3. Deploy the Backend Docker container to Cloud Run, injecting `DATABASE_URL`, `GCS_BUCKET_NAME`, `YOUTUBE_API_KEY`, `GEMINI_API_KEY`, and `CORS_ORIGINS`.
4. Deploy the Frontend Docker container to Cloud Run, injecting the `NEXT_PUBLIC_API_URL` pointing to the backend.

---

## 📚 API Reference

The FastAPI backend automatically generates Swagger UI documentation.
When the backend is running, visit: `http://localhost:8000/docs`

### Key Endpoints:
- **`POST /assets/register`**: Uploads file, extracts fingerprints, uploads to GCS, returns certificate.
- **`POST /assets/{id}/scan`**: Triggers the search-download-match pipeline for a single asset.
- **`POST /assets/scan-all`**: Batch scans all registered assets simultaneously.
- **`GET /assets/{id}`**: Returns full asset details with scans and violations.
- **`GET /analytics/dashboard`**: Aggregates platform-wide risk metrics.
- **`GET /analytics/anomalies`**: Triggers Gemini to analyze the DB for threat patterns.
- **`POST /violations/{id}/takedown`**: Auto-generates the DMCA notice.
- **`GET /health`**: System health with dependency status (DB, FFmpeg, fpcalc, GCS).
- **`GET /ws`**: WebSocket endpoint for live log streaming.

---
*Built to protect the digital future of sports media.*
