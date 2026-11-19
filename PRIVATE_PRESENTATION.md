# Private Morph Mug Presentation

## Temporary presentation password

Until the Vercel environment variables are configured, the default password is:

```text
MorphMug2026
```

Change this on Vercel with environment variables:

- `MORPH_MUG_PRESENTATION_PASSWORD` — private presentation password
- `MORPH_MUG_SESSION_SECRET` — random long secret used for login sessions

After setting environment variables, redeploy the Vercel project.

## Private website behavior

- `/`, `/download`, `/official`, and browser API routes require presentation login
- Wokwi telemetry and control endpoints remain available through `X-Morph-Mug-Key`
- `/logout` ends the presentation session

## Recommended for a real customer deployment

Use a unique password and rotate it after the presentation. Do not publish the password publicly.
