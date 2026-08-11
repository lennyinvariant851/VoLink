import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { EsimProfile, EsimProfileInput } from '../shared/types.js'
import { AppStore } from './store.js'
import { DeviceService } from './device-service.js'

const execFileAsync = promisify(execFile)

export class EsimService {
  constructor(private readonly store: AppStore, private readonly devices: DeviceService) {}

  async importProfile(input: EsimProfileInput) {
    const device = this.devices.requireDevice(input.deviceId)
    if (!input.activationCode.trim()) throw new Error('请输入 LPA 激活码')
    if (device.mode === 'serial') {
      await this.runLPAC(input.deviceId, ['profile', 'download', '-a', input.activationCode.trim()], 180_000)
      const refreshed = await this.refresh(input.deviceId)
      const newest = refreshed.at(-1)
      if (newest) return newest
    }
    const now = new Date().toISOString()
    const profile: EsimProfile = {
      id: crypto.randomUUID(),
      deviceId: input.deviceId,
      iccid: input.iccid || randomICCID(),
      name: input.name.trim() || '新 eSIM Profile',
      provider: input.provider.trim() || '未知运营商',
      status: 'disabled',
      activationCode: input.activationCode.trim(),
      createdAt: now,
      updatedAt: now
    }
    await this.store.update(draft => { draft.esimProfiles.push(profile) })
    await this.store.log('info', 'esim', `已导入 ${profile.name}`, `device=${device.name}`)
    return profile
  }

  async refresh(deviceId: string) {
    const device = this.devices.requireDevice(deviceId)
    if (device.mode === 'simulation') return this.store.snapshot().esimProfiles.filter(profile => profile.deviceId === deviceId)
    const data = await this.runLPAC(deviceId, ['profile', 'list'])
    if (!Array.isArray(data)) throw new Error('lpac 未返回有效的 Profile 列表')
    const now = new Date().toISOString()
    const profiles = data.map(item => ({
      id: `${deviceId}-${String(item.iccid)}`,
      deviceId,
      iccid: String(item.iccid ?? ''),
      name: String(item.profileNickname || item.profileName || item.iccid || 'eSIM Profile'),
      provider: String(item.serviceProviderName || '未知运营商'),
      status: String(item.profileState).toLowerCase() === 'enabled' ? 'enabled' as const : 'disabled' as const,
      createdAt: now,
      updatedAt: now
    }))
    await this.store.update(draft => {
      draft.esimProfiles = [...draft.esimProfiles.filter(profile => profile.deviceId !== deviceId), ...profiles]
    })
    return profiles
  }

  async rename(id: string, name: string) {
    const profile = this.requireProfile(id)
    const device = this.devices.requireDevice(profile.deviceId)
    if (device.mode === 'serial') await this.runLPAC(profile.deviceId, ['profile', 'nickname', profile.iccid, name])
    await this.store.update(draft => {
      const target = draft.esimProfiles.find(item => item.id === id)
      if (target) { target.name = name.trim(); target.updatedAt = new Date().toISOString() }
    })
    return this.requireProfile(id)
  }

  async enable(id: string) { return this.setEnabled(id, true) }
  async disable(id: string) { return this.setEnabled(id, false) }

  async delete(id: string) {
    const profile = this.requireProfile(id)
    const device = this.devices.requireDevice(profile.deviceId)
    if (profile.status === 'enabled') throw new Error('请先停用 Profile，再执行删除')
    if (device.mode === 'serial') await this.runLPAC(profile.deviceId, ['profile', 'delete', profile.iccid])
    await this.store.update(draft => { draft.esimProfiles = draft.esimProfiles.filter(item => item.id !== id) })
    await this.store.log('info', 'esim', `已删除 ${profile.name}`)
    return true
  }

  private async setEnabled(id: string, enabled: boolean) {
    const profile = this.requireProfile(id)
    const device = this.devices.requireDevice(profile.deviceId)
    if (device.mode === 'serial') await this.runLPAC(profile.deviceId, ['profile', enabled ? 'enable' : 'disable', profile.iccid])
    await this.store.update(draft => {
      for (const item of draft.esimProfiles.filter(item => item.deviceId === profile.deviceId)) {
        if (enabled && item.id !== id) item.status = 'disabled'
        if (item.id === id) { item.status = enabled ? 'enabled' : 'disabled'; item.updatedAt = new Date().toISOString() }
      }
    })
    await this.store.log('info', 'esim', `${enabled ? '已启用' : '已停用'} ${profile.name}`)
    return this.requireProfile(id)
  }

  private requireProfile(id: string) {
    const profile = this.store.snapshot().esimProfiles.find(item => item.id === id)
    if (!profile) throw new Error('eSIM Profile 不存在')
    return profile
  }

  private async runLPAC(deviceId: string, args: string[], timeout = 60_000) {
    const device = this.devices.requireDevice(deviceId)
    if (!device.serialPath) throw new Error('设备未配置 AT 串口')
    const settings = this.store.snapshot().settings
    const executable = settings.lpacPath.trim() || 'lpac'
    try {
      const { stdout } = await execFileAsync(executable, args, {
        timeout,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        env: {
          ...process.env,
          LPAC_APDU: 'at_csim',
          LPAC_APDU_AT_DEVICE: device.serialPath,
          LPAC_HTTP: 'curl'
        }
      })
      const parsed = JSON.parse(stdout) as { payload?: { code?: number; message?: string; data?: unknown } }
      if (parsed.payload?.code !== 0) throw new Error(parsed.payload?.message || 'lpac 执行失败')
      return parsed.payload.data
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') throw new Error('未找到 lpac.exe，请在设置中配置 lpac 路径')
      throw error
    }
  }
}

function randomICCID() {
  return `89860${Math.floor(Math.random() * 1e14).toString().padStart(14, '0')}`
}
