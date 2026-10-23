import type { Metadata } from 'next';

import { GenerateDialog } from '@/components/admin/calendar/generate-dialog';
import { SessionsBoard } from '@/components/admin/calendar/sessions-board';
import { TemplateEditor } from '@/components/admin/calendar/template-editor';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { FormAlert } from '@/components/forms/form-alert';
import { rwLabel, type RwId } from '@/config/rw';
import { MONTH_PARAM } from '@/config/sessions';
import { copy } from '@/lib/copy/id';
import { todayInJakarta } from '@/lib/utils/dates';
import { monthKeyOf } from '@/lib/utils/sessions';
import { singleSearchValue } from '@/lib/utils/staff-paths';
import { monthKeySchema } from '@/lib/validations/session';
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
import { listSessionsForMonth, listSessionTemplates } from '@/server/services/session-service';
import type { SessionTemplateAdmin } from '@/types/session';

const text = copy.sessions;

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

// The month on screen: `?month=YYYY-MM`, or the current month in Semarang.
function monthOf(value: string | undefined, today: string): string {
  const parsed = monthKeySchema.safeParse(value);
  return parsed.success ? parsed.data : monthKeyOf(today);
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

async function loadMonth(rwId: RwId, month: string) {
  const [sessions, templates] = await Promise.all([
    listSessionsForMonth(rwId, month),
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
  const month = monthOf(singleSearchValue((await searchParams)[MONTH_PARAM]), today);
  const { sessions, templates } = await loadMonth(rwId, month);

  return (
    <>
      <DashboardPageHeader
        title={text.title}
        description={text.description(rwLabel(rwId))}
        action={<HeaderActions month={month} templates={templates} />}
      />
      {sessions.length === 0 ? (
        <FormAlert tone="info">
          {text.empty} {text.emptyHint}
        </FormAlert>
      ) : null}
      <SessionsBoard month={month} today={today} sessions={sessions} actions={SESSION_ACTIONS} />
    </>
  );
}
