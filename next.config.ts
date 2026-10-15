import bundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';

// pnpm sets npm_lifecycle_event to the running script, so `pnpm analyze` needs no extra env var.
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.npm_lifecycle_event === 'analyze',
});

const nextConfig: NextConfig = {};

export default withBundleAnalyzer(nextConfig);
