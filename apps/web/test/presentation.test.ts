import assert from 'node:assert/strict';
import test from 'node:test';
import { formatBytes, formatElapsed, formatPercent } from '../src/ui/format.js';
import { activityText, isTerminal, rowState, taskHeading } from '../src/ui/task.js';
import type { TaskSnapshot } from '../src/lib/types.js';

const id = '00000000-0000-4000-8000-000000000001';
const base: TaskSnapshot = {
  transferId: id, direction: 'send', peer: { id, name: '接收端', busy: true },
  file: { id, name: '数据.bin', size: 10 * 1024 ** 3, lastModified: 0 },
  phase: 'transferring', confirmedBytes: 0, bytesPerSecond: 0, phaseElapsedMs: 0,
  savedName: null, error: null, canCancel: true, canQuery: false,
};

test('容量区分 B/GiB，10 GB 不冒充 10 GiB', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(10 * 1024 ** 3), '10.00 GiB');
  assert.notEqual(formatBytes(10_000_000_000), '10.00 GiB');
  assert.equal(formatBytes(1024), '1.00 KiB');
});

test('最后一个字节确认前不显示 100%，空文件不产生除零', () => {
  assert.equal(formatPercent(base.file.size - 1, base.file.size), 99);
  assert.equal(formatPercent(base.file.size, base.file.size), 100);
  assert.equal(formatPercent(0, 0), 0);
});

test('数据传完和空文件都不能显示已保存，保存确认前不计成功', () => {
  assert.equal(taskHeading({ ...base, confirmedBytes: base.file.size }), '文件数据已传完');
  assert.equal(rowState({ ...base, file: { ...base.file, size: 0 } }), '等待处理');
  assert.equal(rowState({ ...base, phase: 'awaiting-confirmation' }), '等待确认');
  assert.equal(isTerminal('awaiting-confirmation'), false);
  assert.equal(rowState({ ...base, phase: 'completed' }), '对方已保存');
});

test('长保存只补充真实等待说明，不变成失败或虚构进度', () => {
  const task = { ...base, phase: 'saving' as const, phaseElapsedMs: 16_000 };
  assert.equal(activityText(task), '仍在保存文件，请保持页面打开');
  assert.equal(isTerminal(task.phase), false);
  assert.equal(formatElapsed(61_900), '1 分 1 秒');
  assert.equal(taskHeading({ ...base, phase: 'result-unknown' }), '对端保存结果未确认');
});
