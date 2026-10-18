'use client';

import { useEditorState, type Editor } from '@tiptap/react';
import {
  Bold,
  Heading2,
  Heading3,
  Heading4,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ARTICLE_HEADING_LEVELS } from '@/config/rich-text';
import { copy } from '@/lib/copy/id';

// The toolbar of the article editor (src/components/forms/rich-text-editor.tsx): a button for each thing an
// article may hold and nothing else, each a 44 px target with its name read out (docs/StyleGuide.md §9).

interface FormatButton {
  key: string;
  label: string;
  icon: LucideIcon;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

const HEADING_ICONS = { 2: Heading2, 3: Heading3, 4: Heading4 } as const;

const FORMAT_BUTTONS: FormatButton[] = [
  {
    key: 'bold',
    label: copy.forms.richText.bold,
    icon: Bold,
    isActive: (editor) => editor.isActive('bold'),
    run: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    key: 'italic',
    label: copy.forms.richText.italic,
    icon: Italic,
    isActive: (editor) => editor.isActive('italic'),
    run: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  ...ARTICLE_HEADING_LEVELS.map((level) => ({
    key: `heading-${String(level)}`,
    label: copy.forms.richText.heading(level),
    icon: HEADING_ICONS[level],
    isActive: (editor: Editor) => editor.isActive('heading', { level }),
    run: (editor: Editor) => editor.chain().focus().toggleHeading({ level }).run(),
  })),
  {
    key: 'bullet-list',
    label: copy.forms.richText.bulletList,
    icon: List,
    isActive: (editor) => editor.isActive('bulletList'),
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    key: 'ordered-list',
    label: copy.forms.richText.orderedList,
    icon: ListOrdered,
    isActive: (editor) => editor.isActive('orderedList'),
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    key: 'blockquote',
    label: copy.forms.richText.blockquote,
    icon: Quote,
    isActive: (editor) => editor.isActive('blockquote'),
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
];

// Which panel is open under the toolbar, if any.
export type RichTextPanel = 'link' | 'image' | null;

interface ToolbarButtonProps {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  // Left out for actions (undo, redo) so only toggles announce a pressed state.
  isPressed?: boolean;
  isDisabled?: boolean;
}

function ToolbarButton({ label, icon, onClick, isPressed, isDisabled }: ToolbarButtonProps) {
  const Icon = icon;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      aria-pressed={isPressed}
      disabled={isDisabled}
      onClick={onClick}
      className="size-11 aria-pressed:bg-secondary aria-pressed:text-secondary-foreground"
    >
      <Icon aria-hidden />
    </Button>
  );
}

function FormatButtons({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => FORMAT_BUTTONS.map((button) => button.isActive(current)),
  });
  return FORMAT_BUTTONS.map((button, index) => (
    <ToolbarButton
      key={button.key}
      label={button.label}
      icon={button.icon}
      isPressed={active[index] ?? false}
      onClick={() => {
        button.run(editor);
      }}
    />
  ));
}

interface ToolbarProps {
  editor: Editor;
  panel: RichTextPanel;
  onPanel: (panel: RichTextPanel) => void;
}

// The link and image buttons open a panel under the toolbar; pressing one again closes it.
function PanelButtons({ editor, panel, onPanel }: ToolbarProps) {
  const isLink = useEditorState({
    editor,
    selector: ({ editor: current }) => current.isActive('link'),
  });
  const toggle = (next: Exclude<RichTextPanel, null>) => () => {
    onPanel(panel === next ? null : next);
  };
  return (
    <>
      <ToolbarButton
        label={copy.forms.richText.link}
        icon={Link2}
        isPressed={isLink || panel === 'link'}
        onClick={toggle('link')}
      />
      <ToolbarButton
        label={copy.forms.richText.image}
        icon={ImagePlus}
        isPressed={panel === 'image'}
        onClick={toggle('image')}
      />
    </>
  );
}

function HistoryButtons({ editor }: { editor: Editor }) {
  const history = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });
  return (
    <>
      <ToolbarButton
        label={copy.forms.richText.undo}
        icon={Undo2}
        isDisabled={!history.canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      />
      <ToolbarButton
        label={copy.forms.richText.redo}
        icon={Redo2}
        isDisabled={!history.canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      />
    </>
  );
}

export function RichTextToolbar(props: ToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label={copy.forms.richText.toolbar}
      className="flex flex-wrap gap-1 border-b border-border p-1"
    >
      <FormatButtons editor={props.editor} />
      <PanelButtons {...props} />
      <HistoryButtons editor={props.editor} />
    </div>
  );
}
