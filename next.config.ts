import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['mammoth', 'docx', '@react-pdf/renderer', 'canvas'],
};

export default nextConfig;
