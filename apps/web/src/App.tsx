import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { LanSendClientApi } from './lib/types.js';
import { Brand, Icon } from './ui/Icons.js';
import { Sidebar } from './ui/Sidebar.js';
import { TransferPanel } from './ui/TransferPanel.js';
import { AppDialogs } from './ui/AppDialogs.js';
import { Toast } from './ui/Toast.js';
import { usePageActions } from './ui/usePageActions.js';
import { isTerminal, taskHeading } from './ui/task.js';

interface Support { supported: boolean; reason: string | null }

export function App({ client, support }: { client: LanSendClientApi; support: Support }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const page = usePageActions(client, state);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastFocus = useRef<{ element: HTMLElement; workspace: boolean } | null>(null);
  const task = state.task, online = state.connection === 'online';
  const active = task !== null && !isTerminal(task.phase);
  const message = page.localError ?? (state.message?.kind === 'error' ? state.message.text : null);
  const live = task ? taskHeading(task) : state.incoming ? `收到来自 ${state.incoming.from.name} 的文件请求，请核对清单。`
    : online ? '发现服务已连接，可选择设备和文件。' : state.connection === 'connecting' ? '正在连接发现服务。' : '发现服务暂时离线。';
  useEffect(() => {
    const previous = lastFocus.current;
    if (previous?.workspace && !previous.element.isConnected && !page.modal) headingRef.current?.focus();
  }, [task?.phase, state.incoming?.invitationId, page.modal]);

  return <div onFocusCapture={event => {
    if (event.target instanceof HTMLElement) lastFocus.current = {
      element: event.target, workspace: Boolean(event.target.closest('[data-transfer-workspace]')),
    };
  }}>
    <header className="topbar"><div className="topbar-inner"><Brand />
      <div className="top-actions"><span className="top-note"><Icon name="shield" size="sm" />文件内容不经过服务器</span>
        <span className={`pill ${online ? 'online' : 'neutral'}`}><i className="dot" />{online ? '本机在线' : state.connection === 'connecting' ? '正在连接服务' : '发现服务离线'}</span>
        <button type="button" className="plain" onClick={() => page.openModal('help')}><Icon name="help" size="sm" />使用帮助</button>
      </div>
    </div></header>
    <div className="shell">
      <Sidebar state={state} supported={support.supported} onPair={page.openPair} onRename={page.openRename}
        onCopy={() => { void page.copyCode(); }} onSelect={id => { void page.perform(() => client.selectPeer(id)); }} />
      <main className="workspace">
        <div className="workspace-heading"><h1>文件传输</h1><p>选好设备，把文件直接送到对方。</p></div>
        {!support.supported && <div className="banner" role="alert"><Icon name="alert" /><p>{support.reason}</p></div>}
        {support.supported && state.connection === 'offline' && <div className="banner"><Icon name="alert" /><p>
          发现服务暂时离线。{active ? '文件传输状态请看当前任务，请保持页面打开。' : '重新连接后可查找设备并发送请求。'}
          {!active && <button type="button" className="text-button" onClick={() => { void page.perform(() => client.connect()); }}>重新连接</button>}
        </p></div>}
        {message && <div className="banner error" role="alert"><Icon name="alert" /><p>{message}</p>
          <button type="button" className="icon-button" aria-label="关闭错误提示" onClick={page.dismissError}><Icon name="close" size="sm" /></button>
        </div>}
        <TransferPanel state={state} supported={support.supported} picking={page.picking} headingRef={headingRef} actions={{
          selectFile: file => { void page.perform(() => client.selectFile(file)); }, notify: text => page.setLocalError(text),
          send: () => { void page.perform(() => client.send()); }, accept: () => { void page.receive(); },
          reject: () => { const incoming = state.incoming; if (incoming) void page.perform(() => client.reject(incoming.invitationId)); },
          cancel: () => page.openModal('cancel'), query: () => { void page.perform(() => client.queryStatus()); },
          clear: () => { void page.perform(() => client.clearTask()); },
        }} />
        <div className="workspace-footer"><span><Icon name="link" size="sm" />浏览器之间直接传输 · 无云端文件中继</span><span>请在双方页面保持打开时传输</span></div>
      </main>
    </div>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{live}</div>
    <AppDialogs page={page} online={online} canCancel={task?.canCancel ?? false} />
    <Toast text={page.toast} />
  </div>;
}
