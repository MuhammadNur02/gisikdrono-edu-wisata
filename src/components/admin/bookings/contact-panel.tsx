'use client';

import { Eye } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';

import {
  DetailCard,
  EmptyLine,
  FactList,
  type Fact,
} from '@/components/admin/bookings/booking-detail-parts';
import type { RevealAction } from '@/components/admin/bookings/reveal-contact-dialog';
import { Button } from '@/components/ui/button';
import { bookingsAdminCopy } from '@/lib/copy/bookings-admin';
import type { RevealedContact } from '@/types/booking-admin';

const text = bookingsAdminCopy.contact;

// The dialog and its form load on the first click, outside the page's first load (admin budget).
const RevealContactDialog = dynamic(() =>
  import('@/components/admin/bookings/reveal-contact-dialog').then(
    (module) => module.RevealContactDialog,
  ),
);

export interface MaskedContact {
  phoneMasked: string | null;
  emailMasked: string | null;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  isAnonymised: boolean;
}

function withVerified(value: string | null, isVerified: boolean): string {
  if (value === null) return '—';
  return isVerified ? `${value} (${text.verified})` : value;
}

function maskedFacts(contact: MaskedContact): Fact[] {
  return [
    { label: text.phone, value: withVerified(contact.phoneMasked, contact.isPhoneVerified) },
    { label: text.email, value: withVerified(contact.emailMasked, contact.isEmailVerified) },
  ];
}

function revealedFacts(contact: RevealedContact): Fact[] {
  return [
    { label: text.name, value: contact.picName },
    { label: text.phone, value: contact.picPhone ?? '—' },
    { label: text.email, value: contact.picEmail ?? '—' },
  ];
}

function RevealButton({ onOpen }: { onOpen: () => void }) {
  return (
    <Button type="button" variant="outline" className="min-h-11" onClick={onOpen}>
      <Eye aria-hidden />
      {text.reveal}
    </Button>
  );
}

interface ContactPanelProps {
  bookingId: string;
  contact: MaskedContact;
  revealAction: RevealAction;
}

function RevealableContact({ bookingId, contact, revealAction }: ContactPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [revealed, setRevealed] = useState<RevealedContact | null>(null);
  const close = () => {
    setIsOpen(false);
  };
  return (
    <DetailCard title={text.title} description={revealed ? text.revealedNote : undefined}>
      <div className="space-y-4">
        <FactList facts={revealed ? revealedFacts(revealed) : maskedFacts(contact)} />
        {revealed ? null : (
          <RevealButton
            onOpen={() => {
              setIsOpen(true);
            }}
          />
        )}
      </div>
      {isOpen ? (
        <RevealContactDialog
          bookingId={bookingId}
          action={revealAction}
          onRevealed={(value) => {
            setRevealed(value);
            close();
          }}
          onClose={close}
        />
      ) : null}
    </DetailCard>
  );
}

// docs/StyleGuide.md §6.10 (Task P4.3.02): the masked contact of v_booking_admin, and "Tampilkan kontak", whose answer
// lives in the component's state only, so it is gone once the page is left or reloaded. An anonymised booking has no
// contact left to reveal.
export function ContactPanel(props: ContactPanelProps) {
  if (!props.contact.isAnonymised) return <RevealableContact {...props} />;
  return (
    <DetailCard title={text.title}>
      <EmptyLine>{bookingsAdminCopy.detail.anonymised}</EmptyLine>
    </DetailCard>
  );
}
