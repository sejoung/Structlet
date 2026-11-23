import type { Translate } from '../../i18n/messages';
import type { IconName } from '../ui/Icon';
import { IconButton } from '../ui/controls';
import type { CanvasTool } from './use-gestures';

const TOOLS: { tool: CanvasTool; icon: IconName; key: string }[] = [
  { tool: 'select', icon: 'pointer', key: 'V' },
  { tool: 'hand', icon: 'hand', key: 'H' },
  { tool: 'connect', icon: 'connector', key: 'C' },
];

export function ToolBar({ t, tool, onTool }: { t: Translate; tool: CanvasTool; onTool(tool: CanvasTool): void }) {
  return (
    <div className="toolbar-float" role="toolbar" aria-label={t('tool.label')} data-testid="tools">
      {TOOLS.map((x) => (
        <IconButton key={x.tool} icon={x.icon} label={`${t(`tool.${x.tool}`)} (${x.key})`} pressed={tool === x.tool} onClick={() => onTool(x.tool)} testId={`tool-${x.tool}`} />
      ))}
    </div>
  );
}
