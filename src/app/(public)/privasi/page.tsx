import type { Metadata } from 'next';

import { Container } from '@/components/layout/container';
import { PageHeader } from '@/components/layout/page-header';
import {
  Breach,
  ChildrenData,
  DataInventory,
  EmailLink,
  NoticeSection,
  NotCollected,
  Processors,
  Rights,
} from '@/components/privacy/privacy-sections';
import { siteConfig } from '@/config/site';
import { getPublicSiteSettings } from '@/lib/queries/settings';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { PUBLIC_PATHS } from '@/lib/utils/paths';
import { formatPhone } from '@/lib/utils/phone';
import type { PublicSiteSettings } from '@/types/settings';

export const revalidate = 3600;

const TITLE = 'Kebijakan privasi';
const DESCRIPTION = `Data apa yang disimpan ${siteConfig.name}, untuk apa, berapa lama, dan bagaimana menggunakan hak Anda atas data itu.`;

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PUBLIC_PATHS.privacy,
});

function Controller({ address }: { address: string | null }) {
  return (
    <NoticeSection id="pengendali" title="Pengendali data">
      <p>
        {siteConfig.ownerName}, {siteConfig.locality.district}, {siteConfig.locality.city},
        mengelola situs ini dan menentukan untuk apa data pemesanan dipakai.
        {address ? ` Alamat kantor: ${address}.` : null}
      </p>
    </NoticeSection>
  );
}

// docs/Security.md §7.6: the Pejabat Pelindungan Data, from site_settings `privacy.dpo_name` and
// `privacy.dpo_email` with the public WhatsApp number. A value the kelurahan has not given yet is left out
// (StyleGuide §6.9); go-live checks #14 and #19 hold the launch until it is.
function DataProtectionOfficer({ settings }: { settings: PublicSiteSettings }) {
  const { dpoName, dpoEmail, contactWhatsappNumber } = settings;
  if (!dpoName && !dpoEmail && !contactWhatsappNumber) return null;
  return (
    <NoticeSection id="pejabat" title="Pejabat Pelindungan Data">
      <ul className="space-y-1">
        {dpoName ? <li className="font-medium">{dpoName}</li> : null}
        {dpoEmail ? (
          <li>
            Email: <EmailLink email={dpoEmail} />
          </li>
        ) : null}
        {contactWhatsappNumber ? <li>WhatsApp: {formatPhone(contactWhatsappNumber)}</li> : null}
      </ul>
    </NoticeSection>
  );
}

// docs/PRD.md FR-PUB-19, Task P2.4.12 (PDP-01). The request form /privasi/permintaan follows once the OTP of P3.4
// exists (Task P3.12.03, decision of 2026-10-18), so this page does not link to it yet; meanwhile `Hak Anda`
// explains the request by email.
export default async function PrivacyPage() {
  const settings = await getPublicSiteSettings();
  return (
    <>
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        breadcrumbs={[]}
        path={PUBLIC_PATHS.privacy}
      />
      <Container width="reading" className="space-y-12 pb-16 md:pb-24">
        <Controller address={settings.kelurahanAddress} />
        <DataProtectionOfficer settings={settings} />
        <DataInventory />
        <NotCollected />
        <ChildrenData />
        <Processors />
        <Rights dpoEmail={settings.dpoEmail} />
        <Breach />
      </Container>
    </>
  );
}
