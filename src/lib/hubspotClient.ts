/**
 * HubSpot API client wrapper.
 * - Auto-injects Authorization header with fresh token
 * - Retries on 429 with exponential backoff
 * - Generic paginated fetcher for CRM list endpoints
 */
import axios, { AxiosInstance } from 'axios';
import { getValidAccessToken } from '../services/hubspotOAuth';
import { logger } from './logger';

const BASE_URL = 'https://api.hubapi.com';
const MAX_RETRIES = 4;
const INITIAL_BACKOFF_MS = 1000;

export function createHubSpotClient(portalId: number): AxiosInstance {
  const client = axios.create({ baseURL: BASE_URL });

  // Inject fresh access token before every request
  client.interceptors.request.use(async (config) => {
    const token = await getValidAccessToken(portalId);
    config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  // Retry on 429 and transient 5xx
  client.interceptors.response.use(
    (res) => res,
    async (error) => {
      const config = error.config as any;
      config._retryCount = config._retryCount ?? 0;

      const status = error.response?.status;
      const shouldRetry =
        config._retryCount < MAX_RETRIES && (status === 429 || (status >= 500 && status < 600));

      if (!shouldRetry) return Promise.reject(error);

      config._retryCount += 1;
      const retryAfterMs =
        parseInt(error.response?.headers['retry-after'] ?? '0', 10) * 1000 ||
        INITIAL_BACKOFF_MS * Math.pow(2, config._retryCount - 1);

      logger.warn('Rate limited — retrying', {
        portalId,
        attempt: config._retryCount,
        waitMs: retryAfterMs,
        url: config.url,
      });

      await new Promise((r) => setTimeout(r, retryAfterMs));
      return client(config);
    },
  );

  return client;
}

/**
 * Fetches all pages from a HubSpot CRM v3 list endpoint.
 * Handles cursor-based pagination automatically.
 */
export async function fetchAllPages<T>(
  client: AxiosInstance,
  url: string,
  params: Record<string, any> = {},
  pageSize = 100,
): Promise<T[]> {
  const results: T[] = [];
  let after: string | undefined;

  do {
    const { data } = await client.get(url, {
      params: { ...params, limit: pageSize, ...(after ? { after } : {}) },
    });

    if (data.results?.length) results.push(...data.results);
    after = data.paging?.next?.after;
  } while (after);

  return results;
}