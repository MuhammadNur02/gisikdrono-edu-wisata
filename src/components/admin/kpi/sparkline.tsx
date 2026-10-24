'use client';

import { Area, AreaChart } from 'recharts';

import { AreaGradient, CHART_COLORS } from '@/components/admin/charts/chart-container';
import { useSvgId } from '@/hooks/use-svg-id';
import type { DailyValue } from '@/lib/utils/kpi';

// docs/StyleGuide.md §6.3: 96 × 32, no axes, no tooltip, the --chart-1 gradient, never animated.
const WIDTH = 96;
const HEIGHT = 32;
const MARGIN = { top: 2, right: 0, bottom: 0, left: 0 };
const STROKE_WIDTH = 1.5;

export interface SparklineProps {
  series: DailyValue[];
}

// Decoration next to the figure the card already states, so it is hidden from assistive technology.
export function Sparkline({ series }: SparklineProps) {
  const gradientId = useSvgId('sparkline');
  return (
    <div aria-hidden className="h-8 w-24">
      <AreaChart
        width={WIDTH}
        height={HEIGHT}
        data={series}
        margin={MARGIN}
        accessibilityLayer={false}
      >
        <defs>
          <AreaGradient id={gradientId} />
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={CHART_COLORS.primary}
          strokeWidth={STROKE_WIDTH}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </div>
  );
}
