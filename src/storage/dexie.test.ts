import { storeContract } from './storeContract'
import { DexieStore } from './dexie'

storeContract('DexieStore', async () => {
  const s = new DexieStore('test-' + crypto.randomUUID())
  return s
})
