import 'server-only';

import { render } from 'react-email';

import { NotificationEmail } from '@/lib/email/notification-email';
import { isStaffTemplate, messageLines } from '@/lib/notifications/message-text';
import type { OutgoingMessage } from '@/lib/notifications/types';

// The HTML body of an outbox email (Task P3.11.04), sent beside its plain-text twin so every client reads it.
export function renderNotificationHtml(message: OutgoingMessage): Promise<string> {
  const { subject, lines } = messageLines(message);
  return render(
    <NotificationEmail
      subject={subject}
      lines={lines}
      linkUrl={message.link?.url ?? null}
      isForVisitor={!isStaffTemplate(message.template)}
    />,
  );
}
