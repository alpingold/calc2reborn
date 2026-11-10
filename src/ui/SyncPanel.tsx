import { useState } from 'react'
import type { FormEvent } from 'react'
import { formatCode } from '../sync/code'
import type { SyncValue } from '../sync/context'
import type { SyncFailure } from '../sync/engine'

const FAILURES: Record<SyncFailure, string> = {
  offline: 'Could not reach the server. Check the connection; sync will try again.',
  unavailable: 'Sync is not available right now. Progress is still saved on this device.',
  'not-found': 'No progress is stored under that code. Check it against the other device.',
  unreadable: 'The synced copy could not be read, so nothing was changed.',
  'too-large': 'This progress is too large to sync.',
  busy: 'Another device was syncing at the same moment. Try again.',
}

function when(iso: string): string {
  const d = new Date(iso)
  const today = d.toDateString() === new Date().toDateString()
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return today ? `today at ${time}` : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${time}`
}

/** Settings: turn sync on, join another device's code, or see the code and status once it is on. */
export function SyncPanel({ sync }: { sync: SyncValue }) {
  const [entered, setEntered] = useState('')
  const [copied, setCopied] = useState(false)

  async function onJoin(e: FormEvent) {
    e.preventDefault()
    if (await sync.join(entered)) setEntered('')
  }

  async function onCopy() {
    if (!sync.code) return
    try {
      await navigator.clipboard.writeText(formatCode(sync.code))
      setCopied(true)
    } catch {
      // the code is on screen to copy by hand
    }
  }

  function onStop() {
    if (!window.confirm('Stop syncing on this device? Your progress stays here, and your other devices keep syncing.')) return
    sync.stop()
  }

  const failure = sync.error && <p role="alert">{FAILURES[sync.error]}</p>

  if (!sync.code) {
    return (
      <section className="settings-group sync-panel">
        <h3>Sync across devices</h3>
        <p className="panel-hint">
          Keep the same progress on a phone and a laptop. This device gets a code, and the other device enters it. Your
          progress is then also kept on the app's server under that code, with nothing that says who you are. Anyone
          who has the code can read and change it, so keep it to yourself.
        </p>
        <div className="actions">
          <button type="button" disabled={sync.busy} onClick={() => void sync.start()}>
            Turn on sync
          </button>
        </div>
        <form className="sync-join" onSubmit={onJoin}>
          <label>
            Code from another device
            <input
              type="text"
              value={entered}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              onChange={(e) => setEntered(e.target.value)}
            />
          </label>
          <button type="submit" disabled={sync.busy || entered.trim() === ''}>
            Connect
          </button>
        </form>
        {sync.busy && <p role="status">Syncing</p>}
        {failure}
      </section>
    )
  }

  return (
    <section className="settings-group sync-panel">
      <h3>Sync across devices</h3>
      <p className="sync-code-label">Your sync code</p>
      <p className="sync-code">
        <code>{formatCode(sync.code)}</code>
        <button type="button" onClick={() => void onCopy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </p>
      <p className="panel-hint">
        Enter this code under Settings on your other device. Anyone who has it can read and change your progress, so
        keep it to yourself.
      </p>
      <p role="status" className="sync-status">
        {sync.busy ? 'Syncing' : sync.lastSyncedAt ? `Last synced ${when(sync.lastSyncedAt)}` : 'Not synced yet'}
      </p>
      {failure}
      <div className="actions">
        <button type="button" disabled={sync.busy} onClick={() => void sync.syncNow()}>
          Sync now
        </button>
        <button type="button" onClick={onStop}>
          Stop syncing on this device
        </button>
      </div>
    </section>
  )
}
