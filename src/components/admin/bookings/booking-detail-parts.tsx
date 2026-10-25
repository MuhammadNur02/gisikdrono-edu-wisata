import type { ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// The frame every section of /dashboard/bookings/[id] shares (Task P4.3.02): a card with its title, an optional line
// of description, and a definition list for facts.

export function DetailCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h4">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export interface Fact {
  label: string;
  value: ReactNode;
}

export function FactList({ facts }: { facts: readonly Fact[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {facts.map((fact) => (
        <div key={fact.label} className="space-y-0.5">
          <dt className="text-caption text-muted-foreground">{fact.label}</dt>
          <dd className="text-body-sm font-medium break-words">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="text-body-sm text-muted-foreground">{children}</p>;
}
