import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@grpc/grpc-js", "@grpc/proto-loader", "ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/**": ["./proto/**/*", "./sample/**/*", "./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
