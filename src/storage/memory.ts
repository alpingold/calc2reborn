import { DEFAULT_SETTINGS } from './types'
import type { Attempt, AttemptFilter, CardState, Flag, ProgressSnapshot, ProgressStore, Settings } from './types'
import { SNAPSHOT_VERSION } from './snapshot'
import { filterAttempts } from './filter'

export class MemoryStore implements ProgressStore {
  private cards = new Map<string, CardState>()
  private attempts = new Map<string, Attempt>()
  private settings: Settings | undefined
  private flags = new Map<string, Flag>()

  async getCardState(cardId: string) {
    return this.cards.get(cardId)
  }
  async saveCardState(state: CardState) {
    this.cards.set(state.cardId, state)
  }
  async listCardStates() {
    return [...this.cards.values()]
  }
  async logAttempt(a: Attempt) {
    this.attempts.set(a.id, a)
  }
  async listAttempts(filter?: AttemptFilter) {
    return filterAttempts([...this.attempts.values()], filter)
  }
  async getSettings() {
    return { ...DEFAULT_SETTINGS, ...this.settings }
  }
  async saveSettings(s: Settings) {
    this.settings = s
  }
  async saveFlag(f: Flag) {
    this.flags.set(f.id, f)
  }
  async listFlags() {
    return [...this.flags.values()].sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0))
  }
  async deleteFlag(id: string) {
    this.flags.delete(id)
  }
  async exportAll(): Promise<ProgressSnapshot> {
    return {
      version: SNAPSHOT_VERSION,
      exportedAt: new Date().toISOString(),
      cardStates: await this.listCardStates(),
      attempts: await this.listAttempts(),
      settings: await this.getSettings(),
      flags: await this.listFlags(),
    }
  }
  async importAll(s: ProgressSnapshot) {
    await this.clear()
    s.cardStates.forEach((c) => this.cards.set(c.cardId, c))
    s.attempts.forEach((a) => this.attempts.set(a.id, a))
    this.settings = s.settings
    ;(s.flags ?? []).forEach((f) => this.flags.set(f.id, f))
  }
  async clear() {
    this.cards.clear()
    this.attempts.clear()
    this.settings = undefined
    this.flags.clear()
  }
}
