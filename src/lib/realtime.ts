import { io, Socket } from "socket.io-client";
import { realtimeBaseURL } from "./api";

let socket: Socket | null = null;

export function getRealtimeSocket(token: string): Socket {
  if (socket && socket.connected) return socket;

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(realtimeBaseURL, {
    auth: { token },
    transports: ["websocket"],
  });

  return socket;
}

export function disconnectRealtimeSocket() {
  if (!socket) return;
  socket.disconnect();
  socket = null;
}
