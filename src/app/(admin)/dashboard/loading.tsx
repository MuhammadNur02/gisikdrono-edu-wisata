import { TableSkeleton } from '@/components/admin/shell/table-skeleton';

// docs/StyleGuide.md §6.9 (Task P4.1.02): every dashboard segment shows the table skeleton while its data loads; a
// segment with another shape (the calendar, a form) brings its own loading.tsx.
export default function DashboardLoading() {
  return <TableSkeleton />;
}
