import 'server-only';

import { publicEnv } from '@/lib/public-env';

// True only on a developer's own machine: `next dev` (NODE_ENV development), outside Vercel (no VERCEL_ENV, which
// Vercel sets on every deployment and `vercel dev`), with both the site and Supabase on a loopback address. Whatever
// shows an OTP to a developer (the local Mailpit provider, /dev/otp) asks this first, so staging and production,
// which fail at least one of these, never take that path (docs/Security.md §7.6: codes never reach a log or a page).

export interface DeploymentFacts {
  nodeEnv: string;
  vercelEnv: string | undefined;
  siteUrl: string;
  supabaseUrl: string;
}

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]']);

function isLoopbackUrl(address: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(address).hostname);
  } catch {
    return false;
  }
}

function currentDeployment(): DeploymentFacts {
  return {
    nodeEnv: publicEnv.NODE_ENV,
    vercelEnv: publicEnv.VERCEL_ENV,
    siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL,
    supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  };
}

export function isLocalDevelopment(facts: DeploymentFacts = currentDeployment()): boolean {
  return (
    facts.nodeEnv === 'development' &&
    facts.vercelEnv === undefined &&
    isLoopbackUrl(facts.siteUrl) &&
    isLoopbackUrl(facts.supabaseUrl)
  );
}
