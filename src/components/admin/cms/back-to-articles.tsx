import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { CMS_PATHS } from '@/config/cms';
import { copy } from '@/lib/copy/id';

export function BackToArticles() {
  return (
    <Button asChild variant="ghost" size="sm" className="self-start">
      <Link href={CMS_PATHS.articles}>
        <ArrowLeft aria-hidden />
        {copy.cms.articles.back}
      </Link>
    </Button>
  );
}
