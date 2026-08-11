import { useCallback, useEffect, useState } from 'react'
import { Bell, FileText, Gauge, Globe2, Mail, Menu, Settings2, Smartphone, Wifi } from 'lucide-react'
import type { AppSnapshot } from '../shared/types'
import type { DeviceTab, MainPage, RunAction } from './app-types'
import { BusyBadge, Toast } from './components'
import { DevicePage } from './device-page'
import { DashboardPage, LogsPage, ProxyPage, SettingsPage, SmsPage } from './pages'
import { createDemoSnapshot } from './demo'

const navigation: Array<{ id: MainPage; label: string; icon: typeof Gauge }> = [
  { id: 'dashboard', label: '仪表盘', icon: Gauge },
  { id: 'devices', label: '设备管理', icon: Smartphone },
  { id: 'proxy', label: '代理管理', icon: Globe2 },
  { id: 'sms', label: '短信中心', icon: Mail },
  { id: 'logs', label: '实时日志', icon: FileText },
  { id: 'settings', label: '系统设置', icon: Settings2 }
]

export default function App() {
  const api = window.voLink
  const [snapshot, setSnapshot] = useState<AppSnapshot>(() => createDemoSnapshot())
  const [page, setPage] = useState<MainPage>('devices')
  const [deviceTab, setDeviceTab] = useState<DeviceTab>('overview')
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [busy, setBusy] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [toast, setToast] = useState<{type:'success'|'error';text:string}>()

  const refresh = useCallback(async () => {
    if (!api) return
    const next = await api.getSnapshot()
    setSnapshot(next)
    setSelectedDeviceId(current => current && next.devices.some(device => device.id === current) ? current : next.devices[0]?.id || '')
  }, [api])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const timer = setInterval(() => { if (!busy) void refresh() }, 8000)
    return () => clearInterval(timer)
  }, [busy, refresh])
  useEffect(() => { if (!toast) return; const timer=setTimeout(()=>setToast(undefined),3200); return()=>clearTimeout(timer) }, [toast])

  const action: RunAction = useCallback(async (task, success) => {
    setBusy(true)
    try {
      const result = await task()
      await refresh()
      if (success) setToast({type:'success',text:success})
      return result
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      setToast({type:'error',text})
      throw error
    } finally { setBusy(false) }
  }, [refresh])

  const navigate = (next: MainPage) => setPage(next)
  const pageProps = { snapshot, busy, action, refresh }

  return <div className={`vh-app ${collapsed ? 'collapsed' : ''}`}>
    <aside className="vh-sidebar">
      <div className="vh-brand"><span>V</span>{collapsed ? null : <strong>VoLink</strong>}</div>
      <nav>{navigation.map(item => { const Icon=item.icon; return <button key={item.id} className={page===item.id?'active':''} title={item.label} onClick={()=>setPage(item.id)}><Icon size={20}/>{collapsed?null:<span>{item.label}</span>}</button> })}</nav>
      <div className="sidebar-bottom">{collapsed?null:<div className="admin-card"><span><Settings2 size={18}/></span><div><strong>Admin</strong><small>Administrator</small></div></div>}</div>
    </aside>
    <main className="vh-main">
      <header className="vh-topbar"><button className="menu-button" onClick={()=>setCollapsed(value=>!value)}><Menu size={20}/></button><div><span className="service-dot"/>本地服务正常</div><Bell size={19}/></header>
      <div className="vh-content">
        {busy ? <BusyBadge/> : null}
        {page==='dashboard'?<DashboardPage {...pageProps} navigate={navigate}/>:null}
        {page==='devices'?<DevicePage {...pageProps} selectedId={selectedDeviceId} setSelectedId={setSelectedDeviceId} tab={deviceTab} setTab={setDeviceTab} navigate={navigate}/>:null}
        {page==='proxy'?<ProxyPage {...pageProps}/>:null}
        {page==='sms'?<SmsPage {...pageProps}/>:null}
        {page==='logs'?<LogsPage {...pageProps}/>:null}
        {page==='settings'?<SettingsPage {...pageProps}/>:null}
      </div>
    </main>
    {toast?<Toast type={toast.type} text={toast.text}/>:null}
  </div>
}
