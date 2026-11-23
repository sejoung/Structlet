import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentStore, Editor, IdGenerator } from '../application';
import { runChecks } from '../adapters/analysis/checks';
import { buildLegend } from '../adapters/catalog/legend';
import { createAppearance, packServices, searchServices, SERVICES, type ServiceDefinition } from '../adapters/catalog/services';
import { summarize, type IconPack } from '../adapters/icon-packs/pack';
import type { IconPackStore } from '../adapters/storage/icon-pack-store';
import type { LocalFileAccess } from '../adapters/files/file-access';
import { CONTAINER_PRESETS, getBox, indexDocument, NODE_SIZE, type AnnotationKind, type ContainerKind, type Document, type Id, type Point } from '../domain';
import { AREA_STROKE, computeDiagramView, layoutDocument, containerAt, fitView, onSurface, screenToWorld, zoomAt, DEFAULT_VIEWPORT, type Viewport } from '../engine';
import { createTranslator, type Language } from '../i18n/messages';
import { Canvas } from '../components/canvas/Canvas';
import { IconPacksDialog } from '../components/IconPacksDialog';
import { Toast } from '../components/Toast';
import { Sidebar, type SidebarTab } from '../components/sidebar/Sidebar';
import type { CanvasTool } from '../components/canvas/use-gestures';
import type { PaletteService } from '../components/sidebar/types';
import { PropertiesPanel, type PanelFinding } from '../components/properties/PropertiesPanel';
import { Toolbar, type ViewMode } from '../components/Toolbar';
import { useSession } from '../components/use-session';
import { createDocumentActions } from './document-actions';
import { createIconPackActions } from './icon-pack-actions';
import { createPanelActions } from './panel-actions';
import { useClipboard } from './use-clipboard';
import { useShortcuts } from './use-shortcuts';
import { useDiagramView } from './use-diagram-view';
import { useTheme } from './use-theme';
import { useAutosave } from './use-autosave';
import { RECENT_KEY, PANELS_KEY, store as storePref, storedPanels, storedRecent, type Panels } from './preferences';
import { useDriveBar } from './drive/use-drive-bar';
import type { DriveServices } from './drive/use-drive';
import { useUsageStats } from './use-usage-stats';
import type { UsageStats } from '../adapters/analytics/google-analytics';
import { log } from '../adapters/diagnostics/log';
import { ConsentBanner } from '../components/drive/DriveDialogs';

const CANVAS_LIGHT = '#eef0f4';
const CANVAS_DARK = '#101318';

interface AppProps {
  editor: Editor;
  store: DocumentStore;
  files: LocalFileAccess;
  packStore: IconPackStore;
  drive?: DriveServices;
  driveWebOnly?: boolean;
  stats?: UsageStats;
  newId: IdGenerator;
  initialLanguage: Language;
  onLanguage(language: Language): void;
}

const toPalette = (language: Language, look: ReturnType<typeof createAppearance>) => (s: ServiceDefinition): PaletteService => ({ id: s.id, name: s.name[language], provider: s.provider, role: s.role, glyph: s.glyph, color: s.color, image: look.service(s.id)?.image });

export function App({ editor, store, files, packStore, drive: driveServices, driveWebOnly = false, stats, newId, initialLanguage, onLanguage }: AppProps) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [editing, setEditing] = useState<Id | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('2d');
  const [tab, setTab] = useState<SidebarTab>('services');
  const [recent, setRecent] = useState<string[]>(storedRecent);
  const [panels, setPanelsState] = useState<Panels>(storedPanels);
  const [tool, setTool] = useState<CanvasTool>('select');
  const [presenting, setPresentingState] = useState(false);
  const setPanels = useCallback((next: Panels) => {
    setPanelsState(next);
    storePref(PANELS_KEY, next);
  }, []);
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const fitOnResize = useRef(false);
  const setPresenting = useCallback((on: boolean) => {
    setPresentingState(on);
    fitOnResize.current = on;
    if (on) log.info('view.presenting');
    if (on) {
      editor.session.select([]);
      setEditing(null);
    }
  }, [editor]);
  useEffect(() => {
    const q = window.matchMedia?.('(max-width: 1100px)');
    if (!q) return;
    const on = (e: MediaQueryListEvent) => e.matches && setPanels({ ...panelsRef.current, right: false });
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, [setPanels]);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const theme = useTheme();
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
  const diagram = useDiagramView(snapshot.document, appearance, t);
  const { scene, optionsFor, fitPending } = diagram;
  const services = useMemo(() => [...SERVICES, ...packServices(packs)].map(toPalette(language, appearance)), [language, appearance, packs]);
  const search = useCallback((q: string) => searchServices(q, packServices(packs)).map(toPalette(language, appearance)), [language, appearance, packs]);
  const findings = useMemo<PanelFinding[]>(() => runChecks(snapshot.committed, (id) => !!appearance.service(id)).map((f) => ({ severity: f.severity, ids: f.ids, message: `${t(`checks.${f.code}`)} · ${label(snapshot.committed, f.ids[0]!)}` })), [snapshot.committed, t]);
  const stageRef = useRef<HTMLElement>(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const viewRef = useRef(view);
  viewRef.current = view;
  const presentingRef = useRef(false);
  const toolRef = useRef<CanvasTool>('select');

  const fitTo = useCallback((doc: Document) => {
    const stage = stageRef.current;
    const s = stage ? { width: stage.clientWidth, height: stage.clientHeight } : sizeRef.current;
    if (s.width === 0 || s.height === 0) return;
    if (s.width !== sizeRef.current.width || s.height !== sizeRef.current.height) setSize(s);
    sizeRef.current = s;
    setViewport(fitView(computeDiagramView(doc, appearance, optionsFor(doc)).bounds, s));
  }, [appearance, optionsFor]);

  const driveUi = useDriveBar({ services: driveServices, webOnly: driveWebOnly, editor, t, language, notify: setNotice, onOpened: fitTo });
  const driveRef = useRef(driveUi.controller);
  driveRef.current = driveUi.controller;
  const usage = useUsageStats(stats);
  const actions = useMemo(
    () =>
      createDocumentActions({
        editor, files, newId, appearance: () => appearanceRef.current, t, notify: setNotice, onOpened: fitTo, view: () => viewRef.current, diagram: optionsFor,
        drive: () => {
          const d = driveRef.current;
          return d ? { beforeReplace: d.beforeReplace, markFresh: d.markFresh, linked: d.linked, saveNow: d.actions.saveNow } : null;
        },
      }),
    [editor, files, newId, t, fitTo, optionsFor],
  );
  const panelActions = useMemo(() => createPanelActions(editor, () => sceneRef.current, language), [editor, language]);

  useEffect(() => {
    if (!fitPending.current && !(fitOnResize.current && presenting)) return;
    fitPending.current = false;
    fitOnResize.current = false;
    fitTo(editor.session.committedDocument);
  }, [size, presenting, fitPending, fitTo, editor, snapshot.committed]);

  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || size.width === 0) return;
    fitted.current = true;
    if (scene.bounds) setViewport(fitView(scene.bounds, size));
  }, [size, scene.bounds]);

  useAutosave(editor, store, snapshot);

  useEffect(() => {
    document.title = `${snapshot.document.title} · Structlet`;
    document.documentElement.lang = language;
  }, [snapshot.document.title, language]);

  presentingRef.current = presenting;
  toolRef.current = tool;

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
    storePref(RECENT_KEY, next);
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
    setTool,
    togglePanels: () => togglePanels(),
    toggleInspector: () => setPanels({ ...panelsRef.current, right: !panelsRef.current.right }),
    presenting: () => presentingRef.current,
    summary: () => diagram.active,
    setPresenting,
    tool: () => toolRef.current,
  });

  const pasteAt = useClipboard({
    summary: () => diagram.active,
    editor,
    pasteParent: () => {
      const sel = editor.session.selected;
      const doc = editor.session.committedDocument;
      if (sel.length === 1 && indexDocument(doc).containers.has(sel[0]!)) return sel[0]!;
      return containerAt(sceneRef.current, screenToWorld(viewport, { x: sizeRef.current.width / 2, y: sizeRef.current.height / 2 }));
    },
    onImportText: (text) => void actions.importText(text),
    onPasteUnavailable: () => setNotice(t('context.pasteUnavailable')),
  });

  const fit = () => fitTo(editor.session.committedDocument);
  const canvasDiagram = { ...diagram, layout: diagram.settings.layout, hasObjects: !!(scene.rects.size || scene.annotations.length),
    layoutAll: (mode: Parameters<typeof layoutDocument>[1]) => {
      editor.applyDocumentLayout(layoutDocument(editor.session.committedDocument, mode));
      diagram.expandAll();
    },
  };
  function togglePanels() {
    const p = panelsRef.current;
    const show = !(p.left || p.right);
    setPanels({ left: show, right: show });
  }

  const onCanvasResize = (next: { width: number; height: number }) => {
    const prev = sizeRef.current;
    if (prev.width > 0 && prev.height > 0 && (prev.width !== next.width || prev.height !== next.height)) {
      setViewport((v) => ({ ...v, panX: v.panX + (next.width - prev.width) / 2, panY: v.panY + (next.height - prev.height) / 2 }));
    }
    sizeRef.current = next;
    setSize(next);
  };

  return (
    <div className={`app${presenting ? ' presenting' : ''}${diagram.active ? ' summary' : ''}`}>
      <Toolbar
        t={t}
        title={snapshot.document.title}
        diagram={canvasDiagram}
        canUndo={snapshot.canUndo}
        canRedo={snapshot.canRedo}
        dirty={snapshot.dirty}
        language={language}
        view={view}
        theme={theme.choice}
        fileName={files.fileName}
        onNew={() => void actions.newDocument()}
        onOpen={() => void actions.open()}
        onImport={() => void actions.importFile()}
        onSave={() => void actions.save()}
        onSaveAs={() => void actions.saveAs()}
        onExportSvg={actions.exportSvg}
        onExportPng={() => void actions.exportPng()}
        onUndo={() => editor.undo()}
        onRedo={() => editor.redo()}
        onTitle={(title) => editor.setTitle(title)}
        onView={(v) => {
          setView(v);
          log.info('view.changed', { view: v });
        }}
        drive={driveUi.bar}
        {...(usage ? { stats: { granted: usage.granted, toggle: usage.toggle } } : {})}
        onTheme={theme.setChoice}
        onIconPacks={() => setPacksOpen(true)}
        leftOpen={panels.left}
        rightOpen={panels.right}
        findingCount={findings.length}
        onLeftPanel={(left) => setPanels({ ...panels, left })}
        onRightPanel={(right) => setPanels({ ...panels, right })}
        onTogglePanels={togglePanels}
        presenting={presenting}
        onPresent={setPresenting}
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
          open={panels.left && !presenting}
          onOpen={(left) => setPanels({ ...panels, left })}
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
        <main ref={stageRef} className="stage"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
          }}
          onDrop={(e) => {
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            void actions.openDroppedFiles(e.dataTransfer.files);
          }}
        >
          <Canvas
            t={t}
            editor={editor}
            snapshot={snapshot}
            scene={scene}
            viewport={viewport}
            setViewport={setViewport}
            onResize={onCanvasResize}
            onDropService={(id, world) => addService(id, world)}
            summary={diagram.active}
            context={{ diagram: canvasDiagram, actions: panelActions, paste: (at) => void pasteAt(at, containerAt(scene, at)) }}
            onToggleArea={(id) => { setEditing(null); editor.session.select([id]); diagram.toggle(id); }}
            editing={editing}
            setEditing={setEditing}
            theme={canvasTheme}
            view={view}
            onFit={fit}
            tool={view === 'isometric' ? 'hand' : tool}
            onTool={setTool}
            presenting={presenting}
          />
          <Toast t={t} message={notice} onDismiss={dismissNotice} />
        </main>
        {panels.right && !presenting && !diagram.active && (
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
        )}
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
      {driveUi.dialogs}
      {usage?.undecided && <ConsentBanner t={t} onChoose={(granted) => usage.choose(granted ? 'granted' : 'denied')} />}
    </div>
  );
}

function label(doc: Document, id: Id): string {
  const index = indexDocument(doc);
  const o = index.nodes.get(id) ?? index.containers.get(id) ?? index.edges.get(id);
  return (o?.label.split('\n')[0] || id).slice(0, 40);
}
