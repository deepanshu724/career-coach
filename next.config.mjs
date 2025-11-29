/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // TEMPORARY: ignore ESLint during Next.js build on Vercel
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "randomuser.me",
      },
    ],
  },
};

export default nextConfig;
