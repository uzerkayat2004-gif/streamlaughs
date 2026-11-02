import { PRODUCT, type Snapshot } from '@laughline/shared';
type Settings = Snapshot['settings'];
import { AppIcon } from './AppIcon';
import { Toggle } from './components';
import { HistoryTransfer } from './HistoryTransfer';
import { SITE_URL } from './site';
import { VersionButton } from './VersionButton';

export function CompactSettings({
  settings,
  change,
  remove,
}: {
  settings: Settings;
  change: (patch: Partial<Settings>) => void;
  remove: () => void;
}) {
  const site = SITE_URL || PRODUCT.siteUrl;
  const streamer = `${site}/dashboard?from=extension`;
  return (
    <div className="compact-settings">
      <label className="sensitivity-row">
        reaction sensitivity
        <select
          aria-label="reaction sensitivity"
          value={settings.sensitivity ?? 'normal'}
          onChange={(e) =>
            change({ sensitivity: e.target.value as Settings['sensitivity'] })
          }
        >
          <option value="strict">strict</option>
          <option value="normal">normal</option>
          <option value="sensitive">sensitive</option>
        </select>
      </label>
      <Toggle
        title="share with the fans"
        detail="anonymous"
        on={settings.share}
        click={() => change({ share: !settings.share })}
      />
      <Toggle
        title="send stream ratings"
        on={settings.sendRatings !== false}
        click={() => change({ sendRatings: settings.sendRatings === false })}
      />
      <p className="settings-privacy">
        Audio stays on your PC. Nothing is recorded.
      </p>
      <a
        className="streamer-link"
        href={streamer}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => {
          e.preventDefault();
          void chrome.tabs.create({ url: streamer });
        }}
      >
        <AppIcon size={14} />
        streamer? see your fans ↗
      </a>
      <HistoryTransfer save />
      <div className="settings-footer">
        <a
          className="textbtn"
          href={`${site}/privacy`}
          target="_blank"
          rel="noreferrer"
        >
          privacy ↗
        </a>
        <button type="button" className="danger" onClick={remove}>
          delete my data
        </button>
      </div>
      <VersionButton />
    </div>
  );
}
