import Dexie from 'dexie'
import type { PromiseExtended, Table } from 'dexie'
import { DEFAULT_SETTINGS } from './types'
import type { Attempt, AttemptFilter, CardState, ProgressSnapshot, ProgressStore, Settings } from './types'
import { SNAPSHOT_VERSION } from './snapshot'
import { filterAttempts } from './filter'

interface SettingsRow extends Settings {
  key: 'settings'
}

export class DexieStore extends Dexie implements ProgressStore {
  cardStates!: Table<CardState, string>
  attempts!: Table<Attempt, string>
  settings!: Table<SettingsRow, string>

  constructor(dbName = 'ma16200-progress') {
    super(dbName)
    this.version(1).stores({
      cardStates: 'cardId',
      attempts: 'id, questionId, timestamp, sessionId, mode',
      settings: 'key',
    })
  }

  // Dexie captures indexedDB when its module loads, so check the live global: when it is gone
  // (private modes, sandboxed frames) open() must reject instead of using a stale reference.
  override open(): PromiseExtended<Dexie> {
    if (typeof globalThis.indexedDB === 'undefined' || globalThis.indexedDB === null) {
      return Dexie.Promise.reject(new Dexie.MissingAPIError('IndexedDB is not available'))
    }
    return super.open()
  }

  getCardState(cardId: string) {
    return this.cardStates.get(cardId)
  }
  async saveCardState(state: CardState) {
    await this.cardStates.put(state)
  }
  listCardStates() {
    return this.cardStates.toArray()
  }
  async logAttempt(a: Attempt) {
    await this.attempts.put(a)
  }
  async listAttempts(filter?: AttemptFilter) {
    return filterAttempts(await this.attempts.toArray(), filter)
  }
  async getSettings(): Promise<Settings> {
    const row = await this.settings.get('settings')
    if (!row) return { ...DEFAULT_SETTINGS }
    const { key: _key, ...rest } = row
    void _key
    return { ...DEFAULT_SETTINGS, ...rest }
  }
  async saveSettings(s: Settings) {
    await this.settings.put({ ...s, key: 'settings' })
  }
  async exportAll(): Promise<ProgressSnapshot> {
    return {
      version: SNAPSHOT_VERSION,
      exportedAt: new Date().toISOString(),
      cardStates: await this.listCardStates(),
      attempts: await this.listAttempts(),
      settings: await this.getSettings(),
    }
  }
  async importAll(s: ProgressSnapshot) {
    await this.transaction('rw', this.cardStates, this.attempts, this.settings, async () => {
      await Promise.all([this.cardStates.clear(), this.attempts.clear(), this.settings.clear()])
      await this.cardStates.bulkAdd(s.cardStates)
      await this.attempts.bulkAdd(s.attempts)
      await this.settings.add({ ...s.settings, key: 'settings' })
    })
  }
  async clear() {
    await this.transaction('rw', this.cardStates, this.attempts, this.settings, async () => {
      await Promise.all([this.cardStates.clear(), this.attempts.clear(), this.settings.clear()])
    })
  }
}
