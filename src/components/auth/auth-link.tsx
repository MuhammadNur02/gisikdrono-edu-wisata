import Link from 'next/link';
import type { ReactNode } from 'react';

// The quiet way out under a sign-in form (`Lupa kata sandi?`, `Kembali ke halaman masuk`); the button stays the one
// primary action.
export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <p className="text-center text-body-sm">
      <Link href={href} className="text-primary-text underline-offset-4 hover:underline">
        {children}
      </Link>
    </p>
  );
}
