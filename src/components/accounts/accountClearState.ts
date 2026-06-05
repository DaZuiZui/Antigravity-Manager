import type { Account } from '../../types/account';

const AUTO_PROXY_DISABLED_HINTS = [
    '403',
    'forbidden',
    'validation',
    'quota fetch denied',
    'warmup',
    'scheduler',
    'rate limit',
    'rate-limited',
    'risk control',
    'frozen',
    '验证',
    '风控',
    '冻结',
];

function includesAny(text: string, hints: string[]): boolean {
    return hints.some((hint) => text.includes(hint));
}

export function isAutoProxyDisabledReason(reason?: string): boolean {
    return includesAny((reason || '').toLowerCase(), AUTO_PROXY_DISABLED_HINTS);
}

export function hasClearableAccountState(account: Account): boolean {
    const resetSeconds = Number(account.rate_limit_reset_seconds || 0);

    return Boolean(
        account.rate_limited ||
        resetSeconds > 0 ||
        account.validation_blocked ||
        account.validation_blocked_until ||
        account.validation_blocked_reason ||
        account.validation_url ||
        account.quota?.is_forbidden ||
        account.quota?.forbidden_reason ||
        (account.protected_models?.length || 0) > 0 ||
        (account.proxy_disabled && isAutoProxyDisabledReason(account.proxy_disabled_reason))
    );
}
