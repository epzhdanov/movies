import { useState } from 'react';
import { MODEL_OPTIONS } from '../config';
import { useLibrary } from '../lib/library';
import { useSession } from '../lib/session';
import { checkKey, refreshFromImdb } from '../lib/ai';
import type { Film } from '../types';
import { Button, Icon, Label, Modal, Spinner, cx, inputClass } from './ui';

export function SettingsDialog({
  onClose,
  notify,
}: {
  onClose: () => void;
  notify: (msg: string, tone?: 'ok' | 'error') => void;
}) {
  const { settings, saveSettings } = useSession();
  const { films, save, needsImport, importSeed } = useLibrary();
  const [key, setKey] = useState(settings.openrouterKey);
  const [showKey, setShowKey] = useState(false);
  const known = MODEL_OPTIONS.some((m) => m.id === settings.model);
  const [model, setModel] = useState(known ? settings.model : 'custom');
  const [customModel, setCustomModel] = useState(known ? '' : settings.model);
  const [webSearch, setWebSearch] = useState(settings.webSearch);
  const [keyStatus, setKeyStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  async function test() {
    setBusy('test');
    try {
      setKeyStatus({ ok: true, msg: await checkKey(key.trim()) });
    } catch (e) {
      setKeyStatus({ ok: false, msg: e instanceof Error ? e.message : 'Check failed' });
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setBusy('save');
    try {
      await saveSettings({
        openrouterKey: key.trim(),
        model: model === 'custom' ? customModel.trim() || MODEL_OPTIONS[0].id : model,
        webSearch,
      });
      notify('Settings saved');
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Saving failed', 'error');
      setBusy(null);
    }
  }

  async function refreshAll() {
    setBusy('refresh');
    const targets = films.filter((f) => f.imdbId);
    const changed: Film[] = [];
    let done = 0;
    const queue = [...targets];
    const worker = async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        const next = await refreshFromImdb(f);
        if (next.imdbRating !== f.imdbRating || next.genres.join() !== f.genres.join() || next.runtime !== f.runtime) changed.push(next);
        setProgress(`${++done} / ${targets.length}`);
      }
    };
    try {
      await Promise.all([worker(), worker(), worker(), worker()]);
      if (changed.length) await save(changed);
      notify(changed.length ? `Updated ${changed.length} films from IMDb` : 'All IMDb ratings are up to date');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Refresh failed', 'error');
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify(films, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `movies-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Modal
      title="Settings"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={Boolean(busy)}>
            {busy === 'save' ? <Spinner /> : <Icon.Check />} Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section className="space-y-3">
          <div>
            <Label
              hint={
                <a className="text-accent hover:underline" href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">
                  get a key
                </a>
              }
            >
              OpenRouter API key
            </Label>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                className={inputClass}
                value={key}
                onChange={(e) => {
                  setKey(e.target.value);
                  setKeyStatus(null);
                }}
                placeholder="sk-or-v1-…"
                autoComplete="off"
                spellCheck={false}
              />
              <Button onClick={() => setShowKey((s) => !s)} title={showKey ? 'Hide' : 'Show'}>
                <Icon.Eye />
              </Button>
              <Button onClick={test} disabled={!key.trim() || Boolean(busy)}>
                {busy === 'test' ? <Spinner /> : 'Test'}
              </Button>
            </div>
            {keyStatus && <p className={cx('mt-1.5 text-[13px]', keyStatus.ok ? 'text-good' : 'text-danger')}>{keyStatus.msg}</p>}
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-faint">
              Stored in your private Firestore document — only your Google account can read it. Tip: set a monthly
              credit limit on the key at OpenRouter.
            </p>
          </div>

          <div>
            <Label>Model</Label>
            <select className={inputClass} value={model} onChange={(e) => setModel(e.target.value)}>
              {MODEL_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              <option value="custom">Other OpenRouter model…</option>
            </select>
            {model === 'custom' && (
              <input
                className={cx(inputClass, 'mt-2')}
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="provider/model-id (must support images)"
              />
            )}
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface-2 p-3">
            <input type="checkbox" checked={webSearch} onChange={(e) => setWebSearch(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
            <span className="text-[13.5px] leading-relaxed">
              <span className="font-medium text-ink">Search the web while identifying</span>
              <br />
              <span className="text-muted">Needed for new releases and obscure titles. Adds about $0.01 per lookup.</span>
            </span>
          </label>
        </section>

        <section className="space-y-2 border-t border-line pt-4">
          <div className="text-[13px] font-medium text-muted">Library</div>
          {needsImport && (
            <Button
              variant="primary"
              disabled={Boolean(busy)}
              onClick={async () => {
                setBusy('import');
                try {
                  await importSeed();
                  notify('Library imported');
                } catch (e) {
                  notify(e instanceof Error ? e.message : 'Import failed', 'error');
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === 'import' ? <Spinner /> : <Icon.Download />} Import the built-in library
            </Button>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={refreshAll} disabled={Boolean(busy) || needsImport}>
              {busy === 'refresh' ? <Spinner /> : <Icon.Refresh />} {progress ?? 'Refresh IMDb ratings'}
            </Button>
            <Button size="sm" onClick={download}>
              <Icon.Download /> Download backup
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
