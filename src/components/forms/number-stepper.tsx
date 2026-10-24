'use client';

import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import type * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';

export interface NumberStepperProps extends Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'type' | 'min' | 'max' | 'step'
> {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

function clamp(value: number, min: number, max: number | undefined): number {
  return Math.min(Math.max(value, min), max ?? Number.MAX_SAFE_INTEGER);
}

interface StepperRules {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number | undefined;
  step: number;
  onBlur: React.FocusEventHandler<HTMLInputElement> | undefined;
}

// Lets the field be empty or mid-number while typing; the value is settled on blur or a step.
function useStepper({ value, onChange, min, max, step, onBlur }: StepperRules) {
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(String(value));
  }

  function commit(next: number) {
    const settled = clamp(next, min, max);
    setLastValue(settled);
    setText(String(settled));
    onChange(settled);
  }

  function type(raw: string) {
    const digits = raw.replace(/\D/g, '');
    setText(digits);
    const typed = Number(digits);
    if (digits !== '' && typed >= min && typed <= (max ?? Infinity)) {
      setLastValue(typed);
      onChange(typed);
    }
  }

  const stepBy = (direction: 1 | -1) => {
    commit(value + direction * step);
  };
  const fieldProps = {
    value: text,
    onStep: stepBy,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      type(event.target.value);
    },
    onBlur: (event: React.FocusEvent<HTMLInputElement>) => {
      commit(text === '' ? min : Number(text));
      onBlur?.(event);
    },
  };
  return { stepBy, fieldProps };
}

const STEP_BUTTONS = {
  decrease: { icon: Minus, label: copy.forms.stepper.decrease },
  increase: { icon: Plus, label: copy.forms.stepper.increase },
} as const;

function StepButton({
  direction,
  disabled,
  onPress,
}: {
  direction: keyof typeof STEP_BUTTONS;
  disabled: boolean;
  onPress: () => void;
}) {
  const { icon: StepIcon, label } = STEP_BUTTONS[direction];
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-full rounded-none"
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
    >
      <StepIcon aria-hidden />
    </Button>
  );
}

interface StepperFieldProps extends Omit<React.ComponentProps<'input'>, 'min' | 'max'> {
  // The visible text may be mid-edit; aria-valuenow always reports the settled number.
  settledValue: number;
  min: number;
  max: number | undefined;
  onStep: (direction: 1 | -1) => void;
}

// Arrow up and down step the value, as on a native number field.
function StepperField({ settledValue, min, max, onStep, ...props }: StepperFieldProps) {
  return (
    <Input
      role="spinbutton"
      inputMode="numeric"
      aria-valuenow={settledValue}
      aria-valuemin={min}
      aria-valuemax={max}
      className="h-full w-12 rounded-none border-0 bg-transparent px-0 text-center font-semibold tabular-nums focus-visible:ring-0"
      onKeyDown={(event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        onStep(event.key === 'ArrowUp' ? 1 : -1);
      }}
      {...props}
    />
  );
}

// docs/StyleGuide.md §5.6 (DESIGN-SPEC §2.4): one 44 px box, − / value / + with 44 px buttons for pax and add-on quantities. The middle
// field is a real spinbutton, so keyboards and screen readers work as they would on a native one.
export function NumberStepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  className,
  onBlur,
  ...props
}: NumberStepperProps) {
  const { stepBy, fieldProps } = useStepper({ value, onChange, min, max, step, onBlur });

  return (
    <div
      className={cn(
        'inline-flex h-11 items-stretch overflow-hidden rounded-md border border-input bg-card transition-colors duration-120 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring',
        className,
      )}
    >
      <StepButton
        direction="decrease"
        disabled={value <= min}
        onPress={() => {
          stepBy(-1);
        }}
      />
      <StepperField settledValue={value} min={min} max={max} {...fieldProps} {...props} />
      <StepButton
        direction="increase"
        disabled={max !== undefined && value >= max}
        onPress={() => {
          stepBy(1);
        }}
      />
    </div>
  );
}
