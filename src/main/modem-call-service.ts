import { SerialPort } from 'serialport'
import type { CallLog, CallState } from '../shared/types.js'
import { AppStore } from './store.js'
import { DeviceService } from './device-service.js'

const PHONE_PATTERN = /^\+?[0-9*#]{3,20}$/

export class ModemCallService {
  private state: CallState = 'idle'
  private activePort?: SerialPort
  private activeCall?: CallLog

  constructor(private readonly store: AppStore, private readonly devices: DeviceService) {}

  async dial(deviceId: string, number: string) {
    const normalized = number.replace(/\s/g, '')
    if (!PHONE_PATTERN.test(normalized)) throw new Error('请输入有效的电话号码')
    if (this.state === 'dialing' || this.state === 'active') throw new Error('已有通话正在进行')
    const device = this.devices.requireDevice(deviceId)
    if (!device.capabilities.voice) throw new Error('当前设备不支持语音通话')
    this.state = 'dialing'
    this.activeCall = {
      id: crypto.randomUUID(),
      number: normalized,
      deviceId,
      modem: device.name,
      startedAt: new Date().toISOString(),
      duration: '00:00',
      direction: 'outbound',
      status: 'active'
    }
    await this.store.update(draft => { draft.calls.unshift(this.activeCall!) })

    try {
      if (device.mode === 'serial') {
        if (!device.serialPath) throw new Error('设备未配置语音 AT 串口')
        this.activePort = new SerialPort({ path: device.serialPath, baudRate: 115200, autoOpen: false, lock: true })
        await Promise.race([
          new Promise<void>((resolve, reject) => this.activePort!.open(error => error ? reject(error) : resolve())),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('打开语音串口超时')), 5000))
        ])
        this.activePort.on('data', chunk => {
          const response = chunk.toString('utf8')
          if (/NO CARRIER|BUSY|NO ANSWER/i.test(response)) void this.finishCall(response.trim() || 'NO CARRIER')
        })
        await this.write(`ATD${normalized};\r`)
      }
      this.state = 'active'
      await this.store.log('info', 'call', `正在呼叫 ${normalized}`, `device=${device.name}`)
      return { state: this.state, number: normalized, transport: device.mode === 'simulation' ? 'simulator' : 'at-command' }
    } catch (error) {
      this.state = 'error'
      await this.finishCall('dial failed', true)
      throw new Error(`拨号失败：${error instanceof Error ? error.message : '串口不可用'}`)
    }
  }

  async hangup() {
    if (this.activePort?.isOpen) await this.write('ATH\r').catch(() => undefined)
    await this.finishCall('hangup')
    this.state = 'ended'
    return { state: this.state }
  }

  status() { return this.state }

  private async finishCall(reason: string, failed = false) {
    this.state = failed ? 'error' : 'ended'
    if (this.activePort?.isOpen) await new Promise<void>(resolve => this.activePort!.close(() => resolve()))
    this.activePort = undefined
    if (!this.activeCall) return
    const endedAt = new Date()
    const seconds = Math.max(0, Math.floor((endedAt.getTime() - new Date(this.activeCall.startedAt).getTime()) / 1000))
    const duration = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    const callId = this.activeCall.id
    await this.store.update(draft => {
      const call = draft.calls.find(item => item.id === callId)
      if (!call) return
      call.endedAt = endedAt.toISOString()
      call.duration = duration
      call.status = failed ? 'failed' : 'completed'
    })
    await this.store.log(failed ? 'error' : 'info', 'call', `通话结束：${this.activeCall.number}`, `${duration} · ${reason}`)
    this.activeCall = undefined
  }

  private write(command: string) {
    return new Promise<void>((resolve, reject) => this.activePort?.write(command, error => error ? reject(error) : resolve()))
  }
}
