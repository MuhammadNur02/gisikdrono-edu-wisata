import { MessageCircle } from 'lucide-react';
import Link from 'next/link';

import { Section } from '@/components/layout/section';
import { Button } from '@/components/ui/button';
import { BOOKING_CTA } from '@/config/nav';
import { siteConfig } from '@/config/site';
import { copy } from '@/lib/copy/id';
import { buildWhatsAppChatUrl } from '@/lib/utils/whatsapp';

export interface CtaBandProps {
  id: string;
}

// docs/StyleGuide.md §5.7: the one brand band of the page, a primary xl button and a white outline one. It
// says how booking works, as docs/PRD.md describes the flow, rather than urging (§1.3 G6).
export function CtaBand({ id }: CtaBandProps) {
  const chatUrl = buildWhatsAppChatUrl(
    siteConfig.whatsappContactNumber,
    copy.layout.whatsAppGreeting(siteConfig.name),
  );
  return (
    <Section
      id={id}
      tone="brand"
      wave={{ variant: 'gentle' }}
      align="center"
      title="Pesan kunjungan untuk rombongan Anda"
      description="Pilih paket, tentukan tanggal dan sesi, lalu bayar lewat QRIS atau virtual account. Tiket QR dikirim ke WhatsApp dan email."
    >
      <div className="flex flex-wrap justify-center gap-3">
        <Button size="xl" asChild>
          <Link href={BOOKING_CTA.href}>{BOOKING_CTA.label}</Link>
        </Button>
        <Button
          size="xl"
          variant="outline"
          asChild
          className="border-white bg-transparent text-white hover:bg-white/10"
        >
          <a href={chatUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden />
            {copy.layout.footerWhatsApp}
          </a>
        </Button>
      </div>
    </Section>
  );
}
