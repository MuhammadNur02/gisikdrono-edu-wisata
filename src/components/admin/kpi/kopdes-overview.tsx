import { FilePen, ShoppingBag, Store } from 'lucide-react';
import Link from 'next/link';

import { KpiCard } from '@/components/admin/kpi/kpi-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SETTINGS_PATH } from '@/config/dashboard';
import { PRODUCT_PATHS, VENDORS_PATH } from '@/config/products';
import { copy } from '@/lib/copy/id';
import { kopdesOverviewCopy } from '@/lib/copy/kopdes';
import type { UmkmCatalogueCounts } from '@/types/product';

const text = kopdesOverviewCopy;

// The Kopdes admin's three pages, one step away.
function Shortcuts() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.shortcuts}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={PRODUCT_PATHS.list}>{text.products}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={VENDORS_PATH}>{text.vendorsLink}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={SETTINGS_PATH}>{text.settings}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// docs/PRD.md §13.1 A30: what the Koperasi Merah Putih's admin sees on /dashboard, the UMKM catalogue in counts and the
// way to its three pages; no booking, visit or revenue figure.
export function KopdesOverview({ counts }: { counts: UmkmCatalogueCounts }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-body text-muted-foreground">{text.welcome}</p>
      <section
        aria-label={copy.dashboard.overview.kpiLabel}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <KpiCard
          label={text.published}
          icon={ShoppingBag}
          value={counts.publishedProducts}
          hint={text.publishedHint}
        />
        <KpiCard
          label={text.drafts}
          icon={FilePen}
          value={counts.draftProducts}
          hint={text.draftsHint}
        />
        <KpiCard
          label={text.vendors}
          icon={Store}
          value={counts.activeVendors}
          hint={text.vendorsHint}
        />
      </section>
      <Shortcuts />
    </div>
  );
}
