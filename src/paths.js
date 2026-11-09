// Resolve from the module directory so the same build works at / and /wsxyxd/.
export function sitePath(path = '', moduleUrl = import.meta.url) {
  return new URL(String(path).replace(/^\/+/, ''), new URL('../', moduleUrl)).pathname;
}

export function localAsset(path, moduleUrl = import.meta.url) {
  return typeof path === 'string' && path.startsWith('/assets/') ? sitePath(path, moduleUrl) : path;
}
