import { SerialPort } from 'serialport'

type Waiter = {
  pattern: RegExp
  resolve: (value: string) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

export class ATSession {
  private readonly port: SerialPort
  private buffer = ''
  private waiter?: Waiter
  private chain = Promise.resolve<unknown>(undefined)

  constructor(path: string, baudRate = 115200) {
    this.port = new SerialPort({ path, baudRate, autoOpen: false, lock: true })
    this.port.on('data', chunk => {
      this.buffer += chunk.toString('utf8')
      if (this.buffer.length > 128_000) this.buffer = this.buffer.slice(-64_000)
      this.checkWaiter()
    })
    this.port.on('error', error => this.failWaiter(error))
    this.port.on('close', () => this.failWaiter(new Error('串口连接已关闭')))
  }

  async open(timeoutMs = 4000) {
    if (this.port.isOpen) return
    await Promise.race([
      new Promise<void>((resolve, reject) => this.port.open(error => error ? reject(error) : resolve())),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('打开串口超时')), timeoutMs))
    ])
  }

  async command(command: string, timeoutMs = 5000, terminal = /(?:^|\r?\n)(?:OK|ERROR|\+CME ERROR:.*|\+CMS ERROR:.*)(?:\r?\n|$)/m) {
    return this.enqueue(async () => {
      this.buffer = ''
      await this.write(`${command.trim()}\r`)
      const response = await this.waitFor(terminal, timeoutMs)
      if (/(?:^|\n)(?:ERROR|\+CME ERROR|\+CMS ERROR)/m.test(response)) {
        throw new Error(`${command} 执行失败：${cleanResponse(response)}`)
      }
      return cleanResponse(response)
    })
  }

  async commandUntil(command: string, pattern: RegExp, timeoutMs = 30_000) {
    return this.enqueue(async () => {
      this.buffer = ''
      await this.write(`${command.trim()}\r`)
      return cleanResponse(await this.waitFor(pattern, timeoutMs))
    })
  }

  async sendSMS(command: string, payload: string, timeoutMs = 45_000) {
    return this.enqueue(async () => {
      this.buffer = ''
      await this.write(`${command.trim()}\r`)
      await this.waitFor(/>\s*$/m, 7000)
      this.buffer = ''
      await this.write(`${payload}\x1a`)
      const response = await this.waitFor(/(?:\+CMGS:\s*\d+|\+CMS ERROR:.*|ERROR)[\s\S]*(?:OK|ERROR)?/m, timeoutMs)
      if (/ERROR/.test(response)) throw new Error(`短信发送失败：${cleanResponse(response)}`)
      return cleanResponse(response)
    })
  }

  async close() {
    if (!this.port.isOpen) return
    await new Promise<void>(resolve => this.port.close(() => resolve()))
  }

  private enqueue<T>(task: () => Promise<T>) {
    const next = this.chain.then(task, task)
    this.chain = next.catch(() => undefined)
    return next
  }

  private write(value: string) {
    return new Promise<void>((resolve, reject) => {
      this.port.write(value, error => {
        if (error) return reject(error)
        this.port.drain(drainError => drainError ? reject(drainError) : resolve())
      })
    })
  }

  private waitFor(pattern: RegExp, timeoutMs: number) {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = undefined
        reject(new Error(`等待模组响应超时（${timeoutMs}ms）`))
      }, timeoutMs)
      this.waiter = { pattern, resolve, reject, timer }
      this.checkWaiter()
    })
  }

  private checkWaiter() {
    if (!this.waiter || !this.waiter.pattern.test(this.buffer)) return
    const waiter = this.waiter
    this.waiter = undefined
    clearTimeout(waiter.timer)
    waiter.resolve(this.buffer)
  }

  private failWaiter(error: Error) {
    if (!this.waiter) return
    const waiter = this.waiter
    this.waiter = undefined
    clearTimeout(waiter.timer)
    waiter.reject(error)
  }
}

export async function withATSession<T>(path: string, task: (session: ATSession) => Promise<T>) {
  const session = new ATSession(path)
  await session.open()
  try {
    return await task(session)
  } finally {
    await session.close()
  }
}

export function cleanResponse(value: string) {
  return value
    .replace(/\0/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
}
