import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // nfc-pcsc / pcsclite はネイティブアドオンを含むためバンドル対象から除外する。
  // better-sqlite3 は Next.js の組込み除外リストに含まれるが、参考実装に合わせ明示しておく。
  serverExternalPackages: ["nfc-pcsc", "pcsclite", "better-sqlite3"],
};

export default nextConfig;
