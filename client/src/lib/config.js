// In production the built client is served by the same Express server that
// hosts the API, so relative URLs work. In dev, Vite runs on its own port
// (5173) and the API runs separately (3000), so we point at it directly.
const isProd = import.meta.env.PROD;
export const API_BASE = isProd ? '' : 'http://localhost:3000';
