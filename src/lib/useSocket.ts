import { useEffect, useState, useCallback } from "react";
import { Alert } from "react-native";
import SocketManager from "./realtime";

export function useSocket(token: string) {
  const [isConnected, setIsConnected] = useState(false);
  const socket = SocketManager.getInstance(token as string).socket;

  const onConnect = useCallback(() => {
    console.log("Socket connected via hook");
    setIsConnected(true);
  }, []);

  const onDisconnect = useCallback(() => {
    console.log("Socket disconnected via hook");
    setIsConnected(false);
  }, []);

  const onConnectError = useCallback((error: Error) => {
    console.error("Socket connection error via hook:", error);
    Alert.alert("Connection Error", "Could not connect to the real-time server.");
  }, []);

  useEffect(() => {
    if (socket.connected) {
      onConnect();
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
    };
  }, [socket, onConnect, onDisconnect, onConnectError]);

  return { socket, isConnected };
}
