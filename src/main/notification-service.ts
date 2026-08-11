import { Notification } from 'electron'
import nodemailer from 'nodemailer'
import type { NotificationSettings } from '../shared/types.js'

export type NotificationPayload = {
  title: string
  body: string
  event: string
  data?: Record<string, unknown>
}

export async function sendConfiguredNotification(settings: NotificationSettings, payload: NotificationPayload, strict = false) {
  const jobs: Array<{ name: string; run: () => Promise<void> }> = []

  if (settings.desktop && Notification.isSupported()) {
    new Notification({ title: payload.title, body: payload.body.slice(0, 240) }).show()
  }
  if (settings.webhookEnabled && settings.webhookUrl) jobs.push({ name: 'Webhook', run: () => postJson(settings.webhookUrl, { event: payload.event, title: payload.title, body: payload.body, ...payload.data, timestamp: new Date().toISOString() }) })
  if (settings.barkEnabled && settings.barkUrl) jobs.push({ name: 'Bark', run: () => requestOk(`${settings.barkUrl.replace(/\/$/, '')}/${encodeURIComponent(payload.title)}/${encodeURIComponent(payload.body)}`) })
  if (settings.pushPlusEnabled && settings.pushPlusToken) jobs.push({ name: 'PushPlus', run: () => postJson('https://www.pushplus.plus/send', { token: settings.pushPlusToken, title: payload.title, content: payload.body }) })
  if (settings.telegramEnabled && settings.telegramBotToken && settings.telegramChatId) jobs.push({ name: 'Telegram', run: () => postJson(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, { chat_id: settings.telegramChatId, text: `${payload.title}\n${payload.body}` }) })
  if (settings.feishuEnabled && settings.feishuWebhookUrl) jobs.push({ name: 'Feishu', run: () => postJson(settings.feishuWebhookUrl, { msg_type: 'text', content: { text: `${payload.title}\n${payload.body}` } }) })
  if (settings.emailEnabled && settings.emailHost && settings.emailTo) jobs.push({ name: 'Email', run: async () => {
    const transport = nodemailer.createTransport({
      host: settings.emailHost,
      port: settings.emailPort || 465,
      secure: (settings.emailPort || 465) === 465,
      auth: settings.emailUsername ? { user: settings.emailUsername, pass: settings.emailPassword } : undefined
    })
    await transport.sendMail({ from: settings.emailUsername || 'VoLink', to: settings.emailTo, subject: payload.title, text: payload.body })
  } })
  if (settings.qqEnabled && settings.qqAppId && settings.qqAppSecret) jobs.push({ name: 'QQ Bot', run: () => sendQQ(settings, `${payload.title}\n${payload.body}`) })

  const failures: string[] = []
  for (const job of jobs) {
    try { await job.run() } catch (error) { failures.push(`${job.name}: ${error instanceof Error ? error.message : String(error)}`) }
  }
  if (strict && failures.length) throw new Error(failures.join('；'))
  return { sent: jobs.length + (settings.desktop && Notification.isSupported() ? 1 : 0), failures }
}

async function sendQQ(settings: NotificationSettings, content: string) {
  const tokenResponse = await fetch('https://bots.qq.com/app/getAppAccessToken', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ appId: settings.qqAppId, clientSecret: settings.qqAppSecret })
  })
  if (!tokenResponse.ok) throw new Error(`获取令牌失败 HTTP ${tokenResponse.status}`)
  const token = await tokenResponse.json() as { access_token?: string }
  if (!token.access_token) throw new Error('返回中没有 access_token')
  const targets = [
    ...splitTargets(settings.qqGroupIds).map(id => `https://api.sgroup.qq.com/v2/groups/${encodeURIComponent(id)}/messages`),
    ...splitTargets(settings.qqUserIds).map(id => `https://api.sgroup.qq.com/v2/users/${encodeURIComponent(id)}/messages`)
  ]
  if (!targets.length) throw new Error('未填写群或用户 OpenID')
  for (const url of targets) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `QQBot ${token.access_token}`, 'x-union-appid': settings.qqAppId },
      body: JSON.stringify({ content, msg_type: 0 })
    })
    if (!response.ok) throw new Error(`发送失败 HTTP ${response.status}: ${(await response.text()).slice(0, 180)}`)
  }
}

function splitTargets(value: string) { return value.split(/[,，\s]+/).map(item => item.trim()).filter(Boolean) }

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
}

async function requestOk(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
}
