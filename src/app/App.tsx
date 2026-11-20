import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentStore, Editor, IdGenerator } from '../application';
import { runChecks } from '../adapters/analysis/checks';
import { buildLegend } from '../adapters/catalog/legend';
import { createAppearance, searchServices, SERVICES, type ServiceDefinition } from '../adapters/catalog/services';
import type { LocalFileAccess } from '../adapters/files/file-access';
import { CONTAINER_PRESETS, getBox, indexDocument, NODE_SIZE, type AnnotationKind, type ContainerKind, type Document, type Id, type Point } from '../domain';
import { AREA_STROKE, computeScene, containerAt, fitView, screenToWorld, zoomAt, DEFAULT_VIEWPORT, type Viewport } from '../engine';
import { createTranslator, type Language } from '../i18n/messages';
import { Canvas } from '../components/canvas/Canvas';
import { Palette, type PaletteService } from '../components/Palette';
import { PropertiesPanel, type PanelFinding } from '../components/properties/PropertiesPanel';
import { StatusBar } from '../components/StatusBar';
import { Toolbar, type ViewMode } from '../components/Toolbar';
import { useSession } from '../components/use-session';
import { createDocumentActions } from './document-actions';
import { createPanelActions } from './panel-actions';
import { useClipboard } from './use-clipboard';
import { useShortcuts } from './use-shortcuts';
import { useTheme } from './use-theme';

interface AppProps {
  editor: Editor;
  store: DocumentStore;
  files: LocalFileAccess;
  newId: IdGenerator;
  initialLanguage: Language;
  onLanguage(language: Language): void;
}

const toPalette = (language: Language) => (s: ServiceDefinition): PaletteService => ({ id: s.id, name: s.name[language], category: s.category, glyph: s.glyph, color: s.color });

export function App({ editor, store, files, newId, initialLanguage, onLanguage }: AppProps) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [editing, setEditing] = useState<Id | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('2d');
  const theme = useTheme();
  const snapshot = useSession(editor.session);
  const t = useMemo(() => createTranslator(language), [language]);
  const appearance = useMemo(() => createAppearance(language), [language]);
  const scene = useMemo(() => computeScene(snapshot.document, appearance), [snapshot.document, appearance]);
  const services = useMemo(() => SERVICES.map(toPalette(language)), [language]);
  const search = useCallback((q: string) => searchServices(q).map(toPalette(language)), [language]);
  const findings = useMemo<PanelFinding[]>(() => runChecks(snapshot.committed).map((f) => ({ severity: f.severity, ids: f.ids, message: `${t(`checks.${f.code}`)} · ${label(snapshot.committed, f.ids[0]!)}` })), [snapshot.committed, t]);
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
    () => createDocumentActions({ editor, files, newId, language, t, notify: setNotice, onOpened: fitTo, view: () => viewRef.current }),
    [editor, files, newId, language, t, fitTo],
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
    const def = SERVICES.find((s) => s.id === serviceId);
    const center = at ?? freeSpot(viewCenter());
    editor.addService(serviceId, def ? def.name[language] : serviceId, center, containerAt(scene, center));
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

  return (
    <div className="app">
      <Toolbar
        t={t}
        title={snapshot.document.title}
        canUndo={snapshot.canUndo}
        canRedo={snapshot.canRedo}
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
        onFit={() => fitTo(editor.session.committedDocument)}
        onSample={actions.openSample}
        onTitle={(title) => editor.setTitle(title)}
        onView={setView}
        onTheme={theme.setChoice}
        onLanguage={(l) => {
          setLanguage(l);
          onLanguage(l);
        }}
      />
      <div className="workspace">
        <Palette
          t={t}
          search={search}
          containerGlyph={appearance.containerGlyph}
          areaColor={(k) => AREA_STROKE[CONTAINER_PRESETS[k].color]!}
          wrapping={snapshot.selection.some((id) => getBox(snapshot.document, id))}
          onAddService={(id) => addService(id)}
          onAddArea={addArea}
          onAddNote={addNote}
        />
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
          theme={theme.diagram}
          view={view}
        />
        <PropertiesPanel
          t={t}
          editor={editor}
          snapshot={snapshot}
          scene={scene}
          services={services}
          findings={findings}
          actions={panelActions}
          onWrap={(ids, kind) => editor.wrapInArea(ids, kind, t(`area.${kind}`))}
        />
      </div>
      <StatusBar t={t} zoom={viewport.zoom} dirty={snapshot.dirty} notice={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}

function label(doc: Document, id: Id): string {
  const index = indexDocument(doc);
  const o = index.nodes.get(id) ?? index.containers.get(id) ?? index.edges.get(id);
  return (o?.label.split('\n')[0] || id).slice(0, 40);
}
