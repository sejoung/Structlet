import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentStore, Editor, IdGenerator } from '../application';
import { runChecks } from '../adapters/analysis/checks';
import { buildLegend } from '../adapters/catalog/legend';
import { createAppearance, packServices, searchServices, SERVICES, type ServiceDefinition } from '../adapters/catalog/services';
import { summarize, type IconPack } from '../adapters/icon-packs/pack';
import type { IconPackStore } from '../adapters/storage/icon-pack-store';
import type { LocalFileAccess } from '../adapters/files/file-access';
import { CONTAINER_PRESETS, getBox, indexDocument, NODE_SIZE, type AnnotationKind, type ContainerKind, type Document, type Id, type Point } from '../domain';
import { AREA_STROKE, computeScene, containerAt, fitView, onSurface, screenToWorld, zoomAt, DEFAULT_VIEWPORT, type Viewport } from '../engine';
import { createTranslator, type Language } from '../i18n/messages';
import { Canvas } from '../components/canvas/Canvas';
import { IconPacksDialog } from '../components/IconPacksDialog';
import { ShortcutsDialog, Toast } from '../components/Overlays';
import { Sidebar, type SidebarTab } from '../components/sidebar/Sidebar';
import type { PaletteService } from '../components/sidebar/types';
import { PropertiesPanel, type PanelFinding } from '../components/properties/PropertiesPanel';
import { Toolbar, type ViewMode } from '../components/Toolbar';
import { useSession } from '../components/use-session';
import { createDocumentActions } from './document-actions';
import { createIconPackActions } from './icon-pack-actions';
import { createPanelActions } from './panel-actions';
import { useClipboard } from './use-clipboard';
import { useShortcuts } from './use-shortcuts';
import { useTheme } from './use-theme';

/** Canvas surface colors; keep in sync with --canvas in styles.css. */
const CANVAS_LIGHT = '#eef0f4';
const CANVAS_DARK = '#101318';

interface AppProps {
  editor: Editor;
  store: DocumentStore;
  files: LocalFileAccess;
  packStore: IconPackStore;
  newId: IdGenerator;
  initialLanguage: Language;
  onLanguage(language: Language): void;
}

const toPalette = (language: Language, look: ReturnType<typeof createAppearance>) => (s: ServiceDefinition): PaletteService => ({ id: s.id, name: s.name[language], provider: s.provider, role: s.role, glyph: s.glyph, color: s.color, image: look.service(s.id)?.image });

const RECENT_KEY = 'structlet:recent-services';
function storedRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function App({ editor, store, files, packStore, newId, initialLanguage, onLanguage }: AppProps) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [editing, setEditing] = useState<Id | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('2d');
  const [tab, setTab] = useState<SidebarTab>('services');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>(storedRecent);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const theme = useTheme();
  // The canvas is not white: edge label boxes take the canvas color (keep in sync with --canvas in styles.css).
  const canvasTheme = useMemo(() => onSurface(theme.diagram, theme.resolved === 'dark' ? CANVAS_DARK : CANVAS_LIGHT), [theme.diagram, theme.resolved]);
  const snapshot = useSession(editor.session);
  const t = useMemo(() => createTranslator(language), [language]);
  const [packs, setPacks] = useState<IconPack[]>([]);
  const [packsOpen, setPacksOpen] = useState(false);
  const [packsBusy, setPacksBusy] = useState(false);
  const [persistentPacks, setPersistentPacks] = useState(true);
  const appearance = useMemo(() => createAppearance(language, packs), [language, packs]);
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;
  const packActions = useMemo(() => createIconPackActions({ store: packStore, t, notify: setNotice, setPacks, setBusy: setPacksBusy, newId: () => newId('document').replace(/^doc-/, 'pack-') }), [packStore, t, newId]);
  useEffect(() => {
    void packActions.refresh();
    void packStore.persistent().then(setPersistentPacks);
  }, [packActions, packStore]);
  const scene = useMemo(() => computeScene(snapshot.document, appearance), [snapshot.document, appearance]);
  const services = useMemo(() => [...SERVICES, ...packServices(packs)].map(toPalette(language, appearance)), [language, appearance, packs]);
  const search = useCallback((q: string) => searchServices(q, packServices(packs)).map(toPalette(language, appearance)), [language, appearance, packs]);
  const findings = useMemo<PanelFinding[]>(() => runChecks(snapshot.committed, (id) => !!appearance.service(id)).map((f) => ({ severity: f.severity, ids: f.ids, message: `${t(`checks.${f.code}`)} · ${label(snapshot.committed, f.ids[0]!)}` })), [snapshot.committed, t]);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const viewRef = useRef(view);
  viewRef.current = view;

  const fitTo = useCallback((doc: Document) => {
    const s = sizeRef.current;
    if (s.width > 0) setViewport(fitView(computeScene(doc, appearance).bounds, s));
  }, [appearance]);

  const actions = useMemo(
    () => createDocumentActions({ editor, files, newId, appearance: () => appearanceRef.current, t, notify: setNotice, onOpened: fitTo, view: () => viewRef.current }),
    [editor, files, newId, t, fitTo],
  );
  const panelActions = useMemo(() => createPanelActions(editor, () => sceneRef.current, language), [editor, language]);

  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || size.width === 0) return;
    fitted.current = true;
    if (scene.bounds) setViewport(fitView(scene.bounds, size));
  }, [size, scene.bounds]);

  useEffect(() => {
    if (!snapshot.dirty) return;
    const revision = snapshot.revision;
    const timer = setTimeout(() => {
      store.save(editor.session.committedDocument);
      editor.session.markSaved(revision);
    }, 400);
    return () => clearTimeout(timer);
  }, [snapshot.revision, snapshot.dirty, editor, store]);

  useEffect(() => {
    document.title = `${snapshot.document.title} · Structlet`;
    document.documentElement.lang = language;
  }, [snapshot.document.title, language]);

  const viewCenter = (): Point => screenToWorld(viewport, { x: size.width / 2, y: size.height / 2 });

  const freeSpot = (center: Point): Point => {
    let p = center;
    for (let i = 0; i < 40; i++) {
      const taken = scene.nodes.some((n) => Math.abs(n.rect.x + n.rect.width / 2 - p.x) < 24 && Math.abs(n.rect.y + n.rect.height / 2 - p.y) < 24);
      if (!taken) return p;
      p = { x: p.x + NODE_SIZE + 56, y: p.y };
    }
    return p;
  };

  const addService = (serviceId: string, at?: Point) => {
    const name = appearance.service(serviceId)?.name ?? serviceId;
    const center = at ?? freeSpot(viewCenter());
    editor.addService(serviceId, name, center, containerAt(scene, center));
    const next = [serviceId, ...recent.filter((x) => x !== serviceId)].slice(0, 8);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // per-browser convenience only
    }
  };

  const addArea = (kind: ContainerKind) => {
    const boxes = snapshot.selection.filter((id) => getBox(snapshot.document, id));
    if (boxes.length > 0) {
      editor.wrapInArea(boxes, kind, t(`area.${kind}`));
      return;
    }
    const c = viewCenter();
    const rect = { x: Math.round(c.x - 200), y: Math.round(c.y - 140), width: 400, height: 280 };
    editor.addArea(kind, t(`area.${kind}`), rect, containerAt(scene, c));
  };

  const addNote = (kind: AnnotationKind) => {
    const c = viewCenter();
    const text = kind === 'step' ? String(editor.nextStepNumber()) : kind === 'legend' ? buildLegend(snapshot.committed, language) : t('note.textDefault');
    editor.addAnnotation(kind, text, { x: c.x - 40, y: c.y - 12 });
  };

  useShortcuts({
    editor,
    actions,
    fit: () => fitTo(editor.session.committedDocument),
    zoom: (f) => setViewport((v) => zoomAt(v, { x: size.width / 2, y: size.height / 2 }, f)),
    edit: setEditing,
  });

  useClipboard({
    editor,
    pasteParent: () => {
      const sel = editor.session.selected;
      const doc = editor.session.committedDocument;
      if (sel.length === 1 && indexDocument(doc).containers.has(sel[0]!)) return sel[0]!;
      return containerAt(sceneRef.current, screenToWorld(viewport, { x: sizeRef.current.width / 2, y: sizeRef.current.height / 2 }));
    },
    onImportText: (text) => void actions.importText(text),
  });

  const fit = () => fitTo(editor.session.committedDocument);

  return (
    <div className="app">
      <Toolbar
        t={t}
        title={snapshot.document.title}
        canUndo={snapshot.canUndo}
        canRedo={snapshot.canRedo}
        dirty={snapshot.dirty}
        language={language}
        view={view}
        theme={theme.choice}
        fileName={files.fileName}
        onNew={actions.newDocument}
        onOpen={() => void actions.open()}
        onImport={() => void actions.importFile()}
        onSave={() => void actions.save()}
        onSaveAs={() => void actions.saveAs()}
        onExportSvg={actions.exportSvg}
        onExportPng={() => void actions.exportPng()}
        onUndo={() => editor.undo()}
        onRedo={() => editor.redo()}
        onSample={actions.openSample}
        onTitle={(title) => editor.setTitle(title)}
        onView={setView}
        onTheme={theme.setChoice}
        onIconPacks={() => setPacksOpen(true)}
        onShortcuts={() => setShortcutsOpen(true)}
        onLanguage={(l) => {
          setLanguage(l);
          onLanguage(l);
        }}
      />
      <div className="workspace">
        <Sidebar
          t={t}
          tab={tab}
          onTab={setTab}
          editor={editor}
          doc={snapshot.document}
          selection={snapshot.selection}
          appearance={appearance}
          services={services}
          search={search}
          recent={recent}
          wrapping={snapshot.selection.filter((id) => getBox(snapshot.document, id)).length}
          areaColor={(k) => AREA_STROKE[CONTAINER_PRESETS[k].color]!}
          onAddService={(id) => addService(id)}
          onAddArea={addArea}
          onAddNote={addNote}
        />
        <main className="stage">
          <Canvas
            t={t}
            editor={editor}
            snapshot={snapshot}
            scene={scene}
            viewport={viewport}
            setViewport={setViewport}
            onResize={setSize}
            onDropService={(id, world) => addService(id, world)}
            onOpenSample={actions.openSample}
            editing={editing}
            setEditing={setEditing}
            theme={canvasTheme}
            view={view}
            onFit={fit}
          />
          <Toast t={t} message={notice} onDismiss={dismissNotice} />
        </main>
        <PropertiesPanel
          t={t}
          editor={editor}
          snapshot={snapshot}
          scene={scene}
          appearance={appearance}
          services={services}
          findings={findings}
          actions={panelActions}
          onWrap={(ids, kind) => editor.wrapInArea(ids, kind, t(`area.${kind}`))}
        />
      </div>
      {packsOpen && (
        <IconPacksDialog
          t={t}
          packs={packs.map(summarize)}
          persistent={persistentPacks}
          busy={packsBusy}
          onImport={(source, provider) => void packActions.load(source, provider)}
          onToggle={(id, enabled) => void packActions.toggle(packs, id, enabled)}
          onRemove={(id) => void packActions.remove(id)}
          onClose={() => setPacksOpen(false)}
        />
      )}
      {shortcutsOpen && <ShortcutsDialog t={t} onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}

function label(doc: Document, id: Id): string {
  const index = indexDocument(doc);
  const o = index.nodes.get(id) ?? index.containers.get(id) ?? index.edges.get(id);
  return (o?.label.split('\n')[0] || id).slice(0, 40);
}
