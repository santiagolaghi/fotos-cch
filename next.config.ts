import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.files.1drv.com' },
      { protocol: 'https', hostname: '**.1drv.com' },
      { protocol: 'https', hostname: '**.sharepoint.com' }
    ]
  }
};
export default nextConfig;
