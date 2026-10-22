/**
 * Express server for Strava OAuth token exchange.
 * Client secret never ships to the Vite SPA.
 */
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.STRAVA_PORT || '3001', 10);

const CLIENT_ID = process.env.STRAVA_CLIENT_ID || '';
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET || '';
const REDIRECT_URI =
  process.env.STRAVA_REDIRECT_URI || `http://localhost:${PORT}/api/strava/callback`;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

app.use(express.json());

app.get('/api/strava/auth', (_req, res) => {
  if (!CLIENT_ID) {
    res.status(500).send('STRAVA_CLIENT_ID is not configured');
    return;
  }
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:write,read'
  });
  res.redirect(`https://www.strava.com/oauth/authorize?${params.toString()}`);
});

app.get('/api/strava/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const error = typeof req.query.error === 'string' ? req.query.error : null;

  if (error || !code) {
    res.redirect(`${APP_URL}/?strava=error`);
    return;
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.status(500).send('Strava credentials are not configured');
    return;
  }

  try {
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      console.error('Strava token exchange failed:', detail);
      res.redirect(`${APP_URL}/?strava=error`);
      return;
    }

    const data = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_at: number;
    };

    // Pass tokens to SPA via hash fragment (not sent to server on subsequent nav)
    const hash = new URLSearchParams({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: String(data.expires_at)
    }).toString();

    res.redirect(`${APP_URL}/?strava=connected#${hash}`);
  } catch (err) {
    console.error('Strava callback error:', err);
    res.redirect(`${APP_URL}/?strava=error`);
  }
});

app.post('/api/strava/refresh', async (req, res) => {
  const refreshToken = req.body?.refresh_token;
  if (!refreshToken) {
    res.status(400).json({ error: 'refresh_token required' });
    return;
  }
  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.status(500).json({ error: 'Strava credentials are not configured' });
    return;
  }

  try {
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      res.status(tokenRes.status).json({ error: detail });
      return;
    }

    const data = await tokenRes.json();
    res.json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at
    });
  } catch (err) {
    console.error('Strava refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, stravaConfigured: !!(CLIENT_ID && CLIENT_SECRET) });
});

app.listen(PORT, () => {
  console.log(`Strava OAuth server listening on http://localhost:${PORT}`);
  console.log(`Redirect URI: ${REDIRECT_URI}`);
});
