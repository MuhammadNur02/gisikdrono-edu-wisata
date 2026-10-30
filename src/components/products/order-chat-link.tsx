import { WhatsAppIcon } from '@/components/layout/whatsapp-icon';
import { Button } from '@/components/ui/button';
import { productDetailCopy as text } from '@/lib/copy/catalogue';

export interface OrderChatLinkProps {
  // The wa.me link with the order message written (buildOrderChatUrl).
  href: string;
  productName: string;
  // The id of a line that says more, such as the variant hint.
  describedBy?: string;
}

// "Pesan via WhatsApp" (docs/PRD.md FR-PUB-13a): a plain link to the Koperasi Merah Putih, no server call. Its
// accessible name starts with the visible label (WCAG 2.5.3). Shared by the server panel and the variant picker.
export function OrderChatLink({ href, productName, describedBy }: OrderChatLinkProps) {
  return (
    <Button asChild variant="whatsapp" size="lg">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={text.orderButtonLabel(productName)}
        aria-describedby={describedBy}
      >
        <WhatsAppIcon className="size-4.5" />
        {text.orderButton}
      </a>
    </Button>
  );
}
