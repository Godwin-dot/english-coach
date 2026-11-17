import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: [
    "kokoro-js",
    "onnxruntime-node",
    "@huggingface/transformers",
  ],
};

export default nextConfig;
