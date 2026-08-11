import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';

import './index.css';

// The generated API hooks (`@workspace/api-client-react`) call relative paths like
// `/api/auth/login`. Left unconfigured, those resolve against this app's OWN origin
// (this Vite dev server, or wherever detail-hub is deployed) instead of the api-server
// — a 404, not an auth failure. `VITE_API_URL` is this app's own env convention for the
// api-server's origin (no repo-wide convention existed before this). In dev, the
// api-server's documented port is 5000 (see root `replit.md`'s "Run & Operate" section:
// `pnpm --filter @workspace/api-server run dev` — port 5000), so that's used as a dev-only
// fallback; production has no safe default and must set `VITE_API_URL` explicitly.
const apiUrl = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:5000' : undefined);

if (!apiUrl) {
  throw new Error(
    'VITE_API_URL environment variable is required but was not provided (no dev fallback applies outside `import.meta.env.DEV`).',
  );
}

setBaseUrl(apiUrl);

createRoot(document.getElementById('root')!).render(<App />);
