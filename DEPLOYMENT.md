# Deploying Digital Asset Protection to Google Cloud

The project is fully configured for deployment on Google Cloud Run with a persistent PostgreSQL database (Cloud SQL) and Google Cloud Storage for media files.

## Architecture on Google Cloud
- **Frontend**: Google Cloud Run (Node.js container)
- **Backend**: Google Cloud Run (Python container)
- **Database**: Cloud SQL (PostgreSQL)
- **Storage**: Google Cloud Storage (video files, frames, audio fingerprints)

## Prerequisites
1. Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)
2. Login: `gcloud auth login`
3. Set your project: `gcloud config set project YOUR_PROJECT_ID`
4. Enable necessary APIs:
   ```bash
   gcloud services enable run.googleapis.com sqladmin.googleapis.com \
     cloudbuild.googleapis.com containerregistry.googleapis.com \
     storage.googleapis.com
   ```

---

## Step 1: Set up the PostgreSQL Database

1. Create a Cloud SQL instance:
   ```bash
   gcloud sql instances create dap-db-instance \
     --database-version=POSTGRES_15 \
     --tier=db-f1-micro \
     --region=us-central1
   ```
2. Create the database:
   ```bash
   gcloud sql databases create digital_asset_db --instance=dap-db-instance
   ```
3. Create a database user and set a password:
   ```bash
   gcloud sql users create dap_user \
     --instance=dap-db-instance \
     --password=YOUR_SECURE_PASSWORD
   ```
4. Get the connection name for the instance:
   ```bash
   gcloud sql instances describe dap-db-instance --format="value(connectionName)"
   ```
   *(It will look like `YOUR_PROJECT_ID:us-central1:dap-db-instance`)*

---

## Step 2: Set up Google Cloud Storage

1. Create a GCS bucket for storing video files and fingerprints:
   ```bash
   gsutil mb -l us-central1 gs://YOUR_PROJECT_ID-dap-assets
   ```

2. Set lifecycle rules to auto-delete temporary download files after 1 day:
   ```bash
   cat > /tmp/lifecycle.json << 'EOF'
   {
     "rule": [{
       "action": {"type": "Delete"},
       "condition": {"age": 1, "matchesPrefix": ["downloads/"]}
     }]
   }
   EOF
   gsutil lifecycle set /tmp/lifecycle.json gs://YOUR_PROJECT_ID-dap-assets
   ```

3. The Cloud Run service account has GCS access by default. No additional credentials needed when deploying on GCP.

---

## Step 3: Deploy the Backend

1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Deploy to Cloud Run. The backend needs to connect to the Cloud SQL instance using the Cloud SQL Auth proxy (built into Cloud Run).
   ```bash
   gcloud run deploy dap-backend \
     --source . \
     --region us-central1 \
     --allow-unauthenticated \
     --memory 2Gi \
     --max-instances 2 \
     --timeout 300 \
     --add-cloudsql-instances YOUR_PROJECT_ID:us-central1:dap-db-instance \
     --set-env-vars="YOUTUBE_API_KEY=your_youtube_key,GEMINI_API_KEY=your_gemini_key,DATABASE_URL=postgresql://dap_user:YOUR_SECURE_PASSWORD@/digital_asset_db?host=/cloudsql/YOUR_PROJECT_ID:us-central1:dap-db-instance,GCS_BUCKET_NAME=YOUR_PROJECT_ID-dap-assets,CORS_ORIGINS=https://dap-frontend-xxxxx-uc.a.run.app"
   ```
3. Once deployed, note the **Backend Service URL** provided in the terminal output.

---

## Step 4: Deploy the Frontend

1. Navigate to the `frontend/` directory:
   ```bash
   cd ../frontend
   ```
2. Deploy to Cloud Run, passing the Backend URL as a build argument:
   ```bash
   gcloud run deploy dap-frontend \
     --source . \
     --region us-central1 \
     --allow-unauthenticated \
     --set-build-env-vars="NEXT_PUBLIC_API_URL=https://dap-backend-xxxxx-uc.a.run.app"
   ```
3. Once deployed, you will get the **Frontend Service URL**. Visit this URL in your browser to see your live dashboard!

---

## Step 5: Update Backend CORS

After getting the frontend URL, update the backend CORS origins:
```bash
gcloud run services update dap-backend \
  --region us-central1 \
  --update-env-vars="CORS_ORIGINS=https://dap-frontend-xxxxx-uc.a.run.app"
```

---

## Post-Deployment Validation

1. Visit your frontend URL.
2. The UI should load with the System Health panel showing all green statuses.
3. Try registering a sample asset. It should upload and process correctly, saving data to your Cloud SQL database and uploading media to GCS.
4. Try running a scan. The WebSocket connection should function, and you should see real-time updates as the backend searches YouTube.
5. Check the `/health` endpoint on your backend URL — it should show all dependencies as "connected"/"available".

---

## Environment Variables Reference

### Backend
| Variable | Required | Description |
|----------|----------|-------------|
| `YOUTUBE_API_KEY` | Yes | YouTube Data API v3 key |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `DATABASE_URL` | No | PostgreSQL connection string (falls back to SQLite) |
| `GCS_BUCKET_NAME` | No | GCS bucket name for cloud storage (falls back to local) |
| `CORS_ORIGINS` | No | Comma-separated allowed origins for CORS |
| `GOOGLE_APPLICATION_CREDENTIALS` | No | Path to GCS service account JSON (auto in Cloud Run) |

### Frontend
| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Backend API URL (default: `http://localhost:8000`) |
