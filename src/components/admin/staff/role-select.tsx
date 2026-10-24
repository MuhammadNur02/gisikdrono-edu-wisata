'use client';

import type {
  Control,
  ControllerRenderProps,
  FieldPathByValue,
  FieldValues,
} from 'react-hook-form';

import { FormField } from '@/components/forms/form-field';
import { FormControl } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { staffCopy } from '@/lib/copy/staff';
import { STAFF_ROLES, type AssignableRole } from '@/lib/validations/staff';

// The role and RW pickers of the invite sheet and the role dialog (Task P4.8.03). FormControl sits around the
// trigger, not the Select root, which renders no element, so the label and the error reach what the officer operates.

type TriggerProps = Pick<ControllerRenderProps<FieldValues, string>, 'ref' | 'onBlur'>;

export interface RwOption {
  id: number;
  name: string;
}

function isAssignableRole(value: string): value is AssignableRole {
  return STAFF_ROLES.some((role) => role === value);
}

function RoleSelect({
  value,
  onChange,
  trigger,
}: {
  value: AssignableRole;
  onChange: (role: AssignableRole) => void;
  trigger: TriggerProps;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (isAssignableRole(next)) onChange(next);
      }}
    >
      <FormControl aria-required>
        <SelectTrigger ref={trigger.ref} onBlur={trigger.onBlur} className="h-11 w-full">
          <SelectValue />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {STAFF_ROLES.map((role) => (
          <SelectItem key={role} value={role} className="min-h-11">
            {staffCopy.roles[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RwSelect({
  value,
  onChange,
  rwUnits,
  placeholder,
  trigger,
}: {
  value: number | null;
  onChange: (rwId: number) => void;
  rwUnits: readonly RwOption[];
  placeholder: string;
  trigger: TriggerProps;
}) {
  return (
    <Select
      value={value === null ? '' : String(value)}
      onValueChange={(next) => {
        onChange(Number(next));
      }}
    >
      <FormControl aria-required>
        <SelectTrigger ref={trigger.ref} onBlur={trigger.onBlur} className="h-11 w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {rwUnits.map((unit) => (
          <SelectItem key={unit.id} value={String(unit.id)} className="min-h-11">
            {unit.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface FieldBase<TValues extends FieldValues, TOutput> {
  control: Control<TValues, unknown, TOutput>;
  label: string;
}

// The role of a form, as a labelled field. Choosing superadmin clears the RW (onSuperadmin), which only an RW admin
// has.
export function RoleField<TValues extends FieldValues, TOutput>({
  control,
  name,
  label,
  onSuperadmin,
}: FieldBase<TValues, TOutput> & {
  name: FieldPathByValue<TValues, AssignableRole>;
  onSuperadmin: () => void;
}) {
  return (
    <FormField
      control={control}
      name={name}
      label={label}
      required
      wrapsOwnControl
      render={(field) => {
        const value = String(field.value);
        return (
          <RoleSelect
            value={isAssignableRole(value) ? value : 'admin_rw'}
            trigger={field}
            onChange={(next) => {
              field.onChange(next);
              if (next === 'superadmin') onSuperadmin();
            }}
          />
        );
      }}
    />
  );
}

export function RwField<TValues extends FieldValues, TOutput>({
  control,
  name,
  label,
  placeholder,
  rwUnits,
}: FieldBase<TValues, TOutput> & {
  name: FieldPathByValue<TValues, number | null>;
  placeholder: string;
  rwUnits: readonly RwOption[];
}) {
  return (
    <FormField
      control={control}
      name={name}
      label={label}
      required
      wrapsOwnControl
      render={(field) => (
        <RwSelect
          value={typeof field.value === 'number' ? field.value : null}
          onChange={field.onChange}
          rwUnits={rwUnits}
          placeholder={placeholder}
          trigger={field}
        />
      )}
    />
  );
}
