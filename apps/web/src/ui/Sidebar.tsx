import type { ClientSnapshot } from '../lib/types.js';
import { Icon } from './Icons.js';

export function Sidebar({ state, supported, onPair, onRename, onCopy, onSelect }: {
  state: ClientSnapshot; supported: boolean; onPair: () => void; onRename: () => void;
  onCopy: () => void; onSelect: (id: string) => void;
}) {
  const online = state.connection === 'online';
  const locked = state.task !== null || state.incoming !== null;
  const selected = state.task?.peer.id ?? state.incoming?.from.id ?? state.selectedPeerId;
  const code = online && state.code ? `${state.code.slice(0, 4)} ${state.code.slice(4)}` : '———— ————';
  const ownStatus = online ? state.self?.busy ? '任务处理中' : '可接收请求'
    : state.connection === 'connecting' ? '正在连接' : '发现服务离线';
  return <aside className="sidebar" aria-label="本机与可发现设备">
    <section className="panel self-card" aria-label="我的设备">
      <div className="eyebrow">我的设备</div>
      <div className="self-row">
        <div className="device-avatar self"><Icon name="laptop" /></div>
        <div className="self-copy">
          <div className="self-name" title={state.self?.name}>{state.self?.name ?? '这台电脑'}</div>
          <div className={`self-online ${online ? 'online' : ''}`}><i className="dot" />{ownStatus}</div>
        </div>
        <button type="button" className="icon-button" aria-label="修改设备名" disabled={!online} onClick={onRename}><Icon name="edit" size="sm" /></button>
      </div>
      <div className="pair-label"><span>我的配对码</span><span>{online ? '临时有效' : '连接后生成'}</span></div>
      <div className="pair-code">
        <span data-testid="pair-code" aria-label={online && state.code ? `我的配对码 ${state.code}` : '配对码尚未生成'}>{code}</span>
        <button type="button" className="icon-button" aria-label="复制配对码" disabled={!online || !state.code} onClick={onCopy}><Icon name="copy" size="sm" /></button>
      </div>
      <button type="button" className="button full" disabled={!online || !supported || locked} onClick={onPair}>
        <Icon name="link" size="sm" />输入对方配对码
      </button>
    </section>
    <section className="device-section" aria-labelledby="devices-heading">
      <div className="section-caption"><span id="devices-heading">可发现的设备</span><span className="count">{online ? state.peers.length : 0}</span></div>
      <div className="device-list">
        {online && state.peers.map(peer => <button type="button" key={peer.id}
          className={`peer ${selected === peer.id ? 'selected' : ''}`} aria-pressed={selected === peer.id}
          disabled={locked || peer.busy} onClick={() => onSelect(peer.id)} title={peer.name}>
          <span className="device-avatar"><Icon name="monitor" /></span>
          <span className="peer-copy"><span className="peer-name">{peer.name}</span>
            <span className="peer-detail"><i className="dot" />{peer.busy ? '忙碌 · 暂不可选' : '候选设备 · 请核对'}</span>
          </span>
          {selected === peer.id && <Icon name="check" className="peer-check" />}
        </button>)}
        {(!online || state.peers.length === 0) && <p className="device-empty">{online ? '暂未发现其他设备，可通过配对码连接。' : '连接发现服务后显示设备。'}</p>}
      </div>
      <p className="discovery-note">让对方也打开这个页面。<br />候选分组和设备名不能证明对方身份。</p>
    </section>
    <div className="sidebar-bottom"><Icon name="shield" size="sm" /><span>由你选择接收方<br />每次传输都需要对方确认</span></div>
  </aside>;
}
