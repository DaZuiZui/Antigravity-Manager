import { ProxyEntry } from '../types/config';
import { generateUUID } from './uuid';

export function parseProxyEntry(input: string, name?: string): ProxyEntry {
  const raw = input.trim();
  if (!raw) {
    throw new Error('Proxy URL is required');
  }

  const normalized = raw.includes('://') ? raw : `http://${raw}`;
  const parsed = new URL(normalized);
  const username = decodeURIComponent(parsed.username || '');
  const password = decodeURIComponent(parsed.password || '');

  parsed.username = '';
  parsed.password = '';

  return {
    id: generateUUID(),
    name: name?.trim() || `${parsed.hostname}:${parsed.port || parsed.protocol.replace(':', '')}`,
    url: parsed.toString(),
    auth: username ? { username, password } : undefined,
    enabled: true,
    priority: 0,
    tags: ['account-specific'],
    max_accounts: 1,
    health_check_url: 'https://www.google.com/generate_204',
    is_healthy: true,
  };
}

export function proxyEntryMatchesInput(entry: ProxyEntry, input: string): boolean {
  try {
    const parsed = parseProxyEntry(input);
    return entry.url === parsed.url && entry.auth?.username === parsed.auth?.username;
  } catch {
    return false;
  }
}
