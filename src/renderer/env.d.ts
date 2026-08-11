import type { VoLinkAPI } from '../shared/types'

declare global {
  interface Window { voLink?: VoLinkAPI }
}

export {}
