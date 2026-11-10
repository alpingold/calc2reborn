import Dexie from 'dexie'
import type { PromiseExtended, Table } from 'dexie'
import { DEFAULT_SETTINGS } from './types'
import type {
  Attempt,
  AttemptFilter,
  CardState,
  Flag,
  GuidedResult,
  ProgressSnapshot,
  ProgressStore,
  SessionRecord,
  Settings,
} from './types'
import { SNAPSHOT_VERSION } from './snapshot'
import { filterAttempts } from './filter'

interface SettingsRow extends Settings {
  key: 'settings'
}

export class DexieStore extends Dexie implements ProgressStore {
  cardStates!: Table<CardState, string>
  attempts!: Table<Attempt, string>
  settings!: Table<SettingsRow, string>
  flags!: Table<Flag, string>
  sessions!: Table<SessionRecord, string>
  guided!: Table<GuidedResult, string>

  /**
   * `backfill` turns the attempts already stored into session records. It runs once, when a database
   * from before version 3 is upgraded, so exams taken earlier show up under Past attempts.
   */
  constructor(dbName = 'ma16200-progress', backfill?: (attempts: Attempt[]) => SessionRecord[]) {
    super(dbName)
    this.version(1).stores({
      cardStates: 'cardId',
      attempts: 'id, questionId, timestamp, sessionId, mode',
      settings: 'key',
    })
    // version 2 adds reported problems; existing data is untouched
    this.version(2).stores({ flags: 'id, timestamp' })
    // version 3 adds finished exam sessions and guided-problem results
    this.version(3)
      .stores({ sessions: 'sessionId, finishedAt', guided: 'problemId' })
      .upgrade(async (tx) => {
        if (!backfill) return
        const attempts = await tx.table<Attempt, string>('attempts').toArray()
        await tx.table<SessionRecord, string>('sessions').bulkPut(backfill(attempts))
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
  async saveFlag(f: Flag) {
    await this.flags.put(f)
  }
  listFlags() {
    return this.flags.orderBy('timestamp').toArray()
  }
  async deleteFlag(id: string) {
    await this.flags.delete(id)
  }
  async saveSessionRecord(r: SessionRecord) {
    await this.sessions.put(r)
  }
  listSessionRecords() {
    return this.sessions.orderBy('finishedAt').reverse().toArray()
  }
  async saveGuidedResult(r: GuidedResult) {
    await this.guided.put(r)
  }
  listGuidedResults() {
    return this.guided.toArray()
  }
  private get allTables() {
    return [this.cardStates, this.attempts, this.settings, this.flags, this.sessions, this.guided]
  }
  async exportAll(): Promise<ProgressSnapshot> {
    return {
      version: SNAPSHOT_VERSION,
      exportedAt: new Date().toISOString(),
      cardStates: await this.listCardStates(),
      attempts: await this.listAttempts(),
      settings: await this.getSettings(),
      flags: await this.listFlags(),
      sessions: await this.listSessionRecords(),
      guided: await this.listGuidedResults(),
    }
  }
  async importAll(s: ProgressSnapshot) {
    await this.transaction('rw', this.allTables, async () => {
      await Promise.all(this.allTables.map((t) => t.clear()))
      await this.cardStates.bulkAdd(s.cardStates)
      await this.attempts.bulkAdd(s.attempts)
      await this.settings.add({ ...s.settings, key: 'settings' })
      await this.flags.bulkAdd(s.flags ?? [])
      await this.sessions.bulkAdd(s.sessions ?? [])
      await this.guided.bulkAdd(s.guided ?? [])
    })
  }
  async clear() {
    await this.transaction('rw', this.allTables, async () => {
      await Promise.all(this.allTables.map((t) => t.clear()))
    })
  }
}
