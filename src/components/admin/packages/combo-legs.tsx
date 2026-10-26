'use client';

import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useController } from 'react-hook-form';

import { FormSection } from '@/components/admin/cms/form-section';
import type { PackageControl } from '@/components/admin/packages/package-fields';
import type { RwOption } from '@/components/admin/packages/package-tiers';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MAX_PACKAGE_LEGS } from '@/config/booking';
import { rwLabel, type RwId } from '@/config/rw';
import { packagesCopy } from '@/lib/copy/packages';
import { moveLeg } from '@/lib/utils/package-tiers';

const text = packagesCopy.legs;

type LegAction = 'up' | 'down' | 'remove';

function nameOf(rwId: RwId, rwOptions: readonly RwOption[]): string {
  return rwOptions.find((option) => option.id === rwId)?.name ?? rwLabel(rwId);
}

function LegButton({
  label,
  action,
  isDisabled = false,
  onClick,
  children,
}: {
  label: string;
  action: LegAction;
  isDisabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={action === 'remove' ? 'size-11 text-destructive' : 'size-11'}
      disabled={isDisabled}
      aria-label={label}
      data-leg-action={action}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

interface LegRowProps {
  rwId: RwId;
  position: number;
  name: string;
  isFirst: boolean;
  isLast: boolean;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
}

function LegRow({ rwId, position, name, isFirst, isLast, onMove, onRemove }: LegRowProps) {
  return (
    <li className="flex items-center justify-between gap-2 py-2" data-leg={rwId}>
      <span className="space-y-0.5">
        <span className="block text-caption text-muted-foreground">{text.stop(position)}</span>
        <span className="block text-body-sm font-medium">{name}</span>
      </span>
      <span className="flex items-center gap-1">
        <LegButton
          label={text.moveUp(name)}
          action="up"
          isDisabled={isFirst}
          onClick={() => {
            onMove(-1);
          }}
        >
          <ArrowUp aria-hidden />
        </LegButton>
        <LegButton
          label={text.moveDown(name)}
          action="down"
          isDisabled={isLast}
          onClick={() => {
            onMove(1);
          }}
        >
          <ArrowDown aria-hidden />
        </LegButton>
        <LegButton label={text.remove(name)} action="remove" onClick={onRemove}>
          <X aria-hidden />
        </LegButton>
      </span>
    </li>
  );
}

function RwChoice({
  value,
  remaining,
  rwOptions,
  onChange,
}: {
  value: string;
  remaining: readonly RwId[];
  rwOptions: readonly RwOption[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="min-h-11 w-full sm:w-64" aria-label={text.add}>
        <SelectValue placeholder={text.addPlaceholder} />
      </SelectTrigger>
      <SelectContent>
        {remaining.map((rwId) => (
          <SelectItem key={rwId} value={String(rwId)}>
            {nameOf(rwId, rwOptions)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AddLeg({
  remaining,
  rwOptions,
  onAdd,
}: {
  remaining: readonly RwId[];
  rwOptions: readonly RwOption[];
  onAdd: (rwId: RwId) => void;
}) {
  const [choice, setChoice] = useState('');
  const add = () => {
    const rwId = remaining.find((id) => String(id) === choice);
    if (rwId === undefined) return;
    onAdd(rwId);
    setChoice('');
  };
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <RwChoice value={choice} remaining={remaining} rwOptions={rwOptions} onChange={setChoice} />
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={choice === ''}
        onClick={add}
      >
        <Plus aria-hidden />
        {text.add}
      </Button>
    </div>
  );
}

interface RouteHandlers {
  move: (index: number, offset: -1 | 1) => void;
  remove: (rwId: RwId) => void;
  add: (rwId: RwId) => void;
}

function LegList({
  legs,
  rwOptions,
  listRef,
  handlers,
}: {
  legs: readonly RwId[];
  rwOptions: readonly RwOption[];
  listRef: RefObject<HTMLOListElement | null>;
  handlers: RouteHandlers;
}) {
  if (legs.length === 0) return <p className="text-body-sm text-muted-foreground">{text.empty}</p>;
  return (
    <ol ref={listRef} className="divide-y divide-border">
      {legs.map((rwId, index) => (
        <LegRow
          key={rwId}
          rwId={rwId}
          position={index + 1}
          name={nameOf(rwId, rwOptions)}
          isFirst={index === 0}
          isLast={index === legs.length - 1}
          onMove={(offset) => {
            handlers.move(index, offset);
          }}
          onRemove={() => {
            handlers.remove(rwId);
          }}
        />
      ))}
    </ol>
  );
}

type FocusTarget = { rwId: RwId; action: 'up' | 'down' } | 'first' | null;

function enabledButton(list: HTMLOListElement, selector: string): HTMLButtonElement | null {
  return list.querySelector<HTMLButtonElement>(`${selector}:not(:disabled)`);
}

// Review of PR #79, L-9: after a move, focus stays on the moved RW's button of the same direction, or on the other
// direction once that one is disabled at the end of the route; after a removal it goes to the first button left.
function useRouteFocus(listRef: RefObject<HTMLOListElement | null>, legs: readonly RwId[]) {
  const [target, setTarget] = useState<FocusTarget>(null);
  useEffect(() => {
    const list = listRef.current;
    if (target === null || list === null) return;
    if (target === 'first') {
      enabledButton(list, '[data-leg-action]')?.focus();
    } else {
      const row = `[data-leg="${String(target.rwId)}"]`;
      const other = target.action === 'up' ? 'down' : 'up';
      (
        enabledButton(list, `${row} [data-leg-action="${target.action}"]`) ??
        enabledButton(list, `${row} [data-leg-action="${other}"]`)
      )?.focus();
    }
    setTarget(null);
  }, [target, legs, listRef]);
  return setTarget;
}

// Each change goes to the form field, is announced, and leaves the focus where the officer can go on.
function useRouteEditor(
  legs: readonly RwId[],
  rwOptions: readonly RwOption[],
  onChange: (legs: RwId[]) => void,
) {
  const listRef = useRef<HTMLOListElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const focusOn = useRouteFocus(listRef, legs);
  const handlers: RouteHandlers = {
    move: (index, offset) => {
      const rwId = legs[index];
      if (rwId === undefined) return;
      onChange(moveLeg(legs, index, offset));
      setAnnouncement(text.moved(nameOf(rwId, rwOptions), index + offset + 1));
      focusOn({ rwId, action: offset < 0 ? 'up' : 'down' });
    },
    remove: (rwId) => {
      onChange(legs.filter((id) => id !== rwId));
      setAnnouncement(text.removed(nameOf(rwId, rwOptions)));
      focusOn('first');
    },
    add: (rwId) => {
      onChange([...legs, rwId]);
      setAnnouncement(text.added(nameOf(rwId, rwOptions)));
    },
  };
  return { listRef, announcement, handlers };
}

// docs/PRD.md FR-ADMIN-05 (Task P4.3.05, P4.3.11): a combo's route, the RWs it visits in order, which save_package
// writes as its legs. The superadmin edits it; an RW admin reads it (the form's fieldset is disabled for them). The
// schema keeps one RW at least, two before the combo goes on sale and four at most (MAX_PACKAGE_LEGS), as
// save_package_legs and combo_legs_on_sale do.
export function ComboLegsEditor({
  control,
  rwOptions,
}: {
  control: PackageControl;
  rwOptions: readonly RwOption[];
}) {
  const { field, fieldState } = useController({ control, name: 'legRwIds' });
  const legs = field.value;
  const { listRef, announcement, handlers } = useRouteEditor(legs, rwOptions, field.onChange);
  const remaining = rwOptions.map((option) => option.id).filter((id) => !legs.includes(id));
  const canAdd = remaining.length > 0 && legs.length < MAX_PACKAGE_LEGS;
  return (
    <FormSection title={packagesCopy.sections.legs}>
      <p className="text-body-sm text-muted-foreground">{text.hint}</p>
      <LegList legs={legs} rwOptions={rwOptions} listRef={listRef} handlers={handlers} />
      {canAdd ? <AddLeg remaining={remaining} rwOptions={rwOptions} onAdd={handlers.add} /> : null}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {fieldState.error?.message ? (
        <p role="alert" className="text-body-sm text-destructive">
          {fieldState.error.message}
        </p>
      ) : null}
    </FormSection>
  );
}
