import { CalendarX } from 'lucide-react';

import { OverviewPanel } from '@/components/admin/overview/overview-panel';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { formatDateLong, formatWeekdayShort } from '@/lib/utils/dates';
import type { OccupancyCell, OccupancyRow } from '@/types/dashboard-stats';
import type { RwBadge } from '@/types/rw-unit';

const text = copy.dashboard.overview;
const NO_SESSION = '—';

// Four steps of the success tint, so a busy day reads at a glance; the number is always written, so the grid never
// rests on colour alone. The fullest step carries dark text, the others the ink, each at 4.5:1 or more on the card.
const STEPS: readonly { from: number; className: string }[] = [
  { from: 75, className: 'bg-success text-success-foreground' },
  { from: 50, className: 'bg-success/45 text-foreground' },
  { from: 25, className: 'bg-success/25 text-foreground' },
  { from: 0, className: 'bg-success/10 text-foreground' },
];

function stepOf(percent: number): string {
  return STEPS.find((step) => percent >= step.from)?.className ?? '';
}

function cellLabel(rw: string, cell: OccupancyCell): string {
  const day = formatDateLong(cell.day);
  if (cell.percent === null) return `${rw}, ${day}: ${text.occupancy.noSession}`;
  return `${rw}, ${day}: ${String(cell.percent)} %${cell.isFull ? `, ${text.occupancy.full}` : ''}`;
}

function Cell({ rw, cell }: { rw: string; cell: OccupancyCell }) {
  return (
    <td className="p-0.5">
      <span
        aria-label={cellLabel(rw, cell)}
        className={cn(
          'flex h-8 items-center justify-center rounded-sm text-caption font-semibold tabular-nums',
          cell.percent === null ? 'bg-muted text-muted-foreground' : stepOf(cell.percent),
          cell.isFull && 'ring-2 ring-foreground ring-inset',
        )}
      >
        {cell.percent === null ? NO_SESSION : cell.percent}
      </span>
    </td>
  );
}

function Grid({ rows, rws }: { rows: OccupancyRow[]; rws: readonly RwBadge[] }) {
  const days = rows[0]?.cells.map((cell) => cell.day) ?? [];
  return (
    <table className="w-full table-fixed border-separate border-spacing-0">
      <caption className="sr-only">{text.occupancy.title}</caption>
      <thead>
        <tr>
          <th scope="col" className="w-14 text-left text-caption font-normal text-muted-foreground">
            <span className="sr-only">{text.occupancy.rwColumn}</span>
          </th>
          {days.map((day) => (
            <th
              key={day}
              scope="col"
              className="pb-1 text-caption font-normal text-muted-foreground"
            >
              {formatWeekdayShort(day)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const label = rws.find((rw) => rw.id === row.rwId)?.label ?? String(row.rwId);
          return (
            <tr key={row.rwId}>
              <th scope="row" className="text-left text-caption font-semibold text-ink-2">
                {label}
              </th>
              {row.cells.map((cell) => (
                <Cell key={cell.day} rw={label} cell={cell} />
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// "Okupansi 7 hari ke depan" (Dasbor Gelap): each RW's seats sold over capacity for today and the six days after it.
export function OccupancyPanel({
  rows,
  rws,
}: {
  rows: OccupancyRow[] | null;
  rws: readonly RwBadge[];
}) {
  return (
    <OverviewPanel title={text.occupancy.title} description={text.occupancy.description}>
      {rows === null ? (
        <EmptyState icon={CalendarX} {...text.chartUnavailable} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title={text.sessions.none}
          description={text.sessions.noneDescription}
        />
      ) : (
        <div className="flex flex-col gap-3 px-4 py-4 md:px-5">
          <Grid rows={rows} rws={rws} />
          <p className="text-caption text-muted-foreground">{text.occupancy.note}</p>
        </div>
      )}
    </OverviewPanel>
  );
}
