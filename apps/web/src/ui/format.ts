export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.floor(bytes)} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let value = bytes / 1024, index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  return `${value.toFixed(2)} ${units[index]}`;
}

export function formatPercent(confirmed: number, size: number): number {
  if (size <= 0 || confirmed <= 0) return 0;
  if (confirmed >= size) return 100;
  return Math.min(99, Math.floor(confirmed / size * 100));
}

export function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '正在计算速度';
  return bytesPerSecond >= 1024 ** 2
    ? `${(bytesPerSecond / 1024 ** 2).toFixed(2)} MiB/s`
    : `${(bytesPerSecond / 1024).toFixed(2)} KiB/s`;
}

export function browserSupport(): { supported: boolean; reason: string | null } {
  const ua = navigator as Navigator & { userAgentData?: { mobile?: boolean; brands?: { brand: string }[] } };
  const mobile = ua.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod/iu.test(ua.userAgent)
    || (/Macintosh/iu.test(ua.userAgent) && ua.maxTouchPoints > 1);
  const chromium = ua.userAgentData?.brands?.some(item => /Chromium/iu.test(item.brand))
    || /(?:Chrome|Chromium)\/\d+/u.test(ua.userAgent);
  if (mobile || !chromium) return { supported: false, reason: '请使用电脑端 Chromium 内核浏览器打开。当前不支持手机、平板、Safari 或 Firefox。' };
  if (!window.isSecureContext) return { supported: false, reason: '文件保存需要安全环境。请通过 HTTPS 或本机 localhost 地址打开。' };
  if (typeof window.showSaveFilePicker !== 'function' || typeof RTCPeerConnection !== 'function'
    || typeof Worker !== 'function' || typeof WebSocket !== 'function' || !crypto.subtle) {
    return { supported: false, reason: '当前浏览器或运行环境缺少文件保存、直连或校验接口，请检查浏览器版本和权限。' };
  }
  return { supported: true, reason: null };
}
