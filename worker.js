// Calcupine on Cloudflare: serves the static site from docs/, plus one tiny endpoint.
// GET /api/geo -> {"country":"GB"} from Cloudflare's own lookup of the visitor's
// connection. Nothing is stored; the page uses it to pick units and currency.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/geo') {
      const country = (request.cf && request.cf.country) || '';
      return new Response(JSON.stringify({ country }), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' }
      });
    }
    return env.ASSETS.fetch(request);
  }
};
