// The quota colours the month grid, the week view and their legend share (docs/StyleGuide.md §6.8): the bar by how
// full a session is, the dot by its status.
export const BAR_FILL = {
  open: 'bg-chart-1',
  nearly_full: 'bg-warning',
  full: 'bg-danger',
} as const;

export const STATUS_DOT = {
  open: 'bg-success',
  closed: 'bg-neutral',
  cancelled: 'bg-danger',
} as const;
