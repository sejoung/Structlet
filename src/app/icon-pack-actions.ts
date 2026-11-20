import { buildIconPack, filesFromZip, type PackFile } from '../adapters/icon-packs/build';
import { summarize, type IconPack } from '../adapters/icon-packs/pack';
import { pickFiles } from '../adapters/files/browser-files';
import type { IconPackStore } from '../adapters/storage/icon-pack-store';
import type { PackProviderChoice } from '../components/IconPacksDialog';
import type { Translate } from '../i18n/messages';

interface Deps {
  store: IconPackStore;
  t: Translate;
  notify(message: string): void;
  setPacks(packs: IconPack[]): void;
  setBusy(busy: boolean): void;
  newId(): string;
}

/** Loads an icon pack from a zip or folder the user picks, then stores it in this browser. */
export function createIconPackActions({ store, t, notify, setPacks, setBusy, newId }: Deps) {
  const refresh = async () => setPacks(await store.list());
  return {
    refresh,
    async load(source: 'folder' | 'zip', provider: PackProviderChoice) {
      const picked = await pickFiles(source === 'zip' ? { accept: '.zip,application/zip' } : { directory: true });
      if (!picked) return;
      setBusy(true);
      try {
        const files: PackFile[] = source === 'zip' ? picked.flatMap((f) => filesFromZip(f.data)) : picked;
        const first = picked[0]!.path;
        const name = (source === 'zip' ? first.replace(/\.zip$/i, '') : first.split('/')[0] ?? first).slice(0, 80);
        const result = buildIconPack(files, provider, name, newId());
        if (!result.ok) {
          notify(`${t('packs.failed')}: ${result.error}`);
          return;
        }
        await store.put(result.pack);
        await refresh();
        notify(t('packs.loaded', { name: result.pack.name, matched: summarize(result.pack).matched }));
      } catch (error) {
        notify(`${t('packs.failed')}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setBusy(false);
      }
    },
    async toggle(packs: readonly IconPack[], id: string, enabled: boolean) {
      const pack = packs.find((p) => p.id === id);
      if (!pack) return;
      // Update the view right away; the store write follows.
      setPacks(packs.map((p) => (p.id === id ? { ...p, enabled } : p)));
      await store.put({ ...pack, enabled });
    },
    async remove(id: string) {
      await store.remove(id);
      await refresh();
    },
  };
}
