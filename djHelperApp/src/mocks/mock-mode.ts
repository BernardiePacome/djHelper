export function isMockModeUrl(url: URL): boolean {
  return url.searchParams.get('mock') === '1' || url.port === '8080';
}
