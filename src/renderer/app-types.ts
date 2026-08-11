import type { AppSnapshot } from '../shared/types'

export type MainPage = 'dashboard' | 'devices' | 'proxy' | 'sms' | 'logs' | 'settings'
export type DeviceTab = 'overview' | 'esim' | 'at' | 'ussd' | 'policy' | 'dial' | 'config'
export type RunAction = <T>(task: () => Promise<T>, success?: string) => Promise<T>

export type PageProps = {
  snapshot: AppSnapshot
  busy: boolean
  action: RunAction
  refresh: () => Promise<void>
}
