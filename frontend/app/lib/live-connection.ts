export type LiveConnectionSource = "websocket" | "polling";
export type LiveTransportStatus = "connected" | "reconnecting" | "offline";

export interface LiveSocket {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  close: () => void;
}

export function createBrowserLiveSocket(url: string): LiveSocket {
  const socket = new WebSocket(url);
  const adapter: LiveSocket = {
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    close: () => socket.close(),
  };

  socket.addEventListener("open", () => adapter.onopen?.());
  socket.addEventListener("message", (event) => adapter.onmessage?.({ data: event.data }));
  socket.addEventListener("error", () => adapter.onerror?.());
  socket.addEventListener("close", () => adapter.onclose?.());

  return adapter;
}

type TimerHandle = unknown;

export interface LiveConnectionScheduler {
  setTimeout: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
}

interface LiveConnectionOptions<T> {
  createSocket: () => LiveSocket;
  poll: () => Promise<T>;
  parseMessage: (data: unknown) => T;
  onData: (payload: T, source: LiveConnectionSource) => void;
  onStatus: (status: LiveTransportStatus) => void;
  onNoMessage: () => void;
  onPollError: (error: unknown) => void;
  pollingIntervalMs?: number;
  connectTimeoutMs?: number;
  noMessageTimeoutMs?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  random?: () => number;
  scheduler?: LiveConnectionScheduler;
}

const defaultScheduler: LiveConnectionScheduler = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

export class LiveConnectionController<T> {
  private readonly options: Required<
    Pick<
      LiveConnectionOptions<T>,
      | "pollingIntervalMs"
      | "connectTimeoutMs"
      | "noMessageTimeoutMs"
      | "reconnectBaseMs"
      | "reconnectMaxMs"
      | "random"
      | "scheduler"
    >
  > &
    Omit<
      LiveConnectionOptions<T>,
      | "pollingIntervalMs"
      | "connectTimeoutMs"
      | "noMessageTimeoutMs"
      | "reconnectBaseMs"
      | "reconnectMaxMs"
      | "random"
      | "scheduler"
    >;

  private stopped = true;
  private socket: LiveSocket | null = null;
  private socketGeneration = 0;
  private failedSocketGeneration: number | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: TimerHandle | null = null;
  private connectTimer: TimerHandle | null = null;
  private noMessageTimer: TimerHandle | null = null;
  private pollingTimer: TimerHandle | null = null;
  private polling = false;
  private pollInFlightGeneration: number | null = null;
  private pollGeneration = 0;

  constructor(options: LiveConnectionOptions<T>) {
    this.options = {
      ...options,
      pollingIntervalMs: options.pollingIntervalMs ?? 10_000,
      connectTimeoutMs: options.connectTimeoutMs ?? 8_000,
      noMessageTimeoutMs: options.noMessageTimeoutMs ?? 3_500,
      reconnectBaseMs: options.reconnectBaseMs ?? 1_000,
      reconnectMaxMs: options.reconnectMaxMs ?? 30_000,
      random: options.random ?? Math.random,
      scheduler: options.scheduler ?? defaultScheduler,
    };
  }

  start() {
    if (!this.stopped) return;

    this.stopped = false;
    this.reconnectAttempt = 0;
    this.options.onStatus("reconnecting");
    this.connect();
  }

  stop() {
    if (this.stopped) return;

    this.stopped = true;
    this.socketGeneration += 1;
    this.clearReconnectTimer();
    this.clearConnectTimer();
    this.clearNoMessageTimer();
    this.stopPolling();
    this.detachAndCloseSocket();
  }

  private connect() {
    if (this.stopped) return;

    this.clearReconnectTimer();
    this.detachAndCloseSocket();
    const generation = ++this.socketGeneration;
    this.failedSocketGeneration = null;
    this.options.onStatus("reconnecting");

    let socket: LiveSocket;
    try {
      socket = this.options.createSocket();
    } catch {
      this.handleSocketFailure(generation);
      return;
    }

    this.socket = socket;
    let receivedMessage = false;
    this.connectTimer = this.options.scheduler.setTimeout(() => {
      this.connectTimer = null;
      this.handleSocketFailure(generation);
    }, this.options.connectTimeoutMs);

    socket.onopen = () => {
      if (!this.isCurrentSocket(generation)) return;

      this.clearConnectTimer();
      this.stopPolling();
      this.options.onStatus("connected");
      this.clearNoMessageTimer();
      this.noMessageTimer = this.options.scheduler.setTimeout(() => {
        this.noMessageTimer = null;
        if (!this.isCurrentSocket(generation) || receivedMessage) return;
        this.options.onNoMessage();
      }, this.options.noMessageTimeoutMs);
    };

    socket.onmessage = (event) => {
      if (!this.isCurrentSocket(generation)) return;

      let payload: T;
      try {
        payload = this.options.parseMessage(event.data);
      } catch {
        this.handleSocketFailure(generation);
        return;
      }

      receivedMessage = true;
      this.reconnectAttempt = 0;
      this.clearNoMessageTimer();
      this.stopPolling();
      this.options.onStatus("connected");
      this.options.onData(payload, "websocket");
    };

    socket.onerror = () => {
      this.handleSocketFailure(generation);
    };

    socket.onclose = () => {
      this.handleSocketFailure(generation);
    };
  }

  private handleSocketFailure(generation: number) {
    if (this.stopped || generation !== this.socketGeneration || this.failedSocketGeneration === generation) {
      return;
    }

    this.failedSocketGeneration = generation;
    this.clearConnectTimer();
    this.clearNoMessageTimer();
    this.detachAndCloseSocket();
    this.options.onStatus("reconnecting");
    this.startPolling();
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer !== null) return;

    const exponentialDelay = Math.min(
      this.options.reconnectBaseMs * 2 ** this.reconnectAttempt,
      this.options.reconnectMaxMs,
    );
    const jitter = 0.75 + this.options.random() * 0.5;
    const delayMs = Math.min(this.options.reconnectMaxMs, Math.round(exponentialDelay * jitter));
    this.reconnectAttempt += 1;

    this.reconnectTimer = this.options.scheduler.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);
  }

  private startPolling() {
    if (this.stopped || this.polling) return;

    this.polling = true;
    this.pollGeneration += 1;
    this.runPoll(this.pollGeneration);
  }

  private runPoll(generation: number) {
    if (
      this.stopped ||
      !this.polling ||
      generation !== this.pollGeneration ||
      this.pollInFlightGeneration === generation
    ) {
      return;
    }

    this.pollInFlightGeneration = generation;
    this.options
      .poll()
      .then((payload) => {
        if (this.canUsePollResult(generation)) {
          this.options.onData(payload, "polling");
        }
      })
      .catch((error: unknown) => {
        if (this.canUsePollResult(generation)) {
          this.options.onStatus("offline");
          this.options.onPollError(error);
        }
      })
      .finally(() => {
        if (this.pollInFlightGeneration === generation) {
          this.pollInFlightGeneration = null;
        }
        if (!this.canUsePollResult(generation)) return;

        this.pollingTimer = this.options.scheduler.setTimeout(() => {
          this.pollingTimer = null;
          this.runPoll(generation);
        }, this.options.pollingIntervalMs);
      });
  }

  private stopPolling() {
    this.polling = false;
    this.pollGeneration += 1;
    if (this.pollingTimer !== null) {
      this.options.scheduler.clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  private canUsePollResult(generation: number) {
    return !this.stopped && this.polling && generation === this.pollGeneration;
  }

  private isCurrentSocket(generation: number) {
    return !this.stopped && generation === this.socketGeneration && this.failedSocketGeneration !== generation;
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer === null) return;
    this.options.scheduler.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearNoMessageTimer() {
    if (this.noMessageTimer === null) return;
    this.options.scheduler.clearTimeout(this.noMessageTimer);
    this.noMessageTimer = null;
  }

  private clearConnectTimer() {
    if (this.connectTimer === null) return;
    this.options.scheduler.clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private detachAndCloseSocket() {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;

    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      socket.close();
    } catch {
      // The browser may reject closing a socket that never finished opening.
    }
  }
}
