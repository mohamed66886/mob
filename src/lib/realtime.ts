import { io, Socket } from "socket.io-client";
import { realtimeBaseURL } from "./api";

class SocketManager {
  private static instance: SocketManager | null = null;
  public socket: Socket;
  private authToken: string;

  private constructor(token: string) {
    this.authToken = String(token || "").trim();
    this.socket = io(realtimeBaseURL, {
      auth: { token: this.authToken },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setupEventListeners();
  }

  public static getInstance(token: string): SocketManager {
    const normalizedToken = String(token || "").trim();

    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager(normalizedToken);
    } else if (
      normalizedToken &&
      SocketManager.instance.authToken !== normalizedToken
    ) {
      SocketManager.instance.refreshAuthToken(normalizedToken);
    }

    return SocketManager.instance;
  }

  public static getSocket(token: string): Socket {
    return SocketManager.getInstance(token).socket;
  }

  private setupEventListeners() {
    this.socket.on("connect", () => {
      console.log("Socket connected:", this.socket.id);
    });

    this.socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
    });

    this.socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });
  }

  private refreshAuthToken(nextToken: string) {
    this.authToken = nextToken;

    this.socket.auth = {
      ...(typeof this.socket.auth === "object" && this.socket.auth
        ? this.socket.auth
        : {}),
      token: nextToken,
    };

    if (this.socket.connected) {
      this.socket.disconnect();
    }

    this.socket.connect();
  }

  public static disconnect() {
    if (SocketManager.instance) {
      SocketManager.instance.socket.disconnect();
      SocketManager.instance = null;
    }
  }
}

export function getRealtimeSocket(token: string): Socket {
  return SocketManager.getSocket(token);
}

export function disconnectRealtimeSocket() {
  SocketManager.disconnect();
}

export default SocketManager;
