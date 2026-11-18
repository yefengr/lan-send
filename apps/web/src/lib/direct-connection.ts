import {
  FRAME_HEADER_BYTES, MAX_CONTROL_BYTES, MAX_FRAME_BYTES, MAX_PENDING_BYTES, MAX_PENDING_EVENTS, type ServerMessage, type Signal,
} from '@lan-send/protocol';

type Pair = Extract<ServerMessage, { type: 'paired' }>;
export class DirectConnection {
  private readonly pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private candidates: (RTCIceCandidateInit | null)[] = [];
  private earlyMessages: MessageEvent[] = [];
  private earlyBytes = 0;
  private signals: Promise<void> = Promise.resolve();
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private count = 0;

  private readonly pair: Pair;
  private readonly signal: (signal: Signal) => void;
  private readonly opened: (channel: RTCDataChannel, frameBytes: number) => void;
  private readonly failed: () => void;

  constructor(
    pair: Pair,
    signal: (signal: Signal) => void,
    opened: (channel: RTCDataChannel, frameBytes: number) => void,
    failed: () => void,
  ) {
    this.pair = pair;
    this.signal = signal;
    this.opened = opened;
    this.failed = failed;
    if (pair.iceServers.some(server => server.urls.some(url => !/^stuns?:[^\s]+$/iu.test(url)))) {
      throw new Error('不允许中继服务器');
    }
    this.pc = new RTCPeerConnection({ iceServers: pair.iceServers, iceTransportPolicy: 'all' });
    this.pc.onicecandidate = event => {
      if (this.stopped) return;
      if (event.candidate?.type === 'relay' || /\btyp relay\b/u.test(event.candidate?.candidate ?? '')) {
        this.fail(); return;
      }
      this.signal({ kind: 'candidate', candidate: event.candidate?.toJSON() as SignalCandidate ?? null });
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') this.fail();
      if (this.pc.connectionState === 'connected') void this.checkRoute().catch(() => this.fail());
    };
    this.pc.ondatachannel = event => {
      if (pair.role !== 'receiver' || this.channel) { event.channel.close(); this.fail(); return; }
      this.attach(event.channel);
    };
    this.timer = setTimeout(() => this.fail(), 30_000);
  }

  async start(): Promise<void> {
    if (this.pair.role !== 'sender') return;
    this.attach(this.pc.createDataChannel('lan-send', { ordered: true }));
    const offer = await this.pc.createOffer();
    if (this.stopped) return;
    await this.pc.setLocalDescription(offer);
    if (this.stopped) return;
    const sdp = this.pc.localDescription?.sdp;
    if (!sdp) throw new Error('协商失败');
    this.signal({ kind: 'description', description: { type: 'offer', sdp } });
  }

  receive(signal: Signal): void {
    if (this.stopped) return;
    if (++this.count > MAX_PENDING_EVENTS) { this.fail(); return; }
    this.signals = this.signals.then(async () => {
      if (this.stopped) return;
      if (signal.kind === 'candidate') {
        if (/\btyp relay\b/u.test(signal.candidate?.candidate ?? '')) throw new Error('不允许中继候选');
        if (!this.pc.remoteDescription) {
          if (this.candidates.length >= MAX_PENDING_EVENTS) throw new Error('候选队列过大');
          this.candidates.push(signal.candidate);
        } else await this.pc.addIceCandidate(signal.candidate ?? undefined);
        return;
      }
      const expected = this.pair.role === 'sender' ? 'answer' : 'offer';
      if (signal.description.type !== expected || this.pc.remoteDescription) throw new Error('协商角色不匹配');
      await this.pc.setRemoteDescription(signal.description);
      if (this.stopped) return;
      for (const candidate of this.candidates) {
        await this.pc.addIceCandidate(candidate ?? undefined);
        if (this.stopped) return;
      }
      this.candidates = [];
      if (this.pair.role === 'receiver') {
        const answer = await this.pc.createAnswer();
        if (this.stopped) return;
        await this.pc.setLocalDescription(answer);
        if (this.stopped) return;
        const sdp = this.pc.localDescription?.sdp;
        if (!sdp) throw new Error('协商失败');
        this.signal({ kind: 'description', description: { type: 'answer', sdp } });
      }
    }).catch(() => this.fail()).finally(() => { this.count--; });
  }

  private attach(channel: RTCDataChannel): void {
    if (channel.label !== 'lan-send' || !channel.ordered
      || channel.maxRetransmits !== null || channel.maxPacketLifeTime !== null) {
      channel.close(); throw new Error('必须使用可靠有序通道');
    }
    this.channel = channel;
    channel.binaryType = 'arraybuffer';
    // 路由统计是异步操作；等待期间也要接住对端的一次性握手消息。
    channel.onmessage = event => this.queueEarlyMessage(event);
    let opening = false;
    channel.onopen = () => {
      if (opening || this.stopped) return;
      opening = true;
      void this.checkRoute().then(() => {
        if (this.stopped) return;
        const maximum = this.pc.sctp?.maxMessageSize;
        const frameBytes = maximum && Number.isFinite(maximum) ? Math.min(MAX_FRAME_BYTES, Math.floor(maximum)) : MAX_FRAME_BYTES;
        if (frameBytes <= FRAME_HEADER_BYTES) throw new Error('通道消息上限不足');
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        this.opened(channel, frameBytes);
        const deliver = channel.onmessage;
        if (!deliver) throw new Error('文件通道处理器未就绪');
        const queued = this.earlyMessages;
        this.earlyMessages = [];
        this.earlyBytes = 0;
        for (const event of queued) {
          if (this.stopped) break;
          deliver.call(channel, event);
        }
      }).catch(() => this.fail());
    };
    channel.onclose = () => this.fail();
    channel.onerror = () => this.fail();
    if (channel.readyState === 'open') queueMicrotask(() => channel.onopen?.call(channel, new Event('open')));
  }

  private queueEarlyMessage(event: MessageEvent): void {
    if (this.stopped) return;
    const data: unknown = event.data;
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data).byteLength
      : data instanceof ArrayBuffer ? data.byteLength : -1;
    const maximum = typeof data === 'string' ? MAX_CONTROL_BYTES : MAX_FRAME_BYTES;
    if (bytes < 0 || bytes > maximum || this.earlyMessages.length >= MAX_PENDING_EVENTS
      || this.earlyBytes + bytes > MAX_PENDING_BYTES) { this.fail(); return; }
    this.earlyMessages.push(event);
    this.earlyBytes += bytes;
  }

  private async checkRoute(): Promise<void> {
    const stats = await this.pc.getStats();
    if (this.stopped) return;
    let selected = false;
    stats.forEach(report => {
      const pairId = report.type === 'transport' ? report.selectedCandidatePairId : undefined;
      const pair = pairId ? stats.get(pairId) : report.type === 'candidate-pair'
        && report.state === 'succeeded' && report.nominated ? report : undefined;
      if (!pair) return;
      selected = true;
      const local = stats.get(pair.localCandidateId), remote = stats.get(pair.remoteCandidateId);
      if (!local || !remote || local.candidateType === 'relay' || remote.candidateType === 'relay') {
        throw new Error('直连路径校验失败');
      }
    });
    if (!selected) throw new Error('无法确认直连路径');
  }

  private fail(): void { if (!this.stopped) { this.stop(); this.failed(); } }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.candidates = [];
    this.earlyMessages = [];
    this.earlyBytes = 0;
    this.pc.onicecandidate = null;
    this.pc.onconnectionstatechange = null;
    this.pc.ondatachannel = null;
    if (this.channel) {
      this.channel.onopen = null; this.channel.onclose = null; this.channel.onerror = null;
      this.channel.onmessage = null;
      this.channel.close();
    }
    this.pc.close();
  }
}

type SignalCandidate = Extract<Signal, { kind: 'candidate' }>['candidate'];
