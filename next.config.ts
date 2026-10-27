import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Chat, sessão e SQLite são dinâmicos; Cache Components não se aplica.
  serverExternalPackages: ["@mastra/core"],
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
