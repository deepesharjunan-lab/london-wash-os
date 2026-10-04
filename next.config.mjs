/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // WhatsApp inbox attachments are sent through a server action (Vercel caps request bodies at 4.5 MB).
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
};

export default nextConfig;
