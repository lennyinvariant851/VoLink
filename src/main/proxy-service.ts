import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import type { AddressInfo } from 'node:net'
import type { ProxyInput, ProxyInstance } from '../shared/types.js'
import { AppStore } from './store.js'

type RunningProxy = {
  server: http.Server | net.Server
  sockets: Set<net.Socket>
  metrics: { connections: number; bytesUp: number; bytesDown: number }
}

export class ProxyService {
  private running = new Map<string, RunningProxy>()

  constructor(private readonly store: AppStore) {}

  async init() {
    const configured = this.store.snapshot().proxies.filter(proxy => proxy.autoStart)
    for (const proxy of configured) await this.start(proxy.id).catch(() => undefined)
  }

  async save(input: ProxyInput) {
    validateProxyInput(input)
    let saved: ProxyInstance | undefined
    await this.store.update(draft => {
      const existing = input.id ? draft.proxies.find(proxy => proxy.id === input.id) : undefined
      if (existing) {
        const status = existing.status
        Object.assign(existing, input, { status })
        saved = structuredClone(existing)
      } else {
        saved = {
          ...input,
          id: crypto.randomUUID(),
          status: 'stopped',
          connections: 0,
          bytesUp: 0,
          bytesDown: 0
        }
        draft.proxies.push(saved)
      }
    })
    await this.store.log('info', 'proxy', `已保存代理 ${saved!.name}`)
    return saved!
  }

  async delete(id: string) {
    if (this.running.has(id)) await this.stop(id)
    const before = this.store.snapshot().proxies.length
    await this.store.update(draft => { draft.proxies = draft.proxies.filter(proxy => proxy.id !== id) })
    return this.store.snapshot().proxies.length < before
  }

  async start(id: string) {
    const config = this.requireProxy(id)
    if (this.running.has(id)) return config
    await this.setStatus(id, 'starting')
    try {
      const runtime = config.protocol === 'http' ? this.createHTTP(config) : this.createSOCKS5(config)
      await new Promise<void>((resolve, reject) => {
        runtime.server.once('error', reject)
        runtime.server.listen(config.listenPort, config.listenHost, () => {
          runtime.server.off('error', reject)
          resolve()
        })
      })
      this.running.set(id, runtime)
      await this.setStatus(id, 'running')
      const address = runtime.server.address() as AddressInfo
      await this.store.log('info', 'proxy', `${config.name} 已启动`, `${address.address}:${address.port} ${config.protocol.toUpperCase()}`)
      return this.requireProxy(id)
    } catch (error) {
      await this.setStatus(id, 'error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async stop(id: string) {
    const runtime = this.running.get(id)
    if (runtime) {
      for (const socket of runtime.sockets) socket.destroy()
      await new Promise<void>(resolve => runtime.server.close(() => resolve()))
      this.running.delete(id)
      await this.flushMetrics(id, runtime)
    }
    await this.setStatus(id, 'stopped')
    await this.store.log('info', 'proxy', `${this.requireProxy(id).name} 已停止`)
    return this.requireProxy(id)
  }

  async shutdown() {
    await Promise.all([...this.running.keys()].map(id => this.stop(id).catch(() => undefined)))
  }

  private createHTTP(config: ProxyInstance): RunningProxy {
    const sockets = new Set<net.Socket>()
    const metrics = { connections: 0, bytesUp: 0, bytesDown: 0 }
    const server = http.createServer((request, response) => {
      if (!authorizeHTTP(request.headers['proxy-authorization'], config)) {
        response.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="VoLink"' })
        response.end('Proxy authentication required')
        return
      }
      let target: URL
      try { target = new URL(request.url ?? '', `http://${request.headers.host ?? ''}`) }
      catch { response.writeHead(400); response.end('Bad request'); return }
      const client = target.protocol === 'https:' ? https : http
      const upstream = client.request({
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        method: request.method,
        path: `${target.pathname}${target.search}`,
        headers: stripProxyHeaders(request.headers),
        localAddress: config.bindAddress || undefined
      }, upstreamResponse => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
        upstreamResponse.on('data', chunk => { metrics.bytesDown += chunk.length })
        upstreamResponse.pipe(response)
      })
      upstream.on('error', error => { if (!response.headersSent) response.writeHead(502); response.end(error.message) })
      request.on('data', chunk => { metrics.bytesUp += chunk.length })
      request.pipe(upstream)
    })
    server.on('connect', (request, clientSocket, head) => {
      if (!authorizeHTTP(request.headers['proxy-authorization'], config)) {
        clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="VoLink"\r\n\r\n')
        clientSocket.destroy()
        return
      }
      const [host, portText] = (request.url ?? '').split(':')
      const upstream = net.connect({ host, port: Number(portText) || 443, localAddress: config.bindAddress || undefined }, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length) upstream.write(head)
        clientSocket.pipe(upstream)
        upstream.pipe(clientSocket)
      })
      clientSocket.on('data', chunk => { metrics.bytesUp += Buffer.byteLength(chunk) })
      trackSocket(upstream, sockets, metrics, 'down')
      upstream.on('error', () => clientSocket.destroy())
    })
    server.on('connection', socket => { metrics.connections += 1; sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
    return { server, sockets, metrics }
  }

  private createSOCKS5(config: ProxyInstance): RunningProxy {
    const sockets = new Set<net.Socket>()
    const metrics = { connections: 0, bytesUp: 0, bytesDown: 0 }
    const server = net.createServer(client => {
      metrics.connections += 1
      sockets.add(client)
      let stage: 'greeting' | 'auth' | 'request' | 'proxy' = 'greeting'
      let pending = Buffer.alloc(0)
      client.on('data', chunk => {
        if (stage === 'proxy') return
        pending = Buffer.concat([pending, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)])
        if (stage === 'greeting') {
          if (pending.length < 2) return
          const methodCount = pending[1]
          if (pending.length < 2 + methodCount) return
          const methods = pending.subarray(2, 2 + methodCount)
          pending = pending.subarray(2 + methodCount)
          const requiresAuth = Boolean(config.username)
          const selected = requiresAuth ? 0x02 : 0x00
          if (!methods.includes(selected)) { client.end(Buffer.from([0x05, 0xff])); return }
          client.write(Buffer.from([0x05, selected]))
          stage = requiresAuth ? 'auth' : 'request'
        }
        if (stage === 'auth') {
          if (pending.length < 2) return
          const userLength = pending[1]
          if (pending.length < 2 + userLength + 1) return
          const passwordLength = pending[2 + userLength]
          if (pending.length < 3 + userLength + passwordLength) return
          const username = pending.subarray(2, 2 + userLength).toString()
          const password = pending.subarray(3 + userLength, 3 + userLength + passwordLength).toString()
          pending = pending.subarray(3 + userLength + passwordLength)
          const accepted = username === config.username && password === (config.password ?? '')
          client.write(Buffer.from([0x01, accepted ? 0x00 : 0x01]))
          if (!accepted) { client.end(); return }
          stage = 'request'
        }
        if (stage === 'request') {
          const parsed = parseSOCKSRequest(pending)
          if (!parsed) return
          pending = pending.subarray(parsed.consumed)
          if (parsed.command !== 0x01) { client.end(Buffer.from([0x05, 0x07, 0, 0x01, 0, 0, 0, 0, 0, 0])); return }
          const upstream = net.connect({ host: parsed.host, port: parsed.port, localAddress: config.bindAddress || undefined }, () => {
            client.write(Buffer.from([0x05, 0x00, 0, 0x01, 0, 0, 0, 0, 0, 0]))
            if (pending.length) upstream.write(pending)
            stage = 'proxy'
            client.pipe(upstream)
            upstream.pipe(client)
          })
          trackSocket(client, sockets, metrics, 'up')
          trackSocket(upstream, sockets, metrics, 'down')
          upstream.on('error', () => { client.write(Buffer.from([0x05, 0x05, 0, 0x01, 0, 0, 0, 0, 0, 0])); client.destroy() })
        }
      })
      client.on('close', () => sockets.delete(client))
      client.on('error', () => client.destroy())
    })
    return { server, sockets, metrics }
  }

  private requireProxy(id: string) {
    const proxy = this.store.snapshot().proxies.find(item => item.id === id)
    if (!proxy) throw new Error('代理实例不存在')
    return proxy
  }

  private async setStatus(id: string, status: ProxyInstance['status'], lastError?: string) {
    await this.store.update(draft => {
      const proxy = draft.proxies.find(item => item.id === id)
      if (!proxy) return
      proxy.status = status
      proxy.lastError = lastError
    })
  }

  private async flushMetrics(id: string, runtime: RunningProxy) {
    await this.store.update(draft => {
      const proxy = draft.proxies.find(item => item.id === id)
      if (!proxy) return
      proxy.connections += runtime.metrics.connections
      proxy.bytesUp += runtime.metrics.bytesUp
      proxy.bytesDown += runtime.metrics.bytesDown
    })
  }
}

function validateProxyInput(input: ProxyInput) {
  if (!input.name.trim()) throw new Error('请输入代理名称')
  if (!Number.isInteger(input.listenPort) || input.listenPort < 1 || input.listenPort > 65535) throw new Error('监听端口不合法')
  if (!['http', 'socks5'].includes(input.protocol)) throw new Error('代理协议不支持')
}

function authorizeHTTP(header: string | undefined, config: ProxyInstance) {
  if (!config.username) return true
  if (!header?.startsWith('Basic ')) return false
  return Buffer.from(header.slice(6), 'base64').toString() === `${config.username}:${config.password ?? ''}`
}

function stripProxyHeaders(headers: http.IncomingHttpHeaders) {
  const next = { ...headers }
  delete next['proxy-authorization']
  delete next['proxy-connection']
  return next
}

function trackSocket(socket: net.Socket, sockets: Set<net.Socket>, metrics: RunningProxy['metrics'], direction: 'up' | 'down') {
  sockets.add(socket)
  socket.on('data', chunk => { if (direction === 'up') metrics.bytesUp += chunk.length; else metrics.bytesDown += chunk.length })
  socket.on('close', () => sockets.delete(socket))
}

function parseSOCKSRequest(buffer: Buffer) {
  if (buffer.length < 7 || buffer[0] !== 0x05) return undefined
  const command = buffer[1]
  const type = buffer[3]
  let host = ''
  let offset = 4
  if (type === 0x01) {
    if (buffer.length < 10) return undefined
    host = [...buffer.subarray(offset, offset + 4)].join('.')
    offset += 4
  } else if (type === 0x03) {
    const length = buffer[offset]
    if (buffer.length < offset + 1 + length + 2) return undefined
    host = buffer.subarray(offset + 1, offset + 1 + length).toString()
    offset += 1 + length
  } else if (type === 0x04) {
    if (buffer.length < 22) return undefined
    const chunks: string[] = []
    for (let index = 0; index < 16; index += 2) chunks.push(buffer.readUInt16BE(offset + index).toString(16))
    host = chunks.join(':')
    offset += 16
  } else return undefined
  if (buffer.length < offset + 2) return undefined
  return { command, host, port: buffer.readUInt16BE(offset), consumed: offset + 2 }
}
