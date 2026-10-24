'use client';

import { CalendarRange, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { TemplateForm, type TemplateAction } from '@/components/admin/calendar/template-form';
import { RemoveButton } from '@/components/admin/cms/remove-button';
import { ResponsiveSheet } from '@/components/admin/shell/responsive-sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy/id';
import { sessionsCopy } from '@/lib/copy/sessions';
import { formatTimeRange } from '@/lib/utils/dates';
import type { ActionResult } from '@/types/action-result';
import type { SessionTemplateAdmin } from '@/types/session';

const text = sessionsCopy.templates;

export interface TemplateActions {
  create: TemplateAction;
  update: TemplateAction;
  remove: (input: unknown) => Promise<ActionResult<null>>;
}

export interface TemplateEditorProps {
  templates: readonly SessionTemplateAdmin[];
  actions: TemplateActions;
}

function TemplateSummary({ template }: { template: SessionTemplateAdmin }) {
  const weekday = sessionsCopy.weekdayNames[template.weekday] ?? String(template.weekday);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="text-body font-medium">
          {weekday} · {template.label}
        </p>
        <p className="text-body-sm text-muted-foreground tabular-nums">
          {formatTimeRange(template.startTime, template.endTime)} · {text.capacity}{' '}
          {template.capacity}
        </p>
      </div>
      <Badge variant={template.isActive ? 'success' : 'neutral'}>
        {template.isActive ? text.isActive : text.inactive}
      </Badge>
    </div>
  );
}

interface TemplateRowProps {
  template: SessionTemplateAdmin;
  actions: TemplateActions;
  onSaved: () => void;
}

function TemplateRow({ template, actions, onSaved }: TemplateRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  return (
    <li className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <TemplateSummary template={template} />
      {isEditing ? (
        <TemplateForm
          template={template}
          action={actions.update}
          onSaved={() => {
            setIsEditing(false);
            onSaved();
          }}
        />
      ) : (
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsEditing(true);
            }}
          >
            {copy.cms.common.edit}
          </Button>
          <RemoveButton
            id={template.id}
            noun={text.title}
            name={template.label}
            action={actions.remove}
          />
        </div>
      )}
    </li>
  );
}

// `Tambah pola`: a button until pressed, then the blank form.
function AddTemplate({ action, onSaved }: { action: TemplateAction; onSaved: () => void }) {
  const [isAdding, setIsAdding] = useState(false);
  if (!isAdding) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => {
          setIsAdding(true);
        }}
      >
        <Plus aria-hidden />
        {text.add}
      </Button>
    );
  }
  return (
    <section
      aria-label={text.addTitle}
      className="space-y-4 rounded-xl border border-dashed border-border p-4"
    >
      <h3 className="text-h4">{text.addTitle}</h3>
      <TemplateForm
        template={null}
        action={action}
        onSaved={() => {
          setIsAdding(false);
          onSaved();
        }}
      />
    </section>
  );
}

// docs/StyleGuide.md §6.8: the weekly pattern in a sheet, opened from the page header; `Buat sesi` fills the month
// from it (GenerateDialog).
function TemplateList({ templates, actions }: TemplateEditorProps) {
  const router = useRouter();
  const refresh = () => {
    router.refresh();
  };
  return (
    <div className="space-y-4">
      {templates.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">
          {text.empty} {text.emptyHint}
        </p>
      ) : null}
      <ul className="space-y-3">
        {templates.map((template) => (
          <TemplateRow key={template.id} template={template} actions={actions} onSaved={refresh} />
        ))}
      </ul>
      <AddTemplate action={actions.create} onSaved={refresh} />
    </div>
  );
}

export function TemplateEditor(props: TemplateEditorProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        <CalendarRange aria-hidden />
        {text.open}
      </Button>
      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        title={text.title}
        description={text.description}
      >
        <TemplateList {...props} />
      </ResponsiveSheet>
    </>
  );
}
