import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LanSendClient } from './lib/client.js';
import { App } from './App.js';
import { browserSupport } from './ui/format.js';
import { isTerminal } from './ui/task.js';
import './styles/index.css';

const support = browserSupport();
const client = new LanSendClient();
const container = document.getElementById('root');
if (!container) throw new Error('找不到应用挂载点');
const root = createRoot(container);
if (support.supported) client.connect();
root.render(<StrictMode><App client={client} support={support} /></StrictMode>);

function warnActiveTransfer(event: BeforeUnloadEvent) {
  const task = client.getSnapshot().task;
  if (task && !isTerminal(task.phase)) {
    event.preventDefault();
    event.returnValue = '';
  }
}
function dispose() {
  client.dispose();
  window.removeEventListener('beforeunload', warnActiveTransfer);
  window.removeEventListener('pagehide', dispose);
}
window.addEventListener('beforeunload', warnActiveTransfer);
window.addEventListener('pagehide', dispose);
if (import.meta.hot) import.meta.hot.dispose(() => { dispose(); root.unmount(); });
