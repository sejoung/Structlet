import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceAround, AlignStartHorizontal,
  AlignStartVertical, AlignVerticalSpaceAround, ArrowLeftRight, Check, ChevronDown, ChevronRight, CircleHelp, Copy, Download, FileInput,
  FilePlus, FolderOpen, Keyboard, Languages, Layers, LayoutGrid, Link, Lock, LockOpen, Maximize, Minus, Monitor, Moon, Package, Plus,
  Redo2, RotateCcw, Save, Search, Settings, Shapes, SquareDashed, StickyNote, Sun, Trash2, TriangleAlert, Info, Undo2, X, Group, Workflow,
} from 'lucide';
import { GlyphIcon } from '../GlyphIcon';

/** Interface icons (Lucide). Diagram glyphs come from the catalog instead. */
export const ICONS = {
  alignLeft: AlignStartVertical, alignCenter: AlignCenterVertical, alignRight: AlignEndVertical,
  alignTop: AlignStartHorizontal, alignMiddle: AlignCenterHorizontal, alignBottom: AlignEndHorizontal,
  spreadH: AlignHorizontalSpaceAround, spreadV: AlignVerticalSpaceAround, swap: ArrowLeftRight, check: Check,
  chevronDown: ChevronDown, chevronRight: ChevronRight, help: CircleHelp, copy: Copy, download: Download, import: FileInput,
  newFile: FilePlus, open: FolderOpen, keyboard: Keyboard, language: Languages, layers: Layers, grid: LayoutGrid, link: Link,
  lock: Lock, unlock: LockOpen, fit: Maximize, minus: Minus, system: Monitor, moon: Moon, pack: Package, plus: Plus, redo: Redo2,
  reset: RotateCcw, save: Save, search: Search, settings: Settings, services: Shapes, areas: SquareDashed, notes: StickyNote,
  sun: Sun, trash: Trash2, warning: TriangleAlert, info: Info, undo: Undo2, close: X, group: Group, flow: Workflow,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return <GlyphIcon glyph={ICONS[name]} size={size} strokeWidth={1.75} />;
}
