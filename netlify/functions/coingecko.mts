// Same-origin proxy for CoinGecko.
//
// Every visitor's browser would otherwise call api.coingecko.com directly and share the
// public per-IP budget with nothing; the 429s come back without CORS headers and look like
// network failures. Routing through this function means one upstream request per endpoint
// per minute for the whole site (CDN cache), an optional API key kept server-side, and
// proper 429 responses the client can back off from.
//
// Env (Netlify dashboard):
//   COINGECKO_API_KEY   optional demo or pro key
//   COINGECKO_API_PLAN  "pro" to use the pro host; anything else means the public host

const PLAN = process.env.COINGECKO_API_PLAN === 'pro' ? 'pro' : 'demo';
const UPSTREAM = PLAN === 'pro' ? 'https://pro-api.coingecko.com/api/v3' : 'https://api.coingecko.com/api/v3';

const ALLOWED_PATHS = [
  /^simple\/price$/,
  /^coins\/markets$/,
  /^coins\/[a-z0-9-]+$/,
  /^coins\/[a-z0-9-]+\/market_chart$/,
];

const CDN_CACHE = 'public, durable, s-maxage=60, stale-while-revalidate=300';
const BROWSER_CACHE = 'public, max-age=30';

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/coingecko\/?/, '');

  if (req.method !== 'GET' || !ALLOWED_PATHS.some((re) => re.test(path))) {
    return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  }

  const headers: Record<string, string> = { accept: 'application/json' };
  const key = process.env.COINGECKO_API_KEY;
  if (key) headers[PLAN === 'pro' ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key'] = key;

  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM}/${path}${url.search}`, { headers });
  } catch {
    return new Response(JSON.stringify({ error: 'CoinGecko unreachable' }), {
      status: 502,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const body = await upstream.text();
  const res = new Response(body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });

  if (upstream.ok) {
    res.headers.set('cache-control', BROWSER_CACHE);
    res.headers.set('netlify-cdn-cache-control', CDN_CACHE);
  } else {
    res.headers.set('cache-control', 'no-store');
    const retryAfter = upstream.headers.get('retry-after');
    if (retryAfter) res.headers.set('retry-after', retryAfter);
  }

  return res;
};

export const config = { path: '/api/coingecko/*' };
