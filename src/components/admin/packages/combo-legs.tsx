'use client';

import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
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
import { PACKAGE_LIMITS } from '@/config/packages';
import { rwLabel, type RwId } from '@/config/rw';
import { packagesCopy } from '@/lib/copy/packages';
import { moveLeg } from '@/lib/utils/package-tiers';

const text = packagesCopy.legs;

function nameOf(rwId: RwId, rwOptions: readonly RwOption[]): string {
  return rwOptions.find((option) => option.id === rwId)?.name ?? rwLabel(rwId);
}

function LegButton({
  label,
  isDisabled = false,
  isDestructive = false,
  onClick,
  children,
}: {
  label: string;
  isDisabled?: boolean;
  isDestructive?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={isDestructive ? 'size-11 text-destructive' : 'size-11'}
      disabled={isDisabled}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

interface LegRowProps {
  position: number;
  name: string;
  isFirst: boolean;
  isLast: boolean;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
}

function LegRow({ position, name, isFirst, isLast, onMove, onRemove }: LegRowProps) {
  return (
    <li className="flex items-center justify-between gap-2 py-2">
      <span className="space-y-0.5">
        <span className="block text-caption text-muted-foreground">{text.stop(position)}</span>
        <span className="block text-body-sm font-medium">{name}</span>
      </span>
      <span className="flex items-center gap-1">
        <LegButton
          label={text.moveUp(name)}
          isDisabled={isFirst}
          onClick={() => {
            onMove(-1);
          }}
        >
          <ArrowUp aria-hidden />
        </LegButton>
        <LegButton
          label={text.moveDown(name)}
          isDisabled={isLast}
          onClick={() => {
            onMove(1);
          }}
        >
          <ArrowDown aria-hidden />
        </LegButton>
        <LegButton label={text.remove(name)} isDestructive onClick={onRemove}>
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

function LegList({
  legs,
  rwOptions,
  onChange,
}: {
  legs: readonly RwId[];
  rwOptions: readonly RwOption[];
  onChange: (legs: RwId[]) => void;
}) {
  if (legs.length === 0) return <p className="text-body-sm text-muted-foreground">{text.empty}</p>;
  return (
    <ol className="divide-y divide-border">
      {legs.map((rwId, index) => (
        <LegRow
          key={rwId}
          position={index + 1}
          name={nameOf(rwId, rwOptions)}
          isFirst={index === 0}
          isLast={index === legs.length - 1}
          onMove={(offset) => {
            onChange(moveLeg(legs, index, offset));
          }}
          onRemove={() => {
            onChange(legs.filter((id) => id !== rwId));
          }}
        />
      ))}
    </ol>
  );
}

// docs/PRD.md FR-ADMIN-05 (Task P4.3.05, P4.3.11): a combo's route, the RWs it visits in order, which save_package
// writes as its legs. The superadmin edits it; an RW admin reads it (the form's fieldset is disabled for them).
// combo_legs_on_sale keeps a published combo at two RWs at least, and the schema says so first.
export function ComboLegsEditor({
  control,
  rwOptions,
}: {
  control: PackageControl;
  rwOptions: readonly RwOption[];
}) {
  const { field, fieldState } = useController({ control, name: 'legRwIds' });
  const legs = field.value;
  const remaining = rwOptions.map((option) => option.id).filter((id) => !legs.includes(id));
  const canAdd = remaining.length > 0 && legs.length < PACKAGE_LIMITS.comboLegs;
  return (
    <FormSection title={packagesCopy.sections.legs}>
      <p className="text-body-sm text-muted-foreground">{text.hint}</p>
      <LegList legs={legs} rwOptions={rwOptions} onChange={field.onChange} />
      {canAdd ? (
        <AddLeg
          remaining={remaining}
          rwOptions={rwOptions}
          onAdd={(rwId) => {
            field.onChange([...legs, rwId]);
          }}
        />
      ) : null}
      {fieldState.error?.message ? (
        <p role="alert" className="text-body-sm text-destructive">
          {fieldState.error.message}
        </p>
      ) : null}
    </FormSection>
  );
}
