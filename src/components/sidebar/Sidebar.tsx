import type { Editor } from '../../application';
import type { AnnotationKind, ContainerKind, Document, Id } from '../../domain';
import type { Appearance } from '../../engine';
import type { Translate } from '../../i18n/messages';
import { Icon, type IconName } from '../ui/Icon';
import { AreasPanel, NotesPanel } from './InsertPanels';
import { LayersPanel } from './LayersPanel';
import { ServicesPanel } from './ServicesPanel';
import type { PaletteService } from './types';

export type SidebarTab = 'services' | 'areas' | 'notes' | 'layers';
const TABS: { id: SidebarTab; icon: IconName }[] = [
  { id: 'services', icon: 'services' },
  { id: 'areas', icon: 'areas' },
  { id: 'notes', icon: 'notes' },
  { id: 'layers', icon: 'layers' },
];

interface Props {
  t: Translate;
  tab: SidebarTab;
  onTab(tab: SidebarTab): void;
  open: boolean;
  onOpen(open: boolean): void;
  editor: Editor;
  doc: Document;
  selection: readonly Id[];
  appearance: Appearance;
  services: readonly PaletteService[];
  search(query: string): readonly PaletteService[];
  recent: readonly string[];
  wrapping: number;
  areaColor(kind: ContainerKind): string;
  onAddService(serviceId: string): void;
  onAddArea(kind: ContainerKind): void;
  onAddNote(kind: AnnotationKind): void;
}

export function Sidebar(props: Props) {
  const { t, tab } = props;
  return (
    <aside className={props.open ? 'sidebar' : 'sidebar collapsed'}>
      <nav className="rail" role="tablist" aria-label={t('rail.label')} aria-orientation="vertical">
        {TABS.map((x) => (
          <button
            type="button"
            key={x.id}
            role="tab"
            aria-selected={props.open && tab === x.id}
            aria-controls="sidebar-panel"
            className="rail-button"
            data-testid={`rail-${x.id}`}
            title={t(`rail.${x.id}`)}
            onClick={() => {
              if (props.open && tab === x.id) props.onOpen(false);
              else {
                props.onTab(x.id);
                props.onOpen(true);
              }
            }}
          >
            <Icon name={x.icon} size={18} />
            <span>{t(`rail.${x.id}`)}</span>
          </button>
        ))}
      </nav>
      {props.open && (
      <div className="panel" id="sidebar-panel" role="tabpanel" aria-label={t(`rail.${tab}`)}>
        <div className="panel-head">
          <h2>{t(`rail.${tab}`)}</h2>
          {tab === 'layers' && <span className="count">{props.doc.nodes.length + props.doc.containers.length}</span>}
        </div>
        {tab === 'services' && <ServicesPanel t={t} services={props.services} search={props.search} recent={props.recent} onAdd={props.onAddService} />}
        {tab === 'areas' && <AreasPanel t={t} glyph={props.appearance.containerGlyph} color={props.areaColor} wrapping={props.wrapping} onAdd={props.onAddArea} />}
        {tab === 'notes' && <NotesPanel t={t} onAdd={props.onAddNote} />}
        {tab === 'layers' && <LayersPanel t={t} editor={props.editor} doc={props.doc} selection={props.selection} appearance={props.appearance} />}
      </div>
      )}
    </aside>
  );
}
