import { Activity, Mail, ShieldAlert, Tag } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getValidationBlockedStatusLabel } from '../accounts/accountValidationStatus';
import { Account, ModelQuota } from '../../types/account';
import { cn } from '../../utils/cn';
import { formatRelativeTime, formatTimeRemaining } from '../../utils/format';

interface AccountHealthMapProps {
    accounts: Account[];
    currentAccountId?: string;
}

type HealthKey = 'ready' | 'low' | 'cooldown' | 'blocked' | 'disabled' | 'unknown';

interface HealthStatus {
    key: HealthKey;
    label: string;
    detail?: string;
    cellClass: string;
    textClass: string;
    ringClass: string;
}

interface HoverState {
    account: Account;
    status: HealthStatus;
    x: number;
    y: number;
}

const GEMINI_PRO_NAMES = new Set([
    'gemini-3-pro-high',
    'gemini-3-pro-low',
    'gemini-3.1-pro-high',
    'gemini-3.1-pro-low',
]);

const GEMINI_IMAGE_NAMES = new Set([
    'gemini-3.1-flash-image',
    'gemini-3-pro-image',
]);

const CLAUDE_NAMES = new Set([
    'claude',
    'claude-sonnet-4-6',
    'claude-sonnet-4-5',
    'claude-opus-4-6-thinking',
]);

const HEALTH_STYLES: Record<HealthKey, Pick<HealthStatus, 'cellClass' | 'textClass' | 'ringClass'>> = {
    ready: {
        cellClass: 'bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-500 dark:hover:bg-emerald-400',
        textClass: 'text-emerald-600 dark:text-emerald-400',
        ringClass: 'ring-emerald-500/30',
    },
    low: {
        cellClass: 'bg-amber-500 hover:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-400',
        textClass: 'text-amber-600 dark:text-amber-400',
        ringClass: 'ring-amber-500/30',
    },
    cooldown: {
        cellClass: 'bg-sky-500 hover:bg-sky-600 dark:bg-sky-500 dark:hover:bg-sky-400',
        textClass: 'text-sky-600 dark:text-sky-400',
        ringClass: 'ring-sky-500/30',
    },
    blocked: {
        cellClass: 'bg-rose-500 hover:bg-rose-600 dark:bg-rose-500 dark:hover:bg-rose-400',
        textClass: 'text-rose-600 dark:text-rose-400',
        ringClass: 'ring-rose-500/30',
    },
    disabled: {
        cellClass: 'bg-slate-500 hover:bg-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500',
        textClass: 'text-slate-600 dark:text-slate-400',
        ringClass: 'ring-slate-500/30',
    },
    unknown: {
        cellClass: 'bg-gray-300 hover:bg-gray-400 dark:bg-slate-700 dark:hover:bg-slate-600',
        textClass: 'text-gray-500 dark:text-slate-400',
        ringClass: 'ring-gray-400/30',
    },
};

function formatWait(seconds?: number): string {
    if (!seconds || seconds <= 0) return '';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function findQuota(account: Account, matcher: (name: string) => boolean): ModelQuota | undefined {
    return account.quota?.models
        .filter(model => matcher(model.name.toLowerCase()))
        .sort((a, b) => (b.percentage || 0) - (a.percentage || 0))[0];
}

function formatQuota(model?: ModelQuota): string {
    return model ? `${model.percentage}%` : '-';
}

function getTierLabel(account: Account): string {
    const tier = account.quota?.subscription_tier;
    return tier ? tier.toUpperCase() : 'FREE';
}

function getAccountTitle(account: Account): string {
    return account.custom_label || account.name || account.email.split('@')[0] || account.email;
}

function getHealthStatus(account: Account, t: ReturnType<typeof useTranslation>['t']): HealthStatus {
    const styles = (key: HealthKey) => HEALTH_STYLES[key];
    const validationLabel = getValidationBlockedStatusLabel(account.validation_blocked_reason, t);
    const wait = formatWait(account.rate_limit_reset_seconds);

    if (account.disabled) {
        return {
            key: 'disabled',
            label: t('accounts.status.disabled'),
            detail: account.disabled_reason || t('accounts.disabled_tooltip'),
            ...styles('disabled'),
        };
    }

    if (account.proxy_disabled) {
        return {
            key: 'disabled',
            label: t('accounts.status.proxy_disabled'),
            detail: account.proxy_disabled_reason || t('accounts.proxy_disabled_tooltip'),
            ...styles('disabled'),
        };
    }

    if (account.quota?.is_forbidden) {
        return {
            key: 'blocked',
            label: t('accounts.status.forbidden'),
            detail: account.quota.forbidden_reason || t('accounts.forbidden_tooltip'),
            ...styles('blocked'),
        };
    }

    if (account.validation_blocked) {
        return {
            key: 'blocked',
            label: validationLabel,
            detail: account.validation_blocked_reason,
            ...styles('blocked'),
        };
    }

    if (account.rate_limited || wait) {
        return {
            key: 'cooldown',
            label: t('accounts.rate_limited'),
            detail: wait ? t('accounts.rate_limit_wait', { time: wait, defaultValue: `${wait} remaining` }) : undefined,
            ...styles('cooldown'),
        };
    }

    if (!account.quota?.models?.length) {
        return {
            key: 'unknown',
            label: t('common.unknown'),
            detail: t('accounts.no_data'),
            ...styles('unknown'),
        };
    }

    const gemini = findQuota(account, name => GEMINI_PRO_NAMES.has(name));
    const claude = findQuota(account, name => CLAUDE_NAMES.has(name) || name.includes('claude'));
    const criticalQuotas = [gemini?.percentage, claude?.percentage].filter((value): value is number => typeof value === 'number');
    const lowestQuota = criticalQuotas.length > 0 ? Math.min(...criticalQuotas) : undefined;

    if (lowestQuota !== undefined && lowestQuota < 20) {
        return {
            key: 'low',
            label: t('accounts.low_quota'),
            detail: t('dashboard.quota_desc'),
            ...styles('low'),
        };
    }

    return {
        key: 'ready',
        label: t('accounts.status.normal'),
        detail: t('accounts.status.normal_desc'),
        ...styles('ready'),
    };
}

function AccountTooltip({
    hover,
    currentAccountId,
    language,
}: {
    hover: HoverState;
    currentAccountId?: string;
    language: string;
}) {
    const { t } = useTranslation();
    const { account, status } = hover;
    const gemini = findQuota(account, name => GEMINI_PRO_NAMES.has(name));
    const image = findQuota(account, name => GEMINI_IMAGE_NAMES.has(name));
    const claude = findQuota(account, name => CLAUDE_NAMES.has(name) || name.includes('claude'));
    const lastUsed = account.last_used ? formatRelativeTime(account.last_used, language) : t('common.unknown');
    const resetTime = gemini?.reset_time || claude?.reset_time || image?.reset_time;
    const tooltipWidth = 280;
    const viewportMargin = 12;
    const showAbove = hover.y > 260;

    return (
        <div
            className="pointer-events-none fixed z-[100] w-[280px] rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-xl dark:border-slate-700 dark:bg-slate-900"
            style={{
                left: Math.max(viewportMargin, Math.min(hover.x + 14, window.innerWidth - tooltipWidth - viewportMargin)),
                top: showAbove ? hover.y - 18 : hover.y + 18,
                transform: showAbove ? 'translateY(-100%)' : undefined,
            }}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="font-semibold text-gray-900 dark:text-slate-100 truncate">
                        {getAccountTitle(account)}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500 dark:text-slate-400">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{account.email}</span>
                    </div>
                </div>
                <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold', status.textClass, 'bg-gray-100 dark:bg-slate-800')}>
                    {status.label}
                </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-md bg-gray-50 p-2 dark:bg-slate-800/70">
                    <div className="text-[10px] text-gray-500 dark:text-slate-400">Gemini</div>
                    <div className="mt-0.5 font-bold text-gray-900 dark:text-slate-100">{formatQuota(gemini)}</div>
                </div>
                <div className="rounded-md bg-gray-50 p-2 dark:bg-slate-800/70">
                    <div className="text-[10px] text-gray-500 dark:text-slate-400">Image</div>
                    <div className="mt-0.5 font-bold text-gray-900 dark:text-slate-100">{formatQuota(image)}</div>
                </div>
                <div className="rounded-md bg-gray-50 p-2 dark:bg-slate-800/70">
                    <div className="text-[10px] text-gray-500 dark:text-slate-400">Claude</div>
                    <div className="mt-0.5 font-bold text-gray-900 dark:text-slate-100">{formatQuota(claude)}</div>
                </div>
            </div>

            <div className="mt-3 space-y-1.5 text-[11px] text-gray-600 dark:text-slate-300">
                <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500 dark:text-slate-400">{t('accounts.last_used')}</span>
                    <span className="truncate">{lastUsed}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500 dark:text-slate-400">{t('accounts.account')}</span>
                    <span className="truncate">
                        {getTierLabel(account)}
                        {account.id === currentAccountId ? ` · ${t('accounts.current')}` : ''}
                    </span>
                </div>
                {resetTime && (
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-gray-500 dark:text-slate-400">{t('accounts.reset_time')}</span>
                        <span className="truncate">{formatTimeRemaining(resetTime)}</span>
                    </div>
                )}
                {status.detail && (
                    <div className="flex items-start justify-between gap-3">
                        <span className="text-gray-500 dark:text-slate-400">{t('common.reason')}</span>
                        <span className="max-w-[170px] text-right leading-snug">{status.detail}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

function AccountHealthMap({ accounts, currentAccountId }: AccountHealthMapProps) {
    const { t, i18n } = useTranslation();
    const [hover, setHover] = useState<HoverState | null>(null);

    const accountStatuses = useMemo(
        () => accounts.map(account => ({
            account,
            status: getHealthStatus(account, t),
        })),
        [accounts, t],
    );

    const counts = useMemo(
        () => accountStatuses.reduce<Record<HealthKey, number>>((acc, item) => {
            acc[item.status.key] += 1;
            return acc;
        }, {
            ready: 0,
            low: 0,
            cooldown: 0,
            blocked: 0,
            disabled: 0,
            unknown: 0,
        }),
        [accountStatuses],
    );

    const legendItems = [
        { key: 'ready' as const, label: t('accounts.status.normal') },
        { key: 'low' as const, label: t('accounts.low_quota') },
        { key: 'cooldown' as const, label: t('accounts.rate_limited') },
        { key: 'blocked' as const, label: t('accounts.status.validation_required') },
        { key: 'disabled' as const, label: t('common.disabled') },
        { key: 'unknown' as const, label: t('common.unknown') },
    ];

    return (
        <section className="bg-white dark:bg-base-100 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-base-200">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-base-content">
                        <Activity className="h-4 w-4 text-emerald-500" />
                        {t('dashboard.account_health_map', { defaultValue: '账号活力图' })}
                    </h2>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
                    <span>{counts.blocked + counts.disabled + counts.cooldown + counts.low}</span>
                    <span>{t('dashboard.need_attention', { defaultValue: '需要关注' })}</span>
                </div>
            </div>

            <div className="mt-4 overflow-x-auto pb-1">
                {accountStatuses.length > 0 ? (
                    <div
                        className="grid w-max grid-flow-col grid-rows-7 gap-1.5"
                        onMouseLeave={() => setHover(null)}
                    >
                        {accountStatuses.map(({ account, status }) => {
                            const isCurrent = account.id === currentAccountId;
                            return (
                                <button
                                    key={account.id}
                                    type="button"
                                    className={cn(
                                        'h-3.5 w-3.5 rounded-[3px] transition-transform duration-150 hover:scale-125 focus:outline-none focus-visible:ring-2',
                                        status.cellClass,
                                        status.ringClass,
                                        isCurrent && 'ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-blue-400 dark:ring-offset-base-100',
                                    )}
                                    aria-label={`${account.email} ${status.label}`}
                                    title={`${account.email} · ${status.label}`}
                                    onMouseEnter={(event) => {
                                        setHover({
                                            account,
                                            status,
                                            x: event.clientX,
                                            y: event.clientY,
                                        });
                                    }}
                                    onMouseMove={(event) => {
                                        setHover({
                                            account,
                                            status,
                                            x: event.clientX,
                                            y: event.clientY,
                                        });
                                    }}
                                    onFocus={(event) => {
                                        const rect = event.currentTarget.getBoundingClientRect();
                                        setHover({
                                            account,
                                            status,
                                            x: rect.left + rect.width / 2,
                                            y: rect.top,
                                        });
                                    }}
                                    onBlur={() => setHover(null)}
                                />
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-400 dark:border-base-300 dark:text-gray-500">
                        {t('accounts.no_data')}
                    </div>
                )}
            </div>

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
                {legendItems.map(item => (
                    <div key={item.key} className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                        <span className={cn('h-2.5 w-2.5 rounded-[3px]', HEALTH_STYLES[item.key].cellClass)} />
                        <span>{item.label}</span>
                        <span className="font-semibold text-gray-700 dark:text-gray-300">{counts[item.key]}</span>
                    </div>
                ))}
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                    <span className="inline-flex h-2.5 w-2.5 rounded-[3px] bg-transparent ring-2 ring-blue-500 ring-offset-1 ring-offset-white dark:ring-blue-400 dark:ring-offset-base-100" />
                    <Tag className="h-3 w-3" />
                    <span>{t('accounts.current')}</span>
                </div>
            </div>

            {hover && (
                <AccountTooltip
                    hover={hover}
                    currentAccountId={currentAccountId}
                    language={i18n.language}
                />
            )}
        </section>
    );
}

export default AccountHealthMap;
