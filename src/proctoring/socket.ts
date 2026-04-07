import { Socket } from "socket.io-client";
import { getRealtimeSocket } from "../lib/realtime";
import {
  ProctorDecision,
  ProctorEventPayload,
  ProctorRiskUpdate,
} from "./types";

type JoinAck = {
  ok: boolean;
  message?: string;
  warning_threshold?: number;
  auto_submit_threshold?: number;
  risk_score?: number;
};

type EmitAck = {
  ok: boolean;
  message?: string;
};

export function createProctorSocketClient(token: string) {
  const socket = getRealtimeSocket(token);

  function join(quizId: number): Promise<JoinAck> {
    return new Promise((resolve) => {
      socket.emit("proctor:join", { quizId }, (ack: JoinAck) => {
        resolve(ack || { ok: false, message: "No response" });
      });
    });
  }

  function sendEvent(payload: ProctorEventPayload): Promise<EmitAck> {
    return new Promise((resolve) => {
      socket.emit("proctor:event", payload, (ack: EmitAck) => {
        resolve(ack || { ok: false, message: "No response" });
      });
    });
  }

  function heartbeat(quizId: number): Promise<EmitAck & ProctorRiskUpdate> {
    return new Promise((resolve) => {
      socket.emit("proctor:heartbeat", { quizId }, (ack: EmitAck & ProctorRiskUpdate) => {
        resolve(ack || ({ ok: false, message: "No response" } as EmitAck & ProctorRiskUpdate));
      });
    });
  }

  function onRiskUpdate(handler: (payload: ProctorRiskUpdate) => void) {
    socket.on("proctor:risk_update", handler);
    return () => socket.off("proctor:risk_update", handler);
  }

  function onDecision(handler: (payload: ProctorDecision) => void) {
    socket.on("proctor:decision", handler);
    return () => socket.off("proctor:decision", handler);
  }

  return {
    socket,
    join,
    sendEvent,
    heartbeat,
    onRiskUpdate,
    onDecision,
  };
}

export type ProctorSocketClient = ReturnType<typeof createProctorSocketClient>;
export type RealtimeSocket = Socket;
