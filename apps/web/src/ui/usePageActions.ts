import { useEffect, useRef, useState } from 'react';
import { MAX_DEVICE_NAME, PAIR_CODE_LENGTH, sanitizeFileName } from '@lan-send/protocol';
import type { ClientSnapshot, LanSendClientApi } from '../lib/types.js';

export type Modal = 'pair' | 'rename' | 'help' | 'cancel' | null;
const safeError = (error: unknown) => error instanceof Error ? error.message : '暂时无法完成操作，请检查当前连接后再试。';

export function usePageActions(client: LanSendClientApi, state: ClientSnapshot) {
  const [modal, setModal] = useState<Modal>(null);
  const [pairCode, setPairCode] = useState('');
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [picking, setPicking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const pickerActive = useRef(false), modalEpoch = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function showToast(text: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(text); toastTimer.current = setTimeout(() => setToast(null), 3500);
  }
  function openModal(next: Modal) {
    modalEpoch.current++; setPending(false); setFormError(null); setModal(next);
  }
  function closeModal() { openModal(null); }
  async function perform(action: () => void | Promise<void>) {
    setLocalError(null); client.clearMessage();
    try { await action(); } catch (error) { setLocalError(safeError(error)); }
  }
  async function modalAction(action: () => Promise<void>, success: () => void) {
    const epoch = modalEpoch.current;
    setPending(true); setFormError(null);
    try { await action(); if (epoch === modalEpoch.current) success(); }
    catch (error) { if (epoch === modalEpoch.current) setFormError(safeError(error)); }
    finally { if (epoch === modalEpoch.current) setPending(false); }
  }
  async function submitPair() {
    const code = pairCode.replace(/\s/gu, '');
    if (!new RegExp(`^\\d{${PAIR_CODE_LENGTH}}$`, 'u').test(code)) {
      setFormError(`请输入完整的 ${PAIR_CODE_LENGTH} 位数字配对码。`); return;
    }
    await modalAction(() => client.pairByCode(code), () => {
      closeModal(); showToast('已找到设备，请核对名称后选择文件发送');
    });
  }
  async function submitName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > MAX_DEVICE_NAME) { setFormError(`设备名需要 1—${MAX_DEVICE_NAME} 个字符。`); return; }
    await modalAction(() => client.setName(trimmed), () => { closeModal(); showToast('设备名称已修改'); });
  }
  async function receive() {
    const incoming = state.incoming;
    if (!incoming || pickerActive.current || !window.showSaveFilePicker) return;
    pickerActive.current = true; setPicking(true); setLocalError(null);
    try {
      // 在点击手势中直接请求系统选择器，网络请求必须放在取得授权之后。
      const handle = await window.showSaveFilePicker({ suggestedName: sanitizeFileName(incoming.file.name) });
      await client.accept(incoming.invitationId, handle);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setLocalError(error instanceof DOMException ? '保存位置授权未成功，请检查权限后重新选择。' : safeError(error));
      }
    } finally { pickerActive.current = false; setPicking(false); }
  }
  async function copyCode() {
    if (!state.code) return;
    try { await navigator.clipboard.writeText(state.code); showToast('配对码已复制'); }
    catch { showToast('剪贴板暂不可用，可选中配对码文字手动复制'); }
  }
  return {
    modal, pairCode, name, formError, localError, pending, picking, toast,
    setPairCode, setName, setLocalError, openModal, closeModal, perform, submitPair, submitName, receive, copyCode,
    openPair: () => { setPairCode(''); openModal('pair'); },
    openRename: () => { setName(state.self?.name ?? ''); openModal('rename'); },
    dismissError: () => { setLocalError(null); client.clearMessage(); },
    refreshCode: () => modalAction(() => client.refreshPairCode(), () => showToast('配对码已更新')),
    cancelCurrent: () => { closeModal(); void perform(() => client.cancel()); },
  };
}
export type PageActions = ReturnType<typeof usePageActions>;
