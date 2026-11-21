import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'mammoth', 'docx', '@react-pdf/renderer', 'canvas'],
};

export default nextConfig;
