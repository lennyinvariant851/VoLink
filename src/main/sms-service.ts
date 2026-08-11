import type { SmsMessage } from '../shared/types.js'
import { AppStore } from './store.js'
import { DeviceService } from './device-service.js'
import { withATSession } from './at-channel.js'
import { sendConfiguredNotification } from './notification-service.js'

export class SMSService {
  constructor(private readonly store: AppStore, private readonly devices: DeviceService) {}

  async send(deviceId: string, recipient: string, body: string) {
    const device = this.devices.requireDevice(deviceId)
    const cleanRecipient = recipient.replace(/\s/g, '')
    if (!/^\+?\d{3,20}$/.test(cleanRecipient)) throw new Error('收件号码格式不正确')
    if (!body.trim()) throw new Error('短信内容不能为空')

    const message: SmsMessage = {
      id: crypto.randomUUID(),
      deviceId,
      sender: '',
      recipient: cleanRecipient,
      body: body.trim(),
      direction: 'outbound',
      status: 'queued',
      timestamp: new Date().toISOString()
    }
    await this.store.update(draft => { draft.messages.unshift(message) })

    try {
      if (device.mode !== 'simulation') {
        if (!device.serialPath) throw new Error('设备未配置串口')
        await withATSession(device.serialPath, async session => {
          const useUCS2 = /[^\x00-\x7f]/.test(body)
          await session.command('AT+CMGF=1')
          await session.command(useUCS2 ? 'AT+CSCS="UCS2"' : 'AT+CSCS="GSM"')
          const target = useUCS2 ? encodeUCS2(cleanRecipient) : cleanRecipient
          const payload = useUCS2 ? encodeUCS2(body) : body
          await session.sendSMS(`AT+CMGS="${target}"`, payload)
        })
      }
      message.status = 'sent'
      await this.store.update(draft => {
        const target = draft.messages.find(item => item.id === message.id)
        if (target) target.status = 'sent'
      })
      await this.store.log('info', 'sms', `短信已发送至 ${cleanRecipient}`, `device=${device.name}`)
    } catch (error) {
      message.status = 'failed'
      await this.store.update(draft => {
        const target = draft.messages.find(item => item.id === message.id)
        if (target) target.status = 'failed'
      })
      await this.store.log('error', 'sms', `短信发送失败：${cleanRecipient}`, error instanceof Error ? error.message : String(error))
      throw error
    }
    return message
  }

  async refresh(deviceId: string) {
    const device = this.devices.requireDevice(deviceId)
    if (device.mode === 'simulation') return this.store.snapshot().messages.filter(message => message.deviceId === deviceId)
    if (!device.serialPath) throw new Error('设备未配置串口')

    const response = await withATSession(device.serialPath, async session => {
      await session.command('AT+CMGF=1')
      await session.command('AT+CSCS="GSM"').catch(() => undefined)
      return session.command('AT+CMGL="ALL"', 15_000)
    })
    const received = parseTextModeSMS(response, deviceId)
    const existing = this.store.snapshot().messages
    const knownIndexes = new Set(existing.filter(item => item.deviceId === deviceId && item.modemIndex !== undefined).map(item => item.modemIndex))
    const fresh = received.filter(item => !knownIndexes.has(item.modemIndex))
    if (fresh.length) {
      await this.store.update(draft => { draft.messages.unshift(...fresh) })
      await this.notify(fresh)
      await this.store.log('info', 'sms', `收到 ${fresh.length} 条新短信`, `device=${device.name}`)
    }
    return this.store.snapshot().messages.filter(message => message.deviceId === deviceId)
  }

  async delete(id: string) {
    const message = this.store.snapshot().messages.find(item => item.id === id)
    if (!message) return false
    const device = this.devices.requireDevice(message.deviceId)
    if (message.modemIndex !== undefined && device.mode === 'serial' && device.serialPath) {
      await withATSession(device.serialPath, session => session.command(`AT+CMGD=${message.modemIndex}`, 5000)).catch(() => undefined)
    }
    await this.store.update(draft => { draft.messages = draft.messages.filter(item => item.id !== id) })
    return true
  }

  private async notify(messages: SmsMessage[]) {
    const settings = this.store.snapshot().settings.notifications
    for (const message of messages) {
      const result = await sendConfiguredNotification(settings, {
        title: `VoLink 新短信 · ${message.sender}`,
        body: message.body,
        event: 'sms.received',
        data: { sender: message.sender, timestamp: message.timestamp }
      })
      if (result.failures.length) await this.store.log('warn', 'notify', '部分通知通道发送失败', result.failures.join('；'))
    }
  }
}

function parseTextModeSMS(response: string, deviceId: string) {
  const lines = response.split('\n')
  const messages: SmsMessage[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index].match(/^\+CMGL:\s*(\d+),"([^"]*)","([^"]*)"(?:,"[^"]*")?(?:,"([^"]*)")?/)
    if (!header) continue
    const body = decodeUCS2(lines[index + 1] ?? '')
    messages.push({
      id: crypto.randomUUID(), deviceId, sender: decodeUCS2(header[3]), recipient: '', body,
      direction: 'inbound', status: 'received', timestamp: normalizeTimestamp(header[4]), unread: true,
      modemIndex: Number(header[1])
    })
  }
  return messages
}

function encodeUCS2(value: string) {
  return [...value].map(character => character.charCodeAt(0).toString(16).padStart(4, '0')).join('').toUpperCase()
}

function decodeUCS2(value: string) {
  const trimmed = value.trim()
  if (!/^[0-9A-F]+$/i.test(trimmed) || trimmed.length % 4 !== 0) return trimmed
  let result = ''
  for (let index = 0; index < trimmed.length; index += 4) result += String.fromCharCode(Number.parseInt(trimmed.slice(index, index + 4), 16))
  return result
}

function normalizeTimestamp(value?: string) {
  if (!value) return new Date().toISOString()
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{2}),(\d{2}):(\d{2}):(\d{2})/)
  if (!match) return new Date().toISOString()
  return new Date(2000 + Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6])).toISOString()
}
