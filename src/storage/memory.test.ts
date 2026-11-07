import { storeContract } from './storeContract'
import { MemoryStore } from './memory'

storeContract('MemoryStore', async () => new MemoryStore())
