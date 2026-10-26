import { CheckCircle2, Clock, Hourglass, XCircle } from 'lucide-react';

import type { StatusMeta } from '@/config/status';
import { dsrCopy } from '@/lib/copy/dsr';
import type { DsrStatus } from '@/types/dsr';

// The badge of a data request's status (Task P4.10.03). dsr_requests.status is a CHECK list of 20261104140100, not a
// Postgres enum, so it sits beside src/config/status.ts rather than in its enum registry (docs/StyleGuide.md §6.5).
export const DSR_STATUS_META: Record<DsrStatus, StatusMeta> = {
  received: { tone: 'warning', label: dsrCopy.statuses.received, icon: Clock },
  in_progress: { tone: 'info', label: dsrCopy.statuses.in_progress, icon: Hourglass },
  completed: { tone: 'success', label: dsrCopy.statuses.completed, icon: CheckCircle2 },
  rejected: { tone: 'neutral', outline: true, label: dsrCopy.statuses.rejected, icon: XCircle },
};
