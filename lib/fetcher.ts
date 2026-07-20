// SWR用の共通fetcher。Next.js公式docsの推奨パターン(SWR)に合わせて各画面のポーリングで共有する。
export const jsonFetcher = (url: string) => fetch(url).then((res) => res.json());
