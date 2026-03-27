import { io, Socket } from "socket.io-client";
import { realtimeBaseURL } from "./api";

class SocketManager {
  private static instance: SocketManager | null = null;
  public socket: Socket;

  private constructor(token: string) {
    this.socket = io(realtimeBaseURL, {
      auth: { token },
      transports: ["websocket"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.setupEventListeners();
  }

  public static getInstance(token: string): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager(token);
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
