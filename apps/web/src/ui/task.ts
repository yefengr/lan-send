import type { TaskPhase, TaskSnapshot } from '../lib/types.js';

const terminal = new Set<TaskPhase>(['completed', 'cancelled', 'rejected', 'failed', 'result-unknown']);
export const isTerminal = (phase: TaskPhase): boolean => terminal.has(phase);

export function taskHeading(task: TaskSnapshot): string {
  const receiving = task.direction === 'receive';
  if (task.phase === 'transferring' && task.confirmedBytes >= task.file.size) return '文件数据已传完';
  const labels: Record<TaskPhase, string> = {
    'awaiting-accept': '等待对方接收文件', connecting: '正在建立直接连接',
    transferring: receiving ? '正在接收文件' : '正在发送文件',
    verifying: receiving ? '正在校验文件' : '对方正在校验文件',
    saving: receiving ? '正在保存文件' : '对方正在保存文件',
    'awaiting-confirmation': '等待对方保存确认', cancelling: '正在取消当前文件',
    completed: receiving ? '文件已保存' : '对方已保存文件', cancelled: '当前文件已取消',
    rejected: '对方已拒收文件', failed: '本次传输未完成', 'result-unknown': '对端保存结果未确认',
  };
  return labels[task.phase];
}

export function rowState(task: TaskSnapshot): string {
  if (task.phase === 'transferring' && task.confirmedBytes >= task.file.size) return '等待处理';
  const labels: Record<TaskPhase, string> = {
    'awaiting-accept': '等待接收', connecting: '连接中', transferring: '传输中', verifying: '校验中',
    saving: '保存中', 'awaiting-confirmation': '等待确认', cancelling: '正在取消',
    completed: task.direction === 'receive' ? '已保存' : '对方已保存', cancelled: '已取消',
    rejected: '已拒收', failed: '未完成', 'result-unknown': '结果未确认',
  };
  return labels[task.phase];
}

export function activityText(task: TaskSnapshot): string {
  if (task.phase === 'saving') return task.phaseElapsedMs >= 15_000
    ? '仍在保存文件，请保持页面打开' : '正在提交最终文件，请保持页面打开';
  if (task.phase === 'verifying') return '正在核对文件长度、分块结果与完整性';
  if (task.phase === 'awaiting-confirmation') return '正在核实接收方的最终保存结果';
  if (task.phase === 'awaiting-accept') return '对方确认文件并选择保存位置后，才会开始传输';
  if (task.phase === 'connecting') return '正在协商浏览器之间的直接连接';
  if (task.phase === 'cancelling') return '正在确认取消结果，已经保存的文件会保留';
  return '文件数据已传完，等待最终校验与保存结果';
}
