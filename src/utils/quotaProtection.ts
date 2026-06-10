import type { Account } from '../types/account';
import type { AppConfig } from '../types/config';

export const QUOTA_PROTECTION_OPTIONS = [
    { id: 'gemini-3-pro-high', label: 'Gemini Pro' },
    { id: 'gemini-3-flash', label: 'Gemini Flash' },
    { id: 'gemini-3-pro-image', label: 'Gemini Image' },
    { id: 'claude', label: 'Claude' },
];

export function normalizeProtectionGroup(modelId: string): string {
    const lower = modelId.toLowerCase();
    if (lower.includes('claude') || lower.includes('opus') || lower.includes('sonnet') || lower.includes('haiku')) {
        return 'claude';
    }
    if (lower.includes('image')) return 'gemini-3-pro-image';
    if (lower.includes('flash')) return 'gemini-3-flash';
    if (lower.includes('pro')) return 'gemini-3-pro-high';
    return lower;
}

export function normalizeMonitoredProtectionGroups(models: string[] | undefined): string[] {
    const validGroups = new Set(QUOTA_PROTECTION_OPTIONS.map(option => option.id));
    const normalized = (models || [])
        .map(normalizeProtectionGroup)
        .filter(group => validGroups.has(group));

    return Array.from(new Set(normalized));
}

export function isProtectionGroupMonitored(config: AppConfig | null | undefined, groupId: string): boolean {
    if (!config?.quota_protection?.enabled) return false;
    return normalizeMonitoredProtectionGroups(config.quota_protection.monitored_models).includes(groupId);
}

export function hasActiveProtectedModels(account: Account, config: AppConfig | null | undefined): boolean {
    if (!config?.quota_protection?.enabled) return false;
    const monitoredGroups = new Set(normalizeMonitoredProtectionGroups(config.quota_protection.monitored_models));
    return Boolean(account.protected_models?.some(model => monitoredGroups.has(normalizeProtectionGroup(model))));
}

export function shouldShowClaudeProtection(account: Account, config: AppConfig | null | undefined): boolean {
    if (!isProtectionGroupMonitored(config, 'claude')) return false;
    return Boolean(account.protected_models?.some(model => model.toLowerCase().includes('claude')));
}
