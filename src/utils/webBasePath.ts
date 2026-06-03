const normalizeBasePath = (basePath: string) => {
  if (!basePath || basePath === '/') return '';
  return `/${basePath.replace(/^\/+|\/+$/g, '')}`;
};

export const getWebBasePath = () => {
  const configuredBase = normalizeBasePath(import.meta.env.BASE_URL);
  if (configuredBase) return configuredBase;

  if (typeof window === 'undefined') return '';

  const supportedSubPath = '/an';
  const { pathname } = window.location;

  if (pathname === supportedSubPath || pathname.startsWith(`${supportedSubPath}/`)) {
    return supportedSubPath;
  }

  return '';
};

export const webBasePath = getWebBasePath();
export const webRouterBasename = webBasePath || undefined;
