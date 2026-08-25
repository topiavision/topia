import type { NextConfig } from "next";
import bundleAnalyzer from '@next/bundle-analyzer';

// ANALYZE=true npm run build → interactive bundle report. The perf overhaul's
// bundle wins are proven with this, not eyeballed.
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

const nextConfig: NextConfig = {
  // Next allows one `next dev` per dist dir (.next/dev/lock). A second
  // session runs its own server by setting NEXT_DIST_DIR (see
  // .claude/launch.json "topia-alt"); default is unchanged.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: [],
  // Covers/avatars live on Vercel Blob AND external hosts (Partiful/Luma
  // imports, social CDNs), so allow any https source; next/image call sites
  // still gate to http(s) non-GIF sources (see EventCover).
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    // Tree-shake the heavyweights at the import level. Privy's full removal
    // from the root layout is a later PR; this is the free partial win.
    optimizePackageImports: ['@privy-io/react-auth', 'react-markdown'],
  },
  // Event editing moved out of the dashboard shell to a standalone route that
  // matches the create flow. Redirect any old/bookmarked links.
  async redirects() {
    return [
      {
        source: '/dashboard/edit-event/:slug',
        destination: '/events/:slug/edit',
        permanent: true,
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
