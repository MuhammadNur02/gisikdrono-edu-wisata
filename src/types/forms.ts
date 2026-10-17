// Shapes the form components in src/components/forms take and give back. PII-free except the
// participant row, which only ever travels inside the booking wizard.

// One row of v_session_availability as the SessionPicker needs it; times are Postgres `time` strings.
export interface SessionOption {
  id: string;
  startTime: string;
  endTime: string;
  label: string | null;
  remaining: number;
  capacity: number;
}

// booking_participants.full_name and group_label (docs/PRD.md §8); names only, never NIK or birth dates.
export interface ParticipantRow {
  fullName: string;
  groupLabel: string;
}

// What api/uploads/finalize returns for a public-media image, plus the alt text galleries require.
export interface UploadedImage {
  path: string;
  width: number;
  height: number;
  blurhash: string;
  altText: string;
}
