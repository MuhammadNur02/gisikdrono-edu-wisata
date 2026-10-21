import { z } from 'zod';

import { RW_ID_MAX, RW_ID_MIN } from '@/config/rw';

// An RW's number as a form or request names it, within the range rw_units_id_two_digits allows. Whether that RW
// exists and may be written for is for the guards and RLS to decide, as it always was.
export const rwIdSchema = z.int().min(RW_ID_MIN).max(RW_ID_MAX);
