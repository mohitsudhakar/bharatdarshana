import fs from 'fs';
import path from 'path';

/** Load environment variables from .env file for server-side use */
export function loadEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const raw = fs.readFileSync(path, 'utf-8');
    raw.split('\n').forEach(line => {
      const [key, ...rest] = line.split('=');
      const value = rest.join('=').replace(/^["']|["']$/g, '');
      if (key && !key.trim().startsWith('#')) {
        env[key.trim()] = value;
      }
    });
  } catch {
    // If no .env, rely on system env
  }
  return env;
}

// Try project .env or fallback to process.env
const projectEnv = loadEnv(path.join(process.cwd(), '.env'));
Object.entries(projectEnv).forEach(([k, v]) => {
  if (!process.env[k]) process.env[k] = v;
});
