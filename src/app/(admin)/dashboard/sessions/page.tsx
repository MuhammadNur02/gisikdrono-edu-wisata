import type { Metadata } from 'next';

import { GenerateDialog } from '@/components/admin/calendar/generate-dialog';
import { SessionsBoard } from '@/components/admin/calendar/sessions-board';
import { TemplateEditor } from '@/components/admin/calendar/template-editor';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { FormAlert } from '@/components/forms/form-alert';
import { rwLabel, type RwId } from '@/config/rw';
import { MONTH_PARAM, WEEK_PARAM } from '@/config/sessions';
import { sessionsCopy } from '@/lib/copy/sessions';
import { todayInJakarta } from '@/lib/utils/dates';
import { monthKeyOf, weekDays, weekStartOf } from '@/lib/utils/sessions';
import { singleSearchValue } from '@/lib/utils/staff-paths';
import { monthKeySchema, visitDateSchema } from '@/lib/validations/session';
import {
  createSessionTemplateAction,
  createVisitSessionAction,
  generateVisitSessionsAction,
  removeSessionTemplateAction,
  removeVisitSessionAction,
  updateSessionTemplateAction,
  updateVisitSessionAction,
} from '@/server/actions/sessions';
import { ownerOfNewContent, readRwScope } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import {
  listSessionsBetween,
  listSessionTemplates,
  monthRange,
} from '@/server/services/session-service';
import type { SessionCalendarView, SessionTemplateAdmin } from '@/types/session';

const text = sessionsCopy;

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SESSION_ACTIONS = {
  create: createVisitSessionAction,
  update: updateVisitSessionAction,
  remove: removeVisitSessionAction,
};

const TEMPLATE_ACTIONS = {
  create: createSessionTemplateAction,
  update: updateSessionTemplateAction,
  remove: removeSessionTemplateAction,
};

// What is on screen: `?month=YYYY-MM` the month grid, else the week of `?week=` or the current week in Semarang.
function viewOf(
  params: Record<string, string | string[] | undefined>,
  today: string,
): SessionCalendarView {
  const month = monthKeySchema.safeParse(singleSearchValue(params[MONTH_PARAM]));
  if (month.success) return { kind: 'month', month: month.data };
  const week = visitDateSchema.safeParse(singleSearchValue(params[WEEK_PARAM]));
  return { kind: 'week', weekStart: weekStartOf(week.success ? week.data : today) };
}

function rangeOf(view: SessionCalendarView): { from: string; to: string } {
  if (view.kind === 'month') return monthRange(view.month);
  return { from: view.weekStart, to: weekDays(view.weekStart).at(-1) ?? view.weekStart };
}

// The superadmin under `Semua`: sessions always belong to one RW, so the page asks for one first.
function ChooseRwNotice() {
  return (
    <>
      <DashboardPageHeader title={text.title} />
      <FormAlert tone="info">{text.chooseRw}</FormAlert>
    </>
  );
}

function HeaderActions({
  month,
  templates,
}: {
  month: string;
  templates: readonly SessionTemplateAdmin[];
}) {
  const activeTemplates = templates.filter((template) => template.isActive).length;
  return (
    <div className="flex flex-wrap gap-2">
      <TemplateEditor templates={templates} actions={TEMPLATE_ACTIONS} />
      <GenerateDialog
        month={month}
        activeTemplates={activeTemplates}
        action={generateVisitSessionsAction}
      />
    </div>
  );
}

async function loadView(rwId: RwId, view: SessionCalendarView) {
  const { from, to } = rangeOf(view);
  const [sessions, templates] = await Promise.all([
    listSessionsBetween(rwId, from, to),
    listSessionTemplates(rwId),
  ]);
  return { sessions, templates };
}

// Task P4.3.04, docs/PRD.md FR-ADMIN-03 (REC-15, BOOK-13): an RW admin plans their own RW's sessions; the superadmin
// those of the RW the RwSwitcher points at.
export default async function SessionsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const rwId = ownerOfNewContent(ctx, await readRwScope());
  if (rwId === undefined || rwId === null) return <ChooseRwNotice />;
  const today = todayInJakarta();
  const view = viewOf(await searchParams, today);
  const { sessions, templates } = await loadView(rwId, view);
  // "Buat sesi" fills a whole month: the one on screen, or the one the week starts in.
  const month = view.kind === 'month' ? view.month : monthKeyOf(view.weekStart);

  return (
    <>
      <DashboardPageHeader
        title={text.title}
        description={text.description(rwLabel(rwId))}
        action={<HeaderActions month={month} templates={templates} />}
      />
      {sessions.length === 0 ? (
        <FormAlert tone="info">
          {view.kind === 'month' ? text.empty : text.emptyWeek} {text.emptyHint}
        </FormAlert>
      ) : null}
      <SessionsBoard view={view} today={today} sessions={sessions} actions={SESSION_ACTIONS} />
    </>
  );
}
