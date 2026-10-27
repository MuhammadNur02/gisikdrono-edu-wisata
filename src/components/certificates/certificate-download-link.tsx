import { Download } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';

interface DownloadLinkProps {
  href: string;
  label: string;
  children: string;
}

// Review of PR #94, M1: a plain link to sertifikat/unduh/<slot>, which streams the PDF inline under the page's own
// cookies; no signed URL is ever handed to the browser. It opens in a new tab, so the list stays where it was.
export function CertificateDownloadLink({ href, label, children }: DownloadLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={buttonVariants({ variant: 'outline', size: 'sm' })}
    >
      <Download aria-hidden />
      {children}
    </a>
  );
}
