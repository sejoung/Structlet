import promptEn from '../../samples/ai/structlet/references/prompt-en.md?raw';
import promptKo from '../../samples/ai/structlet/references/prompt-ko.md?raw';
import { compileDraft } from '../adapters/draft/compile';
import { downloadBlob, downloadText } from '../adapters/files/browser-files';
import { FILE_EXTENSION, fileNameFor, MIME_TYPE } from '../adapters/format/structlet-format';
import type { ManualAiActions } from '../components/ManualAiGuide';
import { emptyDocument, type Id } from '../domain';
import type { Language } from '../i18n/messages';

export function createManualAi(language: Language, newId: () => Id, defaultTitle: string): ManualAiActions {
  const prompt = language === 'ko' ? promptKo : promptEn;
  return {
    prompt,
    async copyPrompt() {
      await navigator.clipboard.writeText(prompt);
    },
    downloadPrompt() {
      downloadText(prompt, `structlet-prompt-${language}.md`, 'text/markdown;charset=utf-8');
    },
    async downloadSkill() {
      const { default: archive } = await import('virtual:structlet-skill');
      const bytes = Uint8Array.from(atob(archive), (character) => character.charCodeAt(0));
      downloadBlob(new Blob([bytes], { type: 'application/zip' }), 'structlet-skill.zip');
    },
    compile(input) {
      const result = compileDraft(input, emptyDocument(newId(), defaultTitle));
      if (!result.ok) return result.errors;
      downloadText(result.text, fileNameFor(result.document.title, FILE_EXTENSION), MIME_TYPE);
      return [];
    },
  };
}
