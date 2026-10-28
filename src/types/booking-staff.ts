// The staff steps of /dashboard/bookings/[id] (Task P4.3.08; docs/PRD.md §13.1 A28). Plain values: they cross into
// client components.

export interface SessionChoice {
  value: string;
  label: string;
}

// One leg of a booking under review and the open sessions of its RW it may move to.
export interface ReviewLeg {
  rwLabel: string;
  sessions: SessionChoice[];
}
