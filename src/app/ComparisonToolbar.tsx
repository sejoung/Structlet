import { useState, type ComponentProps } from 'react';
import { pickTextFile } from '../adapters/files/browser-files';
import { FILE_EXTENSION, parseStructlet } from '../adapters/format/structlet-format';
import { ComparisonDialog } from '../components/comparison/ComparisonDialog';
import { Toolbar } from '../components/Toolbar';
import type { Document } from '../domain';
import type { Appearance, DiagramTheme } from '../engine';
import './comparison.css';

interface Props extends Omit<ComponentProps<typeof Toolbar>, 'onCompare'> {
  document: Document;
  appearance: Appearance;
  canvasTheme: DiagramTheme;
  notify(message: string): void;
}

export function ComparisonToolbar({ document, appearance, canvasTheme, notify, ...toolbar }: Props) {
  const [comparison, setComparison] = useState<{ before: Document; after: Document; fileName: string } | null>(null);
  const { t } = toolbar;
  const compare = async () => {
    try {
      const file = await pickTextFile(FILE_EXTENSION);
      if (!file) return;
      const result = parseStructlet(file.text);
      if (!result.ok) {
        notify(t('compare.invalid'));
        return;
      }
      if (result.document.id !== document.id) {
        notify(t('compare.different'));
        return;
      }
      setComparison({ before: result.document, after: document, fileName: file.name });
    } catch {
      notify(t('compare.invalid'));
    }
  };
  return <>
    <Toolbar {...toolbar} onCompare={() => void compare()} />
    {comparison && <ComparisonDialog {...comparison} appearance={appearance} theme={canvasTheme} t={t} onClose={() => setComparison(null)} />}
  </>;
}
