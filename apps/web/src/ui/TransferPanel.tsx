import { useRef, useState } from 'react';
import type { DragEvent, RefObject } from 'react';
import type { ClientSnapshot, TaskSnapshot } from '../lib/types.js';
import { Icon } from './Icons.js';
import { formatBytes, formatElapsed, formatPercent, formatSpeed } from './format.js';
import { activityText, isTerminal, rowState, taskHeading } from './task.js';

export function TaskPanel({ task, headingRef }: { task: TaskSnapshot; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const transferVisible = task.phase === 'transferring' && task.confirmedBytes < task.file.size;
  const final = isTerminal(task.phase);
  const percent = formatPercent(task.confirmedBytes, task.file.size);
  const phaseIndex = task.phase === 'completed' ? 3 : task.phase === 'verifying' ? 1
    : ['saving', 'awaiting-confirmation'].includes(task.phase) ? 2 : final ? -1 : 0;
  return <section className="task-panel" aria-label="当前文件状态" data-phase={task.phase}>
    <div className="task-top">
      <div className="task-copy">
        <div className="task-kicker">当前文件 1 / 1 · 已保存 {task.phase === 'completed' ? 1 : 0} / 1</div>
        <h2 className="task-heading" ref={headingRef} tabIndex={-1}>{taskHeading(task)}</h2>
        <p className="task-description">{task.file.name}</p>
      </div>
      <div className={`task-metric ${task.phase}`}>
        {task.phase === 'completed' ? '完成' : transferVisible ? `${percent}%`
          : final ? task.phase === 'result-unknown' ? '待确认' : '已结束' : formatElapsed(task.phaseElapsedMs)}
      </div>
    </div>
    {transferVisible && <div data-testid="transfer-progress">
      <div className="progress-track" role="progressbar" aria-label="当前文件传输进度"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="progress-facts"><span>{formatBytes(task.confirmedBytes)} / {formatBytes(task.file.size)}</span><span>{formatSpeed(task.bytesPerSecond)}</span></div>
    </div>}
    {!transferVisible && !final && <div className="activity-line"><span className="spinner" aria-hidden="true" /><span>{activityText(task)}</span></div>}
    {task.phase === 'completed' && <div className="result-note"><p>{task.direction === 'receive'
      ? `已保存为：${task.savedName ?? task.file.name}` : '接收方已确认最终文件保存成功。'}</p></div>}
    {(task.error || task.phase === 'result-unknown') && <div className={`result-note ${task.phase === 'result-unknown' ? 'uncertain' : 'error'}`}>
      <p>{task.error ?? '尚未取得接收方的最终保存确认。'}</p>
      {task.phase === 'result-unknown' && <p>请先在接收端核对文件，确认前不要重复发送。</p>}
    </div>}
    <div className="steps" aria-label="文件处理阶段">
      {['传输', '校验', '保存', '完成'].map((label, index) => <div key={label}
        className={`step ${phaseIndex === index ? 'active' : phaseIndex > index ? 'done' : ''}`}>
        <span className="step-num">{phaseIndex > index ? <Icon name="check" size="sm" /> : index + 1}</span>{label}
      </div>)}
    </div>
  </section>;
}

interface Actions {
  selectFile: (file: File | null) => void;
  notify: (message: string) => void;
  send: () => void;
  accept: () => void;
  reject: () => void;
  cancel: () => void;
  query: () => void;
  clear: () => void;
}

export function TransferPanel({ state, supported, picking, actions, headingRef }: {
  state: ClientSnapshot; supported: boolean; picking: boolean; actions: Actions;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { task, incoming, draft } = state;
  const selected = state.peers.find(peer => peer.id === state.selectedPeerId);
  const peer = task?.peer ?? incoming?.from ?? selected;
  const file = task?.file ?? incoming?.file ?? draft;
  const idle = !task && !incoming;
  const terminal = task ? isTerminal(task.phase) : false;
  const online = state.connection === 'online';
  const canSend = idle && supported && online && draft !== null && selected !== undefined && !selected.busy;
  const status = task ? task.phase === 'transferring' ? '直接连接'
    : task.phase === 'connecting' ? '正在连接' : terminal ? '任务已结束' : rowState(task)
    : incoming ? '等待你的确认' : '等待发送';
  const hint = incoming ? '核对文件后选择保存位置，不会自动接收后续文件'
    : task ? task.phase === 'result-unknown' ? '先在接收端核对结果，再决定是否重新发送'
      : task.phase === 'completed' ? '最终保存结果已确认'
        : ['saving', 'awaiting-confirmation'].includes(task.phase) ? '请保持双方页面打开，等待实际保存结果'
          : '取消不会删除已经保存的文件'
      : !supported ? '当前浏览器环境不支持所需接口'
        : !online ? '先连接发现服务' : !selected ? '先在左侧选择设备，或输入对方配对码'
          : selected.busy ? '对方正在处理任务，请稍后再试' : !draft ? '请选择一个要发送的文件' : '对方确认后才会开始传输';

  function useFiles(list: FileList | readonly File[]) {
    if (!idle) return;
    if (list.length !== 1) { actions.notify('当前每次传输一个文件，请只选择一个文件。'); return; }
    const chosen = list[0];
    if (chosen) actions.selectFile(chosen);
  }
  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); setDragging(false);
    if (!idle || !supported) return;
    const directory = Array.from(event.dataTransfer.items).some(item =>
      (item as DataTransferItem & { webkitGetAsEntry?: () => { isDirectory: boolean } | null }).webkitGetAsEntry?.()?.isDirectory);
    if (directory) { actions.notify('不支持发送文件夹，请选择一个文件。'); return; }
    useFiles(event.dataTransfer.files);
  }
  const fileStyle = file && /\.zip$/iu.test(file.name) ? 'zip' : file && /\.pdf$/iu.test(file.name) ? 'pdf' : '';
  const fileStatus = task ? rowState(task) : incoming ? '待接收' : '等待发送';
  const stateClass = task?.phase === 'completed' ? 'completed'
    : task?.phase === 'failed' ? 'failed' : task && !terminal ? 'active' : '';

  return <section className="panel transfer-surface" aria-label="传输工作区" data-transfer-workspace>
    <div className="target-bar">
      <div className="target-person"><div className="device-avatar"><Icon name="monitor" /></div><div>
        <div className="target-label">{task?.direction === 'receive' || incoming ? '发送设备' : '接收设备'}</div>
        <div className="target-name" title={peer?.name}>{peer?.name ?? '请选择接收设备'}</div>
      </div></div>
      <span className={`pill ${task?.phase === 'transferring' ? 'online' : 'neutral'}`}><i className="dot" />{status}</span>
    </div>
    {idle && <div className="drop-wrap"><div className={`dropzone ${dragging ? 'dragging' : ''}`}
      onDragOver={event => { event.preventDefault(); if (supported) setDragging(true); }}
      onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <div className="drop-icon"><Icon name="upload" size="lg" /></div>
      <div className="drop-title">拖入文件，或<button type="button" className="text-button" disabled={!supported}
        onClick={() => inputRef.current?.click()}>选择文件</button></div>
      <p className="drop-subtitle">当前每次发送一个文件 · 由接收方确认并保存</p>
    </div><input ref={inputRef} data-testid="file-input" type="file" hidden aria-label="选择要发送的文件"
      onChange={event => { if (event.target.files?.length) useFiles(event.target.files); event.target.value = ''; }} /></div>}
    {incoming && <section className="incoming" aria-label="收到传输请求">
      <span className="incoming-badge"><Icon name="download" size="sm" />收到传输请求</span>
      <h2>对方想给你发送一个文件</h2>
      <p>来自 {incoming.from.name} · 共 {formatBytes(incoming.file.size)}</p>
      <div className="incoming-notice">请核对设备名、文件名和大小。选择保存位置后开始接收。</div>
    </section>}
    {task && <TaskPanel task={task} headingRef={headingRef} />}
    <div className="queue-heading"><h2>{incoming ? '待接收文件' : task ? '本次文件' : '待发送文件'}
      <span className="queue-total">{file ? `1 个 · ${formatBytes(file.size)}` : '0 个'}</span></h2></div>
    {file ? <ul className="file-list" aria-label="本次文件清单"><li className="file-row" tabIndex={0}>
      <div className="file-main"><span className={`file-avatar ${fileStyle}`}><Icon name="file" /></span>
        <div className="file-copy"><div className="file-name" title={file.name}>{file.name}</div><div className="file-type">{incoming || task?.direction === 'receive' ? '对方发送的文件' : '本地文件'}</div></div>
      </div>
      <span className="file-size">{formatBytes(file.size)}</span>
      <span className={`file-state ${stateClass}`}><i className="dot" />{fileStatus}</span>
      <span className="row-end">{idle ? <button type="button" className="icon-button" aria-label={`移除 ${file.name}`} onClick={() => actions.selectFile(null)}>
        <Icon name="close" size="sm" /></button> : task?.phase === 'completed' ? <Icon name="check" className="success" /> : null}</span>
    </li></ul> : <div className="queue-empty">还没有文件。选择文件后，清单会显示在这里。</div>}
    <div className="surface-footer">
      <div className="footer-hint"><Icon name="shield" size="sm" /><span>{hint}</span></div>
      <div className="footer-actions">
        {idle && <button type="button" className="button primary" disabled={!canSend} onClick={actions.send}>发送文件<Icon name="arrow" size="sm" /></button>}
        {incoming && <><button type="button" className="button" disabled={picking} onClick={actions.reject}>拒收</button>
          <button type="button" className="button primary" disabled={!supported || picking} onClick={actions.accept}>
            <Icon name="folder" size="sm" />{picking ? '正在选择保存位置…' : '接收并选择保存位置'}</button></>}
        {task?.canCancel && <button type="button" className="button danger" onClick={actions.cancel}>取消当前文件</button>}
        {task?.canQuery && ['awaiting-confirmation', 'result-unknown'].includes(task.phase) && <button type="button" className="button" onClick={actions.query}>查询保存结果</button>}
        {terminal && <button type="button" className="button primary" onClick={actions.clear}>返回文件选择</button>}
      </div>
    </div>
  </section>;
}
