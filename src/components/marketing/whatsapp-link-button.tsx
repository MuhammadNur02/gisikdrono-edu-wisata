import { WhatsAppIcon } from '@/components/layout/whatsapp-icon';
import { Button, type ButtonProps } from '@/components/ui/button';
import { siteConfig } from '@/config/site';
import { buildWhatsAppChatUrl } from '@/lib/utils/whatsapp';

export interface WhatsAppLinkButtonProps {
  // The opening message, already written for the page: the visitor only presses send.
  message: string;
  label: string;
  size?: ButtonProps['size'];
  className?: string;
}

// The inline WhatsApp button of DESIGN-SPEC §2.2 (no shadow, inside panels and states): the darkened WhatsApp green,
// the glyph and the label. The number itself is never written on the page (§0).
export function WhatsAppLinkButton({
  message,
  label,
  size = 'default',
  className,
}: WhatsAppLinkButtonProps) {
  return (
    <Button asChild variant="whatsapp" size={size} className={className}>
      <a
        href={buildWhatsAppChatUrl(siteConfig.whatsappContactNumber, message)}
        target="_blank"
        rel="noopener noreferrer"
      >
        <WhatsAppIcon className="size-4.5" />
        {label}
      </a>
    </Button>
  );
}
