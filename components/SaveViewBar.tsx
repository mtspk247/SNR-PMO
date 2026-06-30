import { Icon } from '@/components/ui';
import type { ListPrefs } from '@/components/ListToolbar';

/** Shared "View changed · Save view / Reset" control. Renders nothing unless the
 *  list's view is dirty or a custom view is saved. Drop into ANY list toolbar so
 *  every module — including pages with a bespoke toolbar — gets the same UX. */
export default function SaveViewBar({ prefs }: { prefs: ListPrefs }) {
  if (!prefs.dirty && !prefs.hasSaved) return null;
  return (
    <div className="inline-flex items-center gap-1.5 h-9 px-2 rounded-lg border border-line bg-surface shrink-0">
      {prefs.dirty ? (<>
        <span className="text-2xs text-muted2 hidden lg:inline">View changed</span>
        <button onClick={prefs.saveView} className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-2xs font-medium text-accentstrong hover:bg-accent/10"><Icon name="ti-device-floppy" className="text-sm" />Save view</button>
        <button onClick={prefs.resetView} title="Discard changes" className="text-2xs text-muted2 hover:text-content px-1">Reset</button>
      </>) : (<>
        <span className="text-2xs text-emerald-600 inline-flex items-center gap-1"><Icon name="ti-bookmark" className="text-sm" />Saved</span>
        <button onClick={prefs.resetView} title="Reset to default" className="text-2xs text-muted2 hover:text-content px-1">Reset</button>
      </>)}
    </div>
  );
}
