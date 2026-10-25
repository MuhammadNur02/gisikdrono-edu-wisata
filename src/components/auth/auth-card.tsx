import type { ReactNode } from 'react';

export interface AuthCardProps {
  title: string;
  description?: string;
  children: ReactNode;
}

const TITLE_ID = 'auth-title';

// The frame of every sign-in page: one centred card. Below sm the card drops its frame and padding, so the form keeps
// the 300 px the Turnstile widget needs on a 360 px phone.
export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <section
      aria-labelledby={TITLE_ID}
      className="space-y-6 sm:rounded-2xl sm:border sm:border-border sm:bg-card sm:p-8 sm:shadow-panel"
    >
      <header className="space-y-2">
        <h1 id={TITLE_ID} className="text-h2 text-balance">
          {title}
        </h1>
        {description ? <p className="text-body text-pretty text-ink-2">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}
