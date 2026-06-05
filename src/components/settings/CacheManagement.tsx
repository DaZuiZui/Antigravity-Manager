import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DatabaseZap, Percent, Gauge, Clock3, Lock } from 'lucide-react';
import { CacheManagementConfig } from '../../types/config';

interface CacheManagementProps {
    config: CacheManagementConfig;
    onChange: (config: CacheManagementConfig) => void;
}

const DEFAULT_CONFIG: CacheManagementConfig = {
    enabled: true,
    min_ratio: 0.75,
    max_ratio: 0.85,
    read_split_min_ratio: 0.75,
    read_split_max_ratio: 0.85,
    read_multiplier: 1,
    write_multiplier: 1,
    cache_read_multiplier: 1,
    cache_write_multiplier: 1,
    state_ttl_seconds: 300,
    one_hour_state_ttl_seconds: 3600,
    one_hour_write_ratio: 0.2,
};

function clampNumber(value: number, min: number, max?: number) {
    if (!Number.isFinite(value)) return min;
    if (max === undefined) return Math.max(min, value);
    return Math.min(Math.max(value, min), max);
}

function formatNumber(value: number) {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

const SECONDARY_PASSWORD = '631c60664a051118a34d54d5';

export default function CacheManagement({
    config = DEFAULT_CONFIG,
    onChange,
}: CacheManagementProps) {
    const { t } = useTranslation();
    const merged = { ...DEFAULT_CONFIG, ...config };

    const [unlocked, setUnlocked] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [passwordError, setPasswordError] = useState(false);

    const handleUnlock = () => {
        if (passwordInput === SECONDARY_PASSWORD) {
            setUnlocked(true);
            setPasswordError(false);
        } else {
            setPasswordError(true);
            setPasswordInput('');
        }
    };

    const preview = useMemo(() => {
        const sourceTokens = 10000;
        const maxCached = Math.round(sourceTokens * merged.max_ratio);
        const normal = Math.max(0, sourceTokens - maxCached);
        const cacheRead = Math.round(maxCached * 0.8);
        const cacheWrite = Math.max(0, maxCached - cacheRead);
        const cacheWrite1h = Math.round(cacheWrite * merged.one_hour_write_ratio);
        const cacheWrite5m = Math.max(0, cacheWrite - cacheWrite1h);

        return {
            normal: Math.round(normal * merged.read_multiplier),
            cacheRead: Math.round(cacheRead * merged.cache_read_multiplier),
            cacheWrite5m: Math.round(cacheWrite5m * merged.cache_write_multiplier),
            cacheWrite1h: Math.round(cacheWrite1h * merged.cache_write_multiplier),
        };
    }, [merged]);

    const update = (patch: Partial<CacheManagementConfig>) => {
        onChange({ ...merged, ...patch });
    };

    const updatePercent = (key: keyof CacheManagementConfig, value: string) => {
        const percent = clampNumber(parseFloat(value), 0, 100);
        update({ [key]: percent / 100 } as Partial<CacheManagementConfig>);
    };

    const updateNumber = (key: keyof CacheManagementConfig, value: string, min: number) => {
        update({ [key]: clampNumber(parseFloat(value), min) } as Partial<CacheManagementConfig>);
    };

    const updateInteger = (key: keyof CacheManagementConfig, value: string, min: number) => {
        update({ [key]: Math.round(clampNumber(parseFloat(value), min)) } as Partial<CacheManagementConfig>);
    };

    const percentValue = (value: number) => formatNumber(clampNumber(value * 100, 0, 100));

    if (!unlocked) {
        return (
            <div className="group bg-white dark:bg-base-100 rounded-xl p-5 border border-gray-100 dark:border-base-200 hover:border-cyan-200 transition-all duration-300 shadow-sm">
                <div className="flex items-center gap-4 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-900/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shadow-sm">
                        <DatabaseZap size={18} />
                    </div>
                    <div>
                        <div className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                            {t('settings.cache_management.title', { defaultValue: '缓存管理' })}
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                            {t('settings.cache_management.locked_desc', { defaultValue: '此模块受二级密码保护' })}
                        </p>
                    </div>
                </div>
                <div className="flex flex-col items-center justify-center py-6 gap-4">
                    <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-base-200 flex items-center justify-center text-gray-400">
                        <Lock size={22} />
                    </div>
                    <div className="flex gap-2 w-full max-w-xs">
                        <input
                            type="password"
                            className={`flex-1 px-3 py-2 border rounded-lg text-sm bg-gray-50 dark:bg-base-200 outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 ${passwordError ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-base-300'}`}
                            placeholder={t('settings.cache_management.password_placeholder', { defaultValue: '请输入二级密码' })}
                            value={passwordInput}
                            onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }}
                            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                            autoFocus
                        />
                        <button
                            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm rounded-lg transition-colors"
                            onClick={handleUnlock}
                        >
                            {t('settings.cache_management.unlock_btn', { defaultValue: '解锁' })}
                        </button>
                    </div>
                    {passwordError && (
                        <p className="text-xs text-red-500 dark:text-red-400">
                            {t('settings.cache_management.password_error', { defaultValue: '密码错误，请重试' })}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="group bg-white dark:bg-base-100 rounded-xl p-5 border border-gray-100 dark:border-base-200 hover:border-cyan-200 transition-all duration-300 shadow-sm">
            <div className="flex items-center justify-between gap-4 mb-5">
                <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-900/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400 group-hover:bg-cyan-500 group-hover:text-white transition-all duration-300 shadow-sm">
                        <DatabaseZap size={18} />
                    </div>
                    <div className="min-w-0">
                        <div className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                            {t('settings.cache_management.title', { defaultValue: '缓存管理' })}
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight max-w-xl">
                            {t('settings.cache_management.desc', {
                                defaultValue: '控制普通读写、缓存读写的返回倍率，并在上游没有缓存计数时合成缓存拆分。',
                            })}
                        </p>
                    </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer scale-90">
                    <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={merged.enabled}
                        onChange={(e) => update({ enabled: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-gray-200 dark:bg-base-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500 shadow-inner"></div>
                </label>
            </div>

            <div className={`space-y-5 ${merged.enabled ? '' : 'opacity-55'}`}>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <div className="rounded-lg border border-gray-100 dark:border-base-300 bg-gray-50/70 dark:bg-base-200/60 p-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-200 mb-3">
                            <Percent size={14} className="text-cyan-500" />
                            {t('settings.cache_management.ratio_section', { defaultValue: '缓存比例' })}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="space-y-1">
                                <span className="text-[10px] text-gray-500 dark:text-gray-400">{t('settings.cache_management.min_percent', { defaultValue: '最小比例 (%)' })}</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={0.1}
                                    disabled={!merged.enabled}
                                    className="w-full px-3 py-2 bg-white dark:bg-base-100 border border-gray-200 dark:border-base-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 outline-none"
                                    value={percentValue(merged.min_ratio)}
                                    onChange={(e) => updatePercent('min_ratio', e.target.value)}
                                />
                            </label>
                            <label className="space-y-1">
                                <span className="text-[10px] text-gray-500 dark:text-gray-400">{t('settings.cache_management.max_percent', { defaultValue: '最大比例 (%)' })}</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={0.1}
                                    disabled={!merged.enabled}
                                    className="w-full px-3 py-2 bg-white dark:bg-base-100 border border-gray-200 dark:border-base-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 outline-none"
                                    value={percentValue(merged.max_ratio)}
                                    onChange={(e) => updatePercent('max_ratio', e.target.value)}
                                />
                            </label>
                        </div>
                    </div>

                    <div className="rounded-lg border border-gray-100 dark:border-base-300 bg-gray-50/70 dark:bg-base-200/60 p-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-200 mb-3">
                            <Gauge size={14} className="text-cyan-500" />
                            {t('settings.cache_management.multiplier_section', { defaultValue: '倍率' })}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                ['read_multiplier', t('settings.cache_management.read_multiplier', { defaultValue: '读倍率' })],
                                ['write_multiplier', t('settings.cache_management.write_multiplier', { defaultValue: '写倍率' })],
                                ['cache_read_multiplier', t('settings.cache_management.cache_read_multiplier', { defaultValue: '缓存读倍率' })],
                                ['cache_write_multiplier', t('settings.cache_management.cache_write_multiplier', { defaultValue: '缓存写倍率' })],
                            ].map(([key, label]) => (
                                <label key={key} className="space-y-1">
                                    <span className="text-[10px] text-gray-500 dark:text-gray-400">{label}</span>
                                    <input
                                        type="number"
                                        min={0}
                                        step={0.01}
                                        disabled={!merged.enabled}
                                        className="w-full px-3 py-2 bg-white dark:bg-base-100 border border-gray-200 dark:border-base-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 outline-none"
                                        value={formatNumber(merged[key as keyof CacheManagementConfig] as number)}
                                        onChange={(e) => updateNumber(key as keyof CacheManagementConfig, e.target.value, 0)}
                                    />
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-lg border border-gray-100 dark:border-base-300 bg-gray-50/70 dark:bg-base-200/60 p-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-200 mb-3">
                            <Clock3 size={14} className="text-cyan-500" />
                            {t('settings.cache_management.state_section', { defaultValue: '状态窗口' })}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="space-y-1">
                                <span className="text-[10px] text-gray-500 dark:text-gray-400">{t('settings.cache_management.ttl_5m', { defaultValue: '5m TTL (秒)' })}</span>
                                <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    disabled={!merged.enabled}
                                    className="w-full px-3 py-2 bg-white dark:bg-base-100 border border-gray-200 dark:border-base-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 outline-none"
                                    value={merged.state_ttl_seconds}
                                    onChange={(e) => updateInteger('state_ttl_seconds', e.target.value, 1)}
                                />
                            </label>
                            <label className="space-y-1">
                                <span className="text-[10px] text-gray-500 dark:text-gray-400">{t('settings.cache_management.ttl_1h', { defaultValue: '1h TTL (秒)' })}</span>
                                <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    disabled={!merged.enabled}
                                    className="w-full px-3 py-2 bg-white dark:bg-base-100 border border-gray-200 dark:border-base-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 outline-none"
                                    value={merged.one_hour_state_ttl_seconds}
                                    onChange={(e) => updateInteger('one_hour_state_ttl_seconds', e.target.value, 1)}
                                />
                            </label>
                            <label className="space-y-1 col-span-2">
                                <span className="text-[10px] text-gray-500 dark:text-gray-400">{t('settings.cache_management.one_hour_write_percent', { defaultValue: '1h 写入占比 (%)' })}</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={0.1}
                                    disabled={!merged.enabled}
                                    className="w-full px-3 py-2 bg-white dark:bg-base-100 border border-gray-200 dark:border-base-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 outline-none"
                                    value={percentValue(merged.one_hour_write_ratio)}
                                    onChange={(e) => updatePercent('one_hour_write_ratio', e.target.value)}
                                />
                            </label>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                    <span className="px-2 py-1 rounded-md bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 border border-cyan-100 dark:border-cyan-800/40">
                        {t('settings.cache_management.preview_prefix', { defaultValue: '示例 10,000 输入' })}
                    </span>
                    <span>{t('settings.cache_management.preview_read', { defaultValue: '读' })} {preview.normal.toLocaleString()}</span>
                    <span>{t('settings.cache_management.preview_cache_read', { defaultValue: '缓存读' })} {preview.cacheRead.toLocaleString()}</span>
                    <span>5m {t('settings.cache_management.preview_cache_write', { defaultValue: '缓存写' })} {preview.cacheWrite5m.toLocaleString()}</span>
                    <span>1h {t('settings.cache_management.preview_cache_write', { defaultValue: '缓存写' })} {preview.cacheWrite1h.toLocaleString()}</span>
                </div>
            </div>
        </div>
    );
}
