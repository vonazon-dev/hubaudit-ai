/**
 * HubSpot OAuth2 service.
 * Handles: authorization URL, code exchange, token refresh, portal info.
 */
import axios from 'axios';
import { HubSpotTokens } from '../types';
import { tokenStore } from '../lib/tokenStore';
import { logger } from '../lib/logger';

const HS_TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token';
const HS_PORTAL_URL = 'https://api.hubapi.com/oauth/v1/access-tokens';

function getCredentials() {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  const baseUrl = process.env.APP_BASE_URL;

  if (!clientId || !clientSecret || !baseUrl) {
    throw new Error('Missing HUBSPOT_CLIENT_ID, HUBSPOT_CLIENT_SECRET, or APP_BASE_URL');
  }
  return { clientId, clientSecret, redirectUri: `${baseUrl.replace(/\/$/, '')}/oauth/callback` };
}

export function buildAuthUrl(csrfToken: string): string {
  const { clientId, redirectUri } = getCredentials();
  const scopes = (process.env.HUBSPOT_SCOPES ?? '').split(' ').join('%20');
  return (
    `https://app.hubspot.com/oauth/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${scopes}` +
    `&state=${encodeURIComponent(csrfToken)}`
  );
}

export async function exchangeCode(code: string): Promise<HubSpotTokens> {
  const { clientId, clientSecret, redirectUri } = getCredentials();

  const { data } = await axios.post(
    HS_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );

  // Fetch portal ID from token info endpoint
  const { data: tokenInfo } = await axios.get(`${HS_PORTAL_URL}/${data.access_token}`);

  const tokens: HubSpotTokens = {
    portalId: tokenInfo.hub_id,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };

  await tokenStore.save(tokens);
  logger.info('OAuth exchange complete', { portalId: tokens.portalId });
  return tokens;
}

export async function refreshTokens(portalId: number): Promise<HubSpotTokens> {
  const existing = await tokenStore.get(portalId);
  if (!existing) throw new Error(`No tokens found for portal ${portalId}`);

  const { clientId, clientSecret } = getCredentials();

  const { data } = await axios.post(
    HS_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: existing.refreshToken,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );

  const updated: HubSpotTokens = {
    ...existing,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? existing.refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };

  await tokenStore.save(updated);
  logger.info('Tokens refreshed', { portalId });
  return updated;
}

/**
 * Returns a valid access token, refreshing automatically if within 5 minutes of expiry.
 */
export async function getValidAccessToken(portalId: number): Promise<string> {
  let tokens = await tokenStore.get(portalId);
  if (!tokens) throw new Error(`Portal ${portalId} not connected`);

  const fiveMinutes = 5 * 60 * 1000;
  if (tokens.expiresAt.getTime() - Date.now() < fiveMinutes) {
    tokens = await refreshTokens(portalId);
  }

  return tokens.accessToken;
}
