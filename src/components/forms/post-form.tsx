'use client';

import type { BaseSyntheticEvent, ReactNode } from 'react';

export interface PostFormProps {
  // useActionForm's submit: react-hook-form validates, then the Server Action runs.
  onSubmit: (event?: BaseSyntheticEvent) => Promise<void>;
  children: ReactNode;
}

// The <form> of every form that posts to a Server Action. method="post" matters before the page has hydrated: a
// native submit would otherwise be a GET that puts every field, a password or an authenticator code included, in
// the address bar, the browser history and the server log.
export function PostForm({ onSubmit, children }: PostFormProps) {
  return (
    <form method="post" noValidate className="space-y-5" onSubmit={(event) => void onSubmit(event)}>
      {children}
    </form>
  );
}
