import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import { Link2, Network, RefreshCw, Save, Unlink, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Account } from '../../types/account';
import { ProxyEntry, ProxyPoolConfig } from '../../types/config';
import { request } from '../../utils/request';
import { parseProxyEntry } from '../../utils/proxy';
import { useConfigStore } from '../../stores/useConfigStore';
import { showToast } from '../common/ToastContainer';

interface AccountProxyDialogProps {
  isOpen: boolean;
  accounts: Account[];
  autoBindAccountId?: string;
  onClose: () => void;
}

const emptyPool: ProxyPoolConfig = {
  enabled: false,
  proxies: [],
  health_check_interval: 300,
  auto_failover: true,
  strategy: 'priority',
  account_bindings: {},
};

export default function AccountProxyDialog({ isOpen, accounts, autoBindAccountId, onClose }: AccountProxyDialogProps) {
  const { t } = useTranslation();
  const { config, saveConfig, loadConfig } = useConfigStore();
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const [proxyInput, setProxyInput] = useState('');
  const [proxyName, setProxyName] = useState('');
  const [savingAccountId, setSavingAccountId] = useState<string | null>(null);
  const [isAddingProxy, setIsAddingProxy] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const pool = config?.proxy?.proxy_pool || emptyPool;
  const availableProxies = useMemo(
    () => (pool.proxies || []).filter((proxy) => proxy.enabled),
    [pool.proxies],
  );

  useEffect(() => {
    if (!isOpen) return;
    refreshBindings();
    if (!config) {
      loadConfig().catch((error) => {
        console.error('Failed to load config:', error);
      });
    }
  }, [isOpen]);

  const refreshBindings = async () => {
    setIsLoading(true);
    try {
      const currentBindings = await request<Record<string, string>>('get_all_account_bindings');
      setBindings(currentBindings || {});
    } catch (error) {
      console.error('Failed to load account proxy bindings:', error);
      showToast(t('settings.proxy_pool.binding.load_failed', 'Failed to load bindings'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const savePool = async (nextPool: ProxyPoolConfig) => {
    if (!config) {
      throw new Error('Config not loaded');
    }

    await saveConfig({
      ...config,
      proxy: {
        ...config.proxy,
        proxy_pool: nextPool,
      },
    });
  };

  const handleAddProxy = async () => {
    setIsAddingProxy(true);
    try {
      const entry = parseProxyEntry(proxyInput, proxyName);
      const proxies = pool.proxies || [];
      const existing = proxies.find((proxy) => proxy.url === entry.url && proxy.auth?.username === entry.auth?.username);
      const nextPool: ProxyPoolConfig = {
        ...emptyPool,
        ...pool,
        enabled: true,
        auto_failover: pool.auto_failover ?? true,
        strategy: pool.strategy || 'priority',
        proxies: existing ? proxies : [...proxies, entry],
        account_bindings: pool.account_bindings || bindings,
      };

      await savePool(nextPool);

      if (autoBindAccountId) {
        await request('bind_account_proxy', {
          accountId: autoBindAccountId,
          proxyId: existing?.id || entry.id,
        });
        setBindings((prev) => ({ ...prev, [autoBindAccountId]: existing?.id || entry.id }));
      }

      setProxyInput('');
      setProxyName('');
      showToast(
        existing
          ? t('accounts.proxy.proxy_exists', 'Proxy already exists')
          : t('accounts.proxy.proxy_saved', 'Proxy saved'),
        'success',
      );
    } catch (error) {
      showToast(`${t('common.error')}: ${error}`, 'error');
    } finally {
      setIsAddingProxy(false);
    }
  };

  const handleBind = async (accountId: string, proxyId: string) => {
    setSavingAccountId(accountId);
    try {
      if (proxyId) {
        await request('bind_account_proxy', { accountId, proxyId });
        setBindings((prev) => ({ ...prev, [accountId]: proxyId }));
      } else {
        await request('unbind_account_proxy', { accountId });
        setBindings((prev) => {
          const next = { ...prev };
          delete next[accountId];
          return next;
        });
      }
      showToast(t('common.success'), 'success');
    } catch (error) {
      showToast(`${t('common.error')}: ${error}`, 'error');
    } finally {
      setSavingAccountId(null);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[86vh] flex flex-col bg-white dark:bg-base-100 rounded-2xl shadow-xl border border-gray-200 dark:border-base-300">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-base-300">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-600 text-white">
              <Network size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black text-gray-900 dark:text-base-content">
                {t('accounts.proxy.title', 'Account Proxies')}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {accounts.length === 1
                  ? t('accounts.proxy.single_subtitle', 'Configure a dedicated outbound proxy for this account.')
                  : t('accounts.proxy.subtitle', 'Assign a dedicated outbound proxy to each account.')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-base-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-12 gap-3 p-3 rounded-xl border border-gray-200 dark:border-base-300 bg-gray-50 dark:bg-base-200/40">
            <input
              value={proxyName}
              onChange={(event) => setProxyName(event.target.value)}
              className="col-span-12 md:col-span-3 px-3 py-2 rounded-lg border border-gray-200 dark:border-base-300 bg-white dark:bg-base-100 text-sm"
              placeholder={t('accounts.proxy.name_placeholder', 'Proxy name')}
            />
            <input
              value={proxyInput}
              onChange={(event) => setProxyInput(event.target.value)}
              className="col-span-12 md:col-span-7 px-3 py-2 rounded-lg border border-gray-200 dark:border-base-300 bg-white dark:bg-base-100 text-sm font-mono"
              placeholder="http://user:pass@host:port"
            />
            <button
              onClick={handleAddProxy}
              disabled={isAddingProxy || !proxyInput.trim()}
              className="col-span-12 md:col-span-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Save size={14} />
              {t('common.save', 'Save')}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {t('accounts.proxy.pool_count', '{{count}} proxies in pool', { count: availableProxies.length })}
            </div>
            <button
              onClick={refreshBindings}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-base-300 text-xs flex items-center gap-1.5 hover:bg-gray-50 dark:hover:bg-base-200"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
              {t('common.refresh', 'Refresh')}
            </button>
          </div>

          <div className="space-y-2">
            {accounts.map((account) => {
              const boundProxyId = bindings[account.id] || '';
              const currentProxyId = availableProxies.some((proxy) => proxy.id === boundProxyId) ? boundProxyId : '';
              return (
                <div
                  key={account.id}
                  className="grid grid-cols-12 gap-3 items-center p-3 rounded-xl border border-gray-200 dark:border-base-300 bg-white dark:bg-base-100"
                >
                  <div className="col-span-12 md:col-span-5 min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900 dark:text-base-content" title={account.email}>
                      {account.email || account.id}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                      {currentProxyId ? <Link2 size={12} className="text-blue-500" /> : <Unlink size={12} />}
                      {currentProxyId
                        ? t('accounts.proxy.bound', 'Dedicated proxy')
                        : t('accounts.proxy.unbound', 'Default route')}
                    </div>
                  </div>
                  <select
                    value={currentProxyId}
                    onChange={(event) => handleBind(account.id, event.target.value)}
                    disabled={savingAccountId === account.id || availableProxies.length === 0}
                    className="col-span-12 md:col-span-7 px-3 py-2 rounded-lg border border-gray-200 dark:border-base-300 bg-gray-50 dark:bg-base-200 text-sm"
                  >
                    <option value="">{t('settings.proxy_pool.binding.default_strategy', 'Default (Follow Strategy)')}</option>
                    {availableProxies.map((proxy: ProxyEntry) => (
                      <option key={proxy.id} value={proxy.id}>
                        {proxy.name || proxy.url}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
            {accounts.length === 0 && (
              <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {t('settings.account.no_accounts', 'No accounts found')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
