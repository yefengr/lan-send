import { MAX_DEVICE_NAME, PAIR_CODE_LENGTH } from '@lan-send/protocol';
import { Dialog } from './Dialog.js';
import type { PageActions } from './usePageActions.js';

export function AppDialogs({ page, online, canCancel }: { page: PageActions; online: boolean; canCancel: boolean }) {
  return <>
    <Dialog id="pair-dialog" title="通过配对码连接" open={page.modal === 'pair'} onClose={page.closeModal}>
      <form onSubmit={event => { event.preventDefault(); void page.submitPair(); }}>
        <p>输入对方页面上的 {PAIR_CODE_LENGTH} 位配对码。找到设备后，发送文件仍需对方确认。</p>
        <label className="field-label" htmlFor="pair-input">对方的配对码</label>
        <input id="pair-input" className="text-input code-input" inputMode="numeric" autoComplete="off" maxLength={12}
          placeholder="0000 0000" value={page.pairCode} onChange={event => page.setPairCode(event.target.value)}
          aria-invalid={Boolean(page.formError)} aria-describedby={page.formError ? 'pair-error' : undefined} disabled={page.pending} />
        {page.formError && <div id="pair-error" className="field-error" role="alert">{page.formError}</div>}
        <div className="dialog-actions"><button type="button" className="button" onClick={page.closeModal}>取消</button>
          <button type="submit" className="button primary" disabled={page.pending || !online}>{page.pending ? '正在连接…' : '连接'}</button></div>
      </form>
    </Dialog>
    <Dialog id="rename-dialog" title="修改设备名称" open={page.modal === 'rename'} onClose={page.closeModal}>
      <form onSubmit={event => { event.preventDefault(); void page.submitName(); }}>
        <p>方便对方在设备列表中认出你。名称仅用于本次页面会话。</p>
        <label className="field-label" htmlFor="name-input">设备名称</label>
        <input id="name-input" className="text-input" maxLength={MAX_DEVICE_NAME} value={page.name}
          onChange={event => page.setName(event.target.value)} aria-invalid={Boolean(page.formError)}
          aria-describedby={page.formError ? 'name-error' : undefined} disabled={page.pending} />
        {page.formError && <div id="name-error" className="field-error" role="alert">{page.formError}</div>}
        <div className="dialog-actions"><button type="button" className="button" onClick={page.closeModal}>取消</button>
          <button type="submit" className="button primary" disabled={page.pending || !online}>{page.pending ? '正在保存…' : '保存名称'}</button></div>
      </form>
    </Dialog>
    <Dialog id="help-dialog" title="使用帮助" open={page.modal === 'help'} onClose={page.closeModal}>
      <ol className="help-list"><li>让对方也打开此页面，选择设备或输入对方配对码。</li><li>选择一个文件，点击发送，等待对方确认。</li>
        <li>接收方选择系统保存位置后，文件直接传输。</li><li>正文传完后继续等待校验与保存结果，双方保持页面打开。</li></ol>
      <div className="help-notice">同公网出口分组和设备名都不能证明身份，请核对请求。当前一次传输一个文件；不支持发送文件夹。刷新或关闭页面后需重新开始。</div>
      <p className="inline-notice">配对码临时有效。重新生成后，旧码立即失效。</p>
      {page.formError && <div className="field-error" role="alert">{page.formError}</div>}
      <div className="dialog-actions"><button type="button" className="button" disabled={!online || page.pending} onClick={() => { void page.refreshCode(); }}>重新生成配对码</button>
        <button type="button" className="button primary" onClick={page.closeModal}>知道了</button></div>
    </Dialog>
    <Dialog id="cancel-dialog" title="取消当前文件？" open={page.modal === 'cancel'} onClose={page.closeModal}>
      <p>停止当前未完成文件。若对方已经开始最终保存，将以实际保存结果为准，已经保存的文件不会被删除。</p>
      <div className="dialog-actions"><button type="button" className="button" onClick={page.closeModal}>返回</button>
        <button type="button" className="button danger" disabled={!canCancel} onClick={page.cancelCurrent}>取消当前文件</button></div>
    </Dialog>
  </>;
}
