import { ChartNoAxesColumn } from 'lucide-react';
import type { ReactNode } from 'react';

import { EmptyState } from '@/components/admin/shell/empty-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export interface ChartCardProps {
  title: string;
  description: string;
  // false: the period has no row at all, so the card says why instead of drawing a flat line.
  hasData: boolean;
  empty: { title: string; description: string };
  children: ReactNode;
}

// docs/StyleGuide.md §6.9: a chart of nothing is an empty state, never a zero line passed off as data.
export function ChartCard({ title, description, hasData, empty, children }: ChartCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h4">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {hasData ? (
          children
        ) : (
          <EmptyState
            icon={ChartNoAxesColumn}
            title={empty.title}
            description={empty.description}
          />
        )}
      </CardContent>
    </Card>
  );
}
