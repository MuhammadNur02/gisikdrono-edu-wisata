'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { HeadingFields, MediaFields, SeoFields } from '@/components/admin/cms/article-fields';
import { FormAlert } from '@/components/forms/form-alert';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { CMS_PATHS, type ArticleIntent } from '@/config/cms';
import { useActionForm } from '@/hooks/use-action-form';
import { copy } from '@/lib/copy/id';
import { saveArticleSchema, type SaveArticleInput } from '@/lib/validations/article';
import type { ActionResult } from '@/types/action-result';
import type { ArticleAdmin } from '@/types/cms';
import type { ContentOwner } from '@/types/content';

const text = copy.cms.articles;
const common = copy.cms.common;
const FIELDS = [
  'title',
  'slug',
  'excerpt',
  'category',
  'tags',
  'coverPath',
  'bodyJson',
  'seoTitle',
  'seoDescription',
] as const;

export interface ArticleFormProps {
  // The article as it is, or a blank one under the id the page made for it.
  article: SaveArticleInput;
  owner: ContentOwner;
  // The superadmin publishes and unpublishes; an RW admin sends the article for review.
  canPublish: boolean;
  isPublished: boolean;
  action: (values: unknown) => Promise<ActionResult<ArticleAdmin>>;
}

interface SaveButtonsProps extends Pick<ArticleFormProps, 'canPublish' | 'isPublished'> {
  isSubmitting: boolean;
  onIntent: (intent: ArticleIntent) => void;
}

// docs/StyleGuide.md: one primary action, the step that moves the article on; saving as a draft sits beside it. An
// RW admin's published article has no draft step: only the superadmin takes it off the site (finding 1 of the review
// of PR #18), and the change goes for review.
function SaveButtons({ canPublish, isPublished, isSubmitting, onIntent }: SaveButtonsProps) {
  const primary: ArticleIntent = canPublish ? 'publish' : 'review';
  const draftLabel = canPublish && isPublished ? text.unpublish : text.saveDraft;
  const offersDraft = canPublish || !isPublished;
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="submit"
        loading={isSubmitting}
        onClick={() => {
          onIntent(primary);
        }}
      >
        {canPublish ? text.publish : text.submitReview}
      </Button>
      {offersDraft ? (
        <Button
          type="submit"
          variant="outline"
          disabled={isSubmitting}
          onClick={() => {
            onIntent('draft');
          }}
        >
          {draftLabel}
        </Button>
      ) : null}
    </div>
  );
}

// Task P2.9.06, docs/PRD.md FR-ADMIN-11: an article, new or as it is, on its own page.
export function ArticleForm({ article, owner, canPublish, isPublished, action }: ArticleFormProps) {
  const router = useRouter();
  const [initial] = useState(article);
  const form = useForm({ resolver: zodResolver(saveArticleSchema), defaultValues: initial });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: FIELDS,
    onSuccess: (saved) => {
      toast.success(common.saved(`${text.noun} "${saved.title}"`));
      router.push(CMS_PATHS.articles);
      router.refresh();
    },
  });

  return (
    <Form {...form}>
      <div className="max-w-3xl">
        <PostForm onSubmit={submit}>
          {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
          {canPublish ? null : <FormAlert tone="info">{text.reviewNote}</FormAlert>}
          <HeadingFields control={form.control} isSlugLocked={!canPublish && isPublished} />
          <MediaFields control={form.control} owner={owner} articleId={initial.id} />
          <SeoFields control={form.control} />
          <SaveButtons
            canPublish={canPublish}
            isPublished={isPublished}
            isSubmitting={form.formState.isSubmitting}
            onIntent={(intent) => {
              form.setValue('intent', intent);
            }}
          />
        </PostForm>
      </div>
    </Form>
  );
}
