# Deploy Aether TempMate to Google

This project is ready for Google Cloud Run or Google App Engine deployment.

## Option 1: Google App Engine

1. Install Google Cloud SDK.
2. Log in:
   ```bash
   gcloud auth login
   ```
3. Set your project:
   ```bash
   gcloud config set project YOUR_PROJECT_ID
   ```
4. Deploy:
   ```bash
   gcloud app deploy
   ```
5. Open the generated app URL, for example:
   ```text
   https://YOUR_PROJECT_ID.uc.r.appspot.com
   ```

## Option 2: Google Cloud Run

1. Build the container:
   ```bash
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/aether-tempmate
   ```
2. Deploy:
   ```bash
   gcloud run deploy aether-tempmate --image gcr.io/YOUR_PROJECT_ID/aether-tempmate --platform managed --region us-central1 --allow-unauthenticated
   ```
3. Copy the public URL returned by Google.

## App URL format

After deployment, your public Google URL will look like:
```text
https://YOUR_PROJECT_ID.uc.r.appspot.com
```

or
```text
https://aether-tempmate-xxxxx-uc.a.run.app
```

## Important note

I cannot create a live Google public link from this machine because it requires access to your Google Cloud project and credentials.
