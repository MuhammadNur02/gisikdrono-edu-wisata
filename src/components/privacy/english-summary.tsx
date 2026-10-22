import { EmailLink, NoticeSection } from '@/components/privacy/privacy-sections';
import { YOUTUBE_PLAYER_HOST, YOUTUBE_STILL_HOST } from '@/config/gallery';
import { GOOGLE_MAPS_HOST, OSM_TILE_HOST } from '@/config/map';
import {
  BACKUP_RETENTION_DAYS,
  BREACH_NOTICE_HOURS,
  DSR_ACKNOWLEDGE_WORKING_DAYS,
  DSR_FULFIL_DAYS,
} from '@/config/privacy';
import { siteConfig } from '@/config/site';

// The one English part of the public site, a recorded exception to CLAUDE.md §12.1 no. 18 (decision of
// 2026-10-18; docs/Security.md §7.6): foreign visitors do come. Every sentence restates a section of the
// Indonesian notice above it and adds nothing; when that text changes, this changes with it, and the
// Indonesian version is the one that applies.

// The third parties of the notice: YouTube in the gallery and the two map providers of the map page.
function SummaryThirdParties() {
  return (
    <>
      <p>
        Gallery videos come from YouTube, owned by Google, a third party outside our processors.
        Google receives your IP address at two moments: when the gallery opens and a video&apos;s
        still loads from {YOUTUBE_STILL_HOST} because staff have not uploaded their own, and when
        you press play and the video plays through {YOUTUBE_PLAYER_HOST}. Before you press play, the
        YouTube player is not loaded.
      </p>
      <p>
        The map page loads its map tiles from {OSM_TILE_HOST}, run by the OpenStreetMap Foundation,
        which receives your IP address when that page opens. The Google Maps frame loads from{' '}
        {GOOGLE_MAPS_HOST} only after you press the button for it, and Google receives your IP
        address then; before that, nothing from Google is loaded.
      </p>
    </>
  );
}

function SummaryData() {
  return (
    <>
      <p>
        {siteConfig.ownerName}, {siteConfig.locality.district}, {siteConfig.locality.city}, runs
        this site and decides what booking data is used for.
      </p>
      <p>
        We keep the name, WhatsApp number and email of the person in charge of the group (anonymised
        24 months after the visit, or after 7 days for an unpaid booking), the institution&apos;s
        name and city (10 years, with the financial records), payment records (10 years), and IP
        address and device type for security (24 months). Daily database backups are kept{' '}
        {BACKUP_RETENTION_DAYS} days, so deleted data can remain in them until then.
      </p>
      <p>
        We never ask for an ID card number or its photo, date of birth, home address, photos of
        participants, participants&apos; phone numbers or email, gender, religion or health data.
        The participant list is optional: only names and classes, sent by the institution after it
        has the consent of parents or guardians. Participant names never appear on public pages and
        are deleted 90 days after the visit, together with participant certificates.
      </p>
      <p>
        Supabase and Vercel (Singapore), Midtrans (Indonesia), Meta WhatsApp and Cloudflare
        Turnstile (outside Indonesia) and Resend (United States) process data for us, under data
        processing agreements and contractual safeguards.
      </p>
      <SummaryThirdParties />
    </>
  );
}

function SummaryRights({ dpoEmail }: { dpoEmail: string | null }) {
  return (
    <>
      <p>
        The booking link sent by WhatsApp lets you view your booking data, correct participant
        names, delete the participant list and withdraw marketing consent. For any other request,
        email the Data Protection Officer
        {dpoEmail ? (
          <>
            {' '}
            at <EmailLink email={dpoEmail} />
          </>
        ) : null}{' '}
        with your booking code and what you are asking for; we confirm it through the WhatsApp
        number or email on the booking, since the booking code alone is not enough. Requests are
        acknowledged within {DSR_ACKNOWLEDGE_WORKING_DAYS} working days and completed within{' '}
        {DSR_FULFIL_DAYS} days. Financial records must be kept 10 years, so a deletion request for
        them is carried out by anonymising them.
      </p>
      <p>
        If a data breach happens, we notify you and the data protection authority within{' '}
        {BREACH_NOTICE_HOURS} hours.
      </p>
    </>
  );
}

export function EnglishSummary({ dpoEmail }: { dpoEmail: string | null }) {
  return (
    <NoticeSection id="summary-in-english" title="Summary in English" lang="en">
      <p className="font-medium">
        This is a summary of the Indonesian notice above. The Indonesian version is the one that
        applies.
      </p>
      <SummaryData />
      <SummaryRights dpoEmail={dpoEmail} />
    </NoticeSection>
  );
}
