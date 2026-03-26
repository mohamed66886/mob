import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { User } from "../types/auth";
import { getRealtimeSocket } from "../lib/realtime";
import {
  ArrowLeft,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  Volume2,
  VolumeX,
  Users,
} from "lucide-react-native";
import {
  mediaDevices,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
} from "react-native-webrtc";
import Constants from "expo-constants";

const BRAND = {
  bg: "#0b1b33",
  card: "#102a4d",
  text: "#f8fafc",
  muted: "#9fb5d1",
  primary: "#2f7de1",
  danger: "#ef4444",
};

const STATS_INTERVAL_MS = 5000;
const AUTO_RETRY_TICK_MS = 4000;
const POOR_QUALITY_SUSTAIN_MS = 12000;
const AUTO_RETRY_COOLDOWN_MS = 20000;
const AUTO_RETRY_LABEL_MS = 3000;

const VIDEO_QUALITY_PROFILE = {
  fairRttMs: 180,
  poorRttMs: 350,
  fairLossPct: 3,
  poorLossPct: 8,
  poorSustainMs: POOR_QUALITY_SUSTAIN_MS,
  cooldownMs: AUTO_RETRY_COOLDOWN_MS,
};

const VOICE_QUALITY_PROFILE = {
  fairRttMs: 260,
  poorRttMs: 450,
  fairLossPct: 5,
  poorLossPct: 12,
  poorSustainMs: 16000,
  cooldownMs: 15000,
};

type Participant = {
  user_id: number;
  name?: string;
  is_muted?: boolean;
  is_camera_on?: boolean;
};

type WebrtcStatus = "stable" | "negotiating" | "reconnecting";
type QualityLevel = "good" | "fair" | "poor" | "unknown";

type PeerQuality = {
  level: QualityLevel;
  label: string;
  rttMs?: number;
  lossPct?: number;
  bitrateKbps?: number;
};

type QualityProfileSettings = {
  fairRttMs: number;
  poorRttMs: number;
  fairLossPct: number;
  poorLossPct: number;
  poorSustainMs: number;
  cooldownMs: number;
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function WorkspaceCallNativeScreen({
  token,
  user,
  route,
  navigation,
}: {
  token: string;
  user: User;
  route?: any;
  navigation?: any;
}) {
  const roomId = Number(route?.params?.roomId || 0);
  const roomName = String(route?.params?.roomName || `Room ${roomId}`);
  const callType: "voice" | "video" = route?.params?.callType === "video" ? "video" : "voice";
  const initialCallId = Number(route?.params?.callId || 0);
  const profileOverrideRaw = route?.params?.qualityProfile || route?.params?.rtcProfile;

  const [callId, setCallId] = useState<number | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(callType === "video");
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isConnecting, setIsConnecting] = useState(true);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [webrtcStatus, setWebrtcStatus] = useState<WebrtcStatus>("negotiating");
  const [elapsed, setElapsed] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<number, any>>({});
  const [peerQuality, setPeerQuality] = useState<Record<number, PeerQuality>>({});

  const socketRef = useRef<any>(null);
  const pulse = useRef(new Animated.Value(1)).current;
  const poorPulse = useRef(new Animated.Value(1)).current;
  const localStreamRef = useRef<any>(null);
  const peerConnectionsRef = useRef<Map<number, any>>(new Map());
  const joinedCallIdRef = useRef<number | null>(null);
  const callIdRef = useRef<number | null>(null);
  const peerIdRef = useRef(`mobile-${user.id}-${Math.random().toString(36).slice(2, 10)}`);
  const offeredPeersRef = useRef<Set<number>>(new Set());
  const inboundBytesRef = useRef<Map<number, { bytes: number; ts: number }>>(new Map());
  const poorSinceRef = useRef<Map<number, number>>(new Map());
  const lastAutoRetryRef = useRef<Map<number, number>>(new Map());
  const autoRetryTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const inCallManagerRef = useRef<any>(null);
  const [autoRetryingPeers, setAutoRetryingPeers] = useState<Set<number>>(new Set());

  const remoteEntries = useMemo(() => {
    return Object.entries(remoteStreams)
      .map(([userId, stream]) => ({ userId: Number(userId), stream }))
      .filter((row) => row.stream);
  }, [remoteStreams]);

  const isVideoCall = callType === "video";
  const toValidNumber = useCallback((value: any) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    if (parsed <= 0) return null;
    return parsed;
  }, []);

  const qualityProfile = useMemo(
    () => {
      const base: QualityProfileSettings = isVideoCall
        ? VIDEO_QUALITY_PROFILE
        : VOICE_QUALITY_PROFILE;

      const override =
        profileOverrideRaw && typeof profileOverrideRaw === "object"
          ? profileOverrideRaw
          : null;

      if (!override) return base;

      return {
        fairRttMs: toValidNumber(override.fairRttMs) ?? base.fairRttMs,
        poorRttMs: toValidNumber(override.poorRttMs) ?? base.poorRttMs,
        fairLossPct: toValidNumber(override.fairLossPct) ?? base.fairLossPct,
        poorLossPct: toValidNumber(override.poorLossPct) ?? base.poorLossPct,
        poorSustainMs: toValidNumber(override.poorSustainMs) ?? base.poorSustainMs,
        cooldownMs: toValidNumber(override.cooldownMs) ?? base.cooldownMs,
      };
    },
    [isVideoCall, profileOverrideRaw, toValidNumber],
  );

  const emitMediaState = useCallback(
    (nextMuted: boolean, nextCamera: boolean, currentCallId: number | null) => {
      if (!currentCallId) return;
      socketRef.current?.emit("call:media_state", {
        callId: currentCallId,
        isMuted: nextMuted,
        isCameraOn: nextCamera,
        isScreenSharing: false,
      });
    },
    [],
  );

  const applySpeakerRoute = useCallback((speakerOn: boolean) => {
    const manager = inCallManagerRef.current;
    if (!manager) return;

    try {
      if (typeof manager.setForceSpeakerphoneOn === "function") {
        manager.setForceSpeakerphoneOn(Boolean(speakerOn));
      }
      if (typeof manager.setSpeakerphoneOn === "function") {
        manager.setSpeakerphoneOn(Boolean(speakerOn));
      }
    } catch {
      // Keep call alive even if native audio route switch fails.
    }
  }, []);

  const cleanupPeer = useCallback((targetUserId: number) => {
    const pc = peerConnectionsRef.current.get(targetUserId);
    if (pc) {
      try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch {
        // ignore
      }
      peerConnectionsRef.current.delete(targetUserId);
    }

    setRemoteStreams((prev) => {
      const next = { ...prev };
      delete next[targetUserId];
      return next;
    });

    offeredPeersRef.current.delete(targetUserId);
  }, []);

  const createPeerConnection = useCallback(
    (targetUserId: number) => {
      const existing = peerConnectionsRef.current.get(targetUserId);
      if (existing) return existing;

      const pc: any = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track: any) => {
          pc.addTrack(track, stream);
        });
      }

      pc.onicecandidate = (event: any) => {
        const currentCallId = callIdRef.current;
        if (!event?.candidate || !currentCallId) return;
        socketRef.current?.emit("webrtc:ice_candidate", {
          callId: currentCallId,
          targetUserId,
          candidate: event.candidate,
        });
      };

      pc.ontrack = (event: any) => {
        const streamFromTrack = event?.streams?.[0];
        if (!streamFromTrack) return;

        setRemoteStreams((prev) => ({
          ...prev,
          [targetUserId]: streamFromTrack,
        }));
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "connected") {
          setWebrtcStatus("stable");
        }

        if (state === "disconnected") {
          setWebrtcStatus("reconnecting");
          offeredPeersRef.current.delete(targetUserId);
          setTimeout(() => {
            maybeCreateOffer(targetUserId).catch(() => {});
          }, 1200);
        }

        if (state === "failed" || state === "closed") {
          setWebrtcStatus("reconnecting");
          cleanupPeer(targetUserId);
          setTimeout(() => {
            maybeCreateOffer(targetUserId).catch(() => {});
          }, 500);
        }
      };

      peerConnectionsRef.current.set(targetUserId, pc);
      return pc;
    },
    [cleanupPeer],
  );

  const maybeCreateOffer = useCallback(
    async (targetUserId: number) => {
      const currentCallId = callIdRef.current || initialCallId;
      if (!currentCallId) return;
      if (targetUserId === user.id) return;
      if (offeredPeersRef.current.has(targetUserId)) return;

      // Deterministic initiator to avoid glare.
      if (Number(user.id) > Number(targetUserId)) return;

      try {
        const pc = createPeerConnection(targetUserId);
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: isVideoCall,
        });
        await pc.setLocalDescription(offer);

        socketRef.current?.emit("webrtc:offer", {
          callId: currentCallId,
          targetUserId,
          sdp: offer,
        });

        offeredPeersRef.current.add(targetUserId);
      } catch {
        // keep peer and retry on next participants update
      }
    },
    [createPeerConnection, initialCallId, isVideoCall, user.id],
  );

  const joinCall = useCallback(
    (id: number) => {
      if (!id) return;
      if (joinedCallIdRef.current === id) return;

      joinedCallIdRef.current = id;
      callIdRef.current = id;
      setCallId(id);
      setIsConnecting(true);
      setWebrtcStatus("negotiating");

      socketRef.current?.emit("call:join", {
        callId: id,
        peerId: peerIdRef.current,
      });
    },
    [],
  );

  const deriveQuality = useCallback((
    rttMs?: number,
    lossPct?: number,
    bitrateKbps?: number,
  ): PeerQuality => {
    const bitrateText =
      typeof bitrateKbps === "number" && Number.isFinite(bitrateKbps)
        ? ` • ${Math.max(0, Math.round(bitrateKbps))} kbps`
        : "";

    if (typeof rttMs !== "number" || typeof lossPct !== "number") {
      return {
        level: "unknown",
        label: `Unknown${bitrateText}`,
        bitrateKbps,
      };
    }

    if (rttMs > qualityProfile.poorRttMs || lossPct > qualityProfile.poorLossPct) {
      return {
        level: "poor",
        label: `Poor (${Math.round(rttMs)}ms/${lossPct.toFixed(1)}%)${bitrateText}`,
        rttMs,
        lossPct,
        bitrateKbps,
      };
    }

    if (rttMs > qualityProfile.fairRttMs || lossPct > qualityProfile.fairLossPct) {
      return {
        level: "fair",
        label: `Fair (${Math.round(rttMs)}ms/${lossPct.toFixed(1)}%)${bitrateText}`,
        rttMs,
        lossPct,
        bitrateKbps,
      };
    }

    return {
      level: "good",
      label: `Good (${Math.round(rttMs)}ms/${lossPct.toFixed(1)}%)${bitrateText}`,
      rttMs,
      lossPct,
      bitrateKbps,
    };
  }, [qualityProfile]);

  useEffect(() => {
    callIdRef.current = callId;
  }, [callId]);

  useEffect(() => {
    if (!isSocketConnected) return;

    let cancelled = false;

    const readPeerStats = async () => {
      const entries = Array.from(peerConnectionsRef.current.entries());

      for (const [targetUserId, pc] of entries) {
        if (!pc || typeof pc.getStats !== "function") continue;

        try {
          const report = await pc.getStats();
          if (cancelled) return;

          let rttMs: number | undefined;
          let packetsLost: number | undefined;
          let packetsReceived: number | undefined;
          let bytesReceived: number | undefined;

          const consumeStat = (stat: any) => {
            if (!stat) return;

            if (
              stat.type === "candidate-pair" &&
              stat.nominated &&
              typeof stat.currentRoundTripTime === "number"
            ) {
              rttMs = stat.currentRoundTripTime * 1000;
            }

            if (
              stat.type === "inbound-rtp" &&
              (stat.kind === "video" || stat.kind === "audio")
            ) {
              if (typeof stat.packetsLost === "number") packetsLost = stat.packetsLost;
              if (typeof stat.packetsReceived === "number") {
                packetsReceived = stat.packetsReceived;
              }
              if (typeof stat.bytesReceived === "number") {
                bytesReceived = stat.bytesReceived;
              }
            }
          };

          if (typeof report?.forEach === "function") {
            report.forEach((stat: any) => consumeStat(stat));
          } else if (Array.isArray(report)) {
            report.forEach((stat: any) => consumeStat(stat));
          }

          const totalReceived = typeof packetsReceived === "number" ? packetsReceived : 0;
          const totalLost = typeof packetsLost === "number" ? Math.max(0, packetsLost) : 0;
          const denominator = totalReceived + totalLost;
          const lossPct = denominator > 0 ? (totalLost / denominator) * 100 : undefined;
          let bitrateKbps: number | undefined;

          if (typeof bytesReceived === "number") {
            const nowTs = Date.now();
            const prev = inboundBytesRef.current.get(Number(targetUserId));
            if (prev && bytesReceived >= prev.bytes && nowTs > prev.ts) {
              const deltaBytes = bytesReceived - prev.bytes;
              const deltaMs = nowTs - prev.ts;
              bitrateKbps = (deltaBytes * 8) / Math.max(1, deltaMs);
            }
            inboundBytesRef.current.set(Number(targetUserId), {
              bytes: bytesReceived,
              ts: nowTs,
            });
          }

          const quality = deriveQuality(rttMs, lossPct, bitrateKbps);

          setPeerQuality((prev) => ({
            ...prev,
            [Number(targetUserId)]: quality,
          }));
        } catch {
          setPeerQuality((prev) => ({
            ...prev,
            [Number(targetUserId)]: { level: "unknown", label: "Unknown" },
          }));
        }
      }
    };

    readPeerStats();
    const timer = setInterval(readPeerStats, STATS_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [deriveQuality, isSocketConnected]);

  useEffect(() => {
    if (!roomId) {
      Alert.alert("Error", "Invalid room.");
      navigation?.goBack?.();
      return;
    }

    let mounted = true;

    const setupLocalMedia = async () => {
      try {
        const stream = await mediaDevices.getUserMedia({
          audio: true,
          video: isVideoCall
            ? {
                facingMode: "user",
                width: 640,
                height: 480,
                frameRate: 24,
              }
            : false,
        });

        if (!mounted) {
          stream.getTracks().forEach((track: any) => track.stop());
          return;
        }

        localStreamRef.current = stream;
        setLocalStream(stream);
      } catch {
        Alert.alert("Media Error", "Unable to access microphone/camera.");
      }
    };

    setupLocalMedia();

    return () => {
      mounted = false;
    };
  }, [isVideoCall, navigation, roomId]);

  useEffect(() => {
    const isExpoGo = Constants.appOwnership === "expo";
    if (isExpoGo) {
      inCallManagerRef.current = null;
      return;
    }

    try {
      // Lazy require keeps the screen resilient if native module is unavailable.
      const inCallManager = require("react-native-incall-manager");
      inCallManagerRef.current = inCallManager;

      if (typeof inCallManager.start === "function") {
        inCallManager.start({ media: isVideoCall ? "video" : "audio" });
      }

      applySpeakerRoute(isSpeakerOn);
    } catch {
      inCallManagerRef.current = null;
    }

    return () => {
      const manager = inCallManagerRef.current;
      if (!manager) return;

      try {
        if (typeof manager.setForceSpeakerphoneOn === "function") {
          manager.setForceSpeakerphoneOn(null);
        }
        if (typeof manager.stop === "function") {
          manager.stop();
        }
      } catch {
        // no-op
      }
    };
  }, [applySpeakerRoute, isSpeakerOn, isVideoCall]);

  useEffect(() => {
    if (!roomId) return;

    const socket = getRealtimeSocket(token);
    socketRef.current = socket;
    setIsSocketConnected(Boolean(socket.connected));

    const startFlow = () => {
      if (initialCallId > 0) {
        joinCall(initialCallId);
        return;
      }
      socket.emit("call:start", { roomId, callType });
      setIsConnecting(true);
    };

    const onSocketConnected = () => {
      setIsSocketConnected(true);
      setWebrtcStatus("negotiating");

      const currentCallId = callIdRef.current || initialCallId;
      if (currentCallId) {
        socket.emit("call:join", {
          callId: currentCallId,
          peerId: peerIdRef.current,
        });
        setIsConnecting(true);
        offeredPeersRef.current.clear();
        return;
      }

      startFlow();
    };

    const onSocketDisconnected = () => {
      setIsSocketConnected(false);
      setWebrtcStatus("reconnecting");
    };

    const onCallStarted = (payload: any) => {
      const call = payload?.call;
      if (!call || Number(call.room_id) !== roomId) return;

      const nextCallId = Number(call.id || 0);
      if (!nextCallId) return;

      setParticipants(Array.isArray(payload?.participants) ? payload.participants : []);
      setIsConnecting(false);
      joinCall(nextCallId);
    };

    const onCallParticipants = (payload: any) => {
      const current = callId || initialCallId || payload?.call_id;
      if (Number(payload?.call_id) !== Number(current)) return;

      const nextParticipants = Array.isArray(payload?.participants) ? payload.participants : [];
      setParticipants(nextParticipants);
      setIsConnecting(false);

      const activeUserIds = new Set(nextParticipants.map((p: any) => Number(p.user_id)).filter(Boolean));

      // Remove peers no longer present.
      for (const userId of Array.from(peerConnectionsRef.current.keys())) {
        if (!activeUserIds.has(Number(userId))) {
          cleanupPeer(Number(userId));
        }
      }

      // Create offers to other participants when needed.
      nextParticipants.forEach((p: any) => {
        const targetId = Number(p.user_id || 0);
        if (!targetId || targetId === Number(user.id)) return;
        maybeCreateOffer(targetId).catch(() => {});
      });
    };

    const onCallEnded = (payload: any) => {
      const current = callId || initialCallId;
      if (current && Number(payload?.call_id) !== Number(current)) return;
      Alert.alert("Call Ended", "The call has ended.", [
        { text: "OK", onPress: () => navigation?.goBack?.() },
      ]);
    };

    const onOffer = async ({ callId: incomingCallId, fromUserId, sdp }: any) => {
      const current = callId || initialCallId;
      if (current && Number(incomingCallId) !== Number(current)) return;

      try {
        const targetId = Number(fromUserId);
        if (!targetId) return;

        const pc = createPeerConnection(targetId);

        if (pc.signalingState === "have-local-offer") {
          await pc.setLocalDescription({ type: "rollback" } as any);
        }

        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socketRef.current?.emit("webrtc:answer", {
          callId: incomingCallId,
          targetUserId: targetId,
          sdp: answer,
        });
      } catch {
        // ignore transient signaling errors
      }
    };

    const onAnswer = async ({ callId: incomingCallId, fromUserId, sdp }: any) => {
      const current = callId || initialCallId;
      if (current && Number(incomingCallId) !== Number(current)) return;

      try {
        const targetId = Number(fromUserId);
        if (!targetId) return;
        const pc = createPeerConnection(targetId);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch {
        // ignore
      }
    };

    const onIceCandidate = async ({ callId: incomingCallId, fromUserId, candidate }: any) => {
      const current = callId || initialCallId;
      if (current && Number(incomingCallId) !== Number(current)) return;

      try {
        const targetId = Number(fromUserId);
        if (!targetId || !candidate) return;
        const pc = createPeerConnection(targetId);
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // ignore
      }
    };

    const onSocketError = (payload: any) => {
      if (!payload?.message) return;
      Alert.alert("Call Error", String(payload.message));
    };

    socket.on("call:started", onCallStarted);
    socket.on("call:participants", onCallParticipants);
    socket.on("call:ended", onCallEnded);
    socket.on("webrtc:offer", onOffer);
    socket.on("webrtc:answer", onAnswer);
    socket.on("webrtc:ice_candidate", onIceCandidate);
    socket.on("socket_error", onSocketError);
    socket.on("connect", onSocketConnected);
    socket.on("disconnect", onSocketDisconnected);

    if (socket.connected) {
      onSocketConnected();
    }

    return () => {
      const current = callId || initialCallId;
      if (current) {
        socket.emit("call:leave", { callId: current });
      }
      socket.off("call:started", onCallStarted);
      socket.off("call:participants", onCallParticipants);
      socket.off("call:ended", onCallEnded);
      socket.off("webrtc:offer", onOffer);
      socket.off("webrtc:answer", onAnswer);
      socket.off("webrtc:ice_candidate", onIceCandidate);
      socket.off("socket_error", onSocketError);
      socket.off("connect", onSocketConnected);
      socket.off("disconnect", onSocketDisconnected);

      for (const targetId of Array.from(peerConnectionsRef.current.keys())) {
        cleanupPeer(targetId);
      }

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track: any) => track.stop());
      }
      localStreamRef.current = null;
      setLocalStream(null);
      offeredPeersRef.current.clear();
      inboundBytesRef.current.clear();
      poorSinceRef.current.clear();
      lastAutoRetryRef.current.clear();
      for (const timeoutId of Array.from(autoRetryTimeoutsRef.current.values())) {
        clearTimeout(timeoutId);
      }
      autoRetryTimeoutsRef.current.clear();
      setAutoRetryingPeers(new Set());
      joinedCallIdRef.current = null;
      callIdRef.current = null;
    };
  }, [
    callId,
    callType,
    cleanupPeer,
    createPeerConnection,
    initialCallId,
    joinCall,
    maybeCreateOffer,
    navigation,
    roomId,
    token,
    user.id,
  ]);

  useEffect(() => {
    if (!isSocketConnected) {
      setWebrtcStatus("reconnecting");
      return;
    }

    if (isConnecting) {
      setWebrtcStatus("negotiating");
      return;
    }

    if (participants.length > 1 && remoteEntries.length === 0) {
      setWebrtcStatus("reconnecting");
      return;
    }

    setWebrtcStatus("stable");
  }, [isConnecting, isSocketConnected, participants.length, remoteEntries.length]);

  useEffect(() => {
    if (isConnecting) return;
    const timer = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [isConnecting]);

  useEffect(() => {
    if (!isConnecting) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.08,
          duration: 500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [isConnecting, pulse]);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(poorPulse, {
          toValue: 1.08,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(poorPulse, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    anim.start();
    return () => anim.stop();
  }, [poorPulse]);

  const membersLabel = useMemo(() => {
    const count = participants.length || 1;
    return `${count} in call`;
  }, [participants.length]);

  const getParticipantName = useCallback(
    (participantUserId: number) => {
      const match = participants.find(
        (p) => Number(p?.user_id) === Number(participantUserId),
      );
      if (match?.name) return String(match.name);
      return `User ${participantUserId}`;
    },
    [participants],
  );

  const missingParticipantIds = useMemo(() => {
    const remoteSet = new Set(remoteEntries.map((item) => Number(item.userId)));
    return participants
      .map((p) => Number(p.user_id || 0))
      .filter((id) => id && id !== Number(user.id) && !remoteSet.has(id));
  }, [participants, remoteEntries, user.id]);

  const retryMissingPeers = useCallback(() => {
    if (missingParticipantIds.length === 0) return;

    missingParticipantIds.forEach((peerId) => {
      cleanupPeer(peerId);
      offeredPeersRef.current.delete(peerId);
      maybeCreateOffer(peerId).catch(() => {});
    });

    setWebrtcStatus("reconnecting");
  }, [cleanupPeer, maybeCreateOffer, missingParticipantIds]);

  const retryPeer = useCallback(
    (peerId: number, source: "manual" | "auto" = "manual") => {
      cleanupPeer(peerId);
      offeredPeersRef.current.delete(peerId);
      maybeCreateOffer(peerId).catch(() => {});
      setWebrtcStatus("reconnecting");

      if (source === "auto") {
        setAutoRetryingPeers((prev) => {
          const next = new Set(prev);
          next.add(peerId);
          return next;
        });

        const existingTimeout = autoRetryTimeoutsRef.current.get(peerId);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }

        const timeoutId = setTimeout(() => {
          setAutoRetryingPeers((prev) => {
            const next = new Set(prev);
            next.delete(peerId);
            return next;
          });
          autoRetryTimeoutsRef.current.delete(peerId);
        }, AUTO_RETRY_LABEL_MS);

        autoRetryTimeoutsRef.current.set(peerId, timeoutId);
      }
    },
    [cleanupPeer, maybeCreateOffer],
  );

  useEffect(() => {
    const now = Date.now();
    const activePeerIds = new Set<number>();

    Object.entries(peerQuality).forEach(([peerIdRaw, quality]) => {
      const peerId = Number(peerIdRaw);
      if (!peerId) return;
      activePeerIds.add(peerId);

      if (quality?.level === "poor") {
        const firstPoorAt = poorSinceRef.current.get(peerId) || now;
        poorSinceRef.current.set(peerId, firstPoorAt);
      } else {
        poorSinceRef.current.delete(peerId);
      }
    });

    for (const peerId of Array.from(poorSinceRef.current.keys())) {
      if (!activePeerIds.has(peerId)) {
        poorSinceRef.current.delete(peerId);
      }
    }
  }, [peerQuality]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();

      for (const [peerId, poorSince] of Array.from(poorSinceRef.current.entries())) {
        if (now - poorSince < qualityProfile.poorSustainMs) continue;

        const lastAuto = lastAutoRetryRef.current.get(peerId) || 0;
        if (now - lastAuto < qualityProfile.cooldownMs) continue;

        lastAutoRetryRef.current.set(peerId, now);
        retryPeer(peerId, "auto");
      }
    }, AUTO_RETRY_TICK_MS);

    return () => clearInterval(timer);
  }, [qualityProfile, retryPeer]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);

    const stream = localStreamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach((track: any) => {
        track.enabled = !next;
      });
    }

    emitMediaState(next, isCameraOn, callId || initialCallId || null);
  };

  const toggleSpeaker = () => {
    setIsSpeakerOn((prev) => {
      const next = !prev;
      applySpeakerRoute(next);
      return next;
    });
  };

  const toggleCamera = () => {
    const next = !isCameraOn;
    setIsCameraOn(next);

    const stream = localStreamRef.current;
    if (stream) {
      stream.getVideoTracks().forEach((track: any) => {
        track.enabled = next;
      });
    }

    emitMediaState(isMuted, next, callId || initialCallId || null);
  };

  const endCall = () => {
    const current = callId || initialCallId;
    if (current) {
      socketRef.current?.emit("call:end", { callId: current });
    }
    navigation?.goBack?.();
  };

  const topStatusText = isConnecting
    ? "Connecting..."
    : `${callType === "video" ? "Video" : "Voice"} • ${formatTime(elapsed)} • ${membersLabel}`;

  const connectionBadgeText = isSocketConnected ? "Connected" : "Reconnecting...";
  const mediaBadgeText =
    webrtcStatus === "stable"
      ? "Media Stable"
      : webrtcStatus === "negotiating"
        ? "Negotiating..."
        : "Media Reconnecting...";

  const poorParticipantsCount = useMemo(() => {
    const ids = participants
      .map((p) => Number(p?.user_id || 0))
      .filter((id) => id && id !== Number(user.id));

    return ids.reduce((count, id) => {
      return peerQuality[id]?.level === "poor" ? count + 1 : count;
    }, 0);
  }, [participants, peerQuality, user.id]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.headerRow}>
        <Pressable style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
          <ArrowLeft color={BRAND.text} size={22} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{roomName}</Text>
          <Text style={styles.subtitle}>{topStatusText}</Text>
        </View>
        <View style={[styles.connectionBadge, isSocketConnected ? styles.connectionBadgeOk : styles.connectionBadgeWarn]}>
          <Text style={styles.connectionBadgeText}>{connectionBadgeText}</Text>
        </View>
        <View style={[
          styles.connectionBadge,
          webrtcStatus === "stable" ? styles.connectionBadgeOk : styles.connectionBadgeWarn,
        ]}>
          <Text style={styles.connectionBadgeText}>{mediaBadgeText}</Text>
        </View>
        <View
          style={[
            styles.connectionBadge,
            poorParticipantsCount > 0
              ? styles.connectionBadgeWarn
              : styles.connectionBadgeOk,
          ]}
        >
          <Text style={styles.connectionBadgeText}>Poor: {poorParticipantsCount}</Text>
        </View>
      </View>

      <View style={styles.centerArea}>
        {isVideoCall ? (
          <View style={styles.videoWrap}>
            {remoteEntries.length > 0 ? (
              <View style={styles.remoteGrid}>
                {remoteEntries.map((entry, index) => {
                  const isSingle = remoteEntries.length === 1;
                  const isTwo = remoteEntries.length === 2;
                  const participantName = getParticipantName(entry.userId);
                  const qualityLevel = peerQuality[entry.userId]?.level || "unknown";
                  const isPoor = qualityLevel === "poor";
                  const isAutoRetrying = autoRetryingPeers.has(entry.userId);
                  const lastAutoRetryAt = lastAutoRetryRef.current.get(entry.userId) || 0;
                  const cooldownLeftSec = lastAutoRetryAt
                    ? Math.max(
                        0,
                        Math.ceil(
                          (qualityProfile.cooldownMs - (nowMs - lastAutoRetryAt)) / 1000,
                        ),
                      )
                    : 0;
                  return (
                    <Animated.View
                      key={`remote-${entry.userId}-${index}`}
                      style={[
                        styles.remoteTile,
                        isSingle && styles.remoteTileSingle,
                        isTwo && styles.remoteTileHalf,
                        isPoor && styles.remoteTilePoor,
                        isPoor ? { transform: [{ scale: poorPulse }] } : null,
                      ]}
                    >
                      <RTCView
                        streamURL={entry.stream.toURL()}
                        style={styles.remoteVideo}
                        objectFit="cover"
                      />
                      <View style={styles.remoteNameBadge}>
                        <Text style={styles.remoteNameText} numberOfLines={1}>
                          {participantName}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.tileRetryBtn}
                        onPress={() => retryPeer(entry.userId)}
                      >
                        <Text style={styles.tileRetryBtnText}>Retry</Text>
                      </Pressable>
                      {isAutoRetrying ? (
                        <View style={styles.autoRetryBadge}>
                          <Text style={styles.autoRetryText}>Auto-retrying...</Text>
                        </View>
                      ) : null}
                      {cooldownLeftSec > 0 ? (
                        <View style={styles.cooldownBadge}>
                          <Text style={styles.cooldownText}>Retry in {cooldownLeftSec}s</Text>
                        </View>
                      ) : null}
                      <View
                        style={[
                          styles.qualityBadge,
                          qualityLevel === "good"
                            ? styles.qualityGood
                            : qualityLevel === "fair"
                              ? styles.qualityFair
                              : qualityLevel === "poor"
                                ? styles.qualityPoor
                                : styles.qualityUnknown,
                        ]}
                      >
                        <Text style={styles.qualityText} numberOfLines={1}>
                          {peerQuality[entry.userId]?.label || "Unknown"}
                        </Text>
                      </View>
                    </Animated.View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.waitRemote}>
                <Animated.View style={[styles.avatarPulse, { transform: [{ scale: pulse }] }]}>
                  <Users color={BRAND.text} size={34} />
                </Animated.View>
                <Text style={styles.centerText}>Waiting for participant video...</Text>
              </View>
            )}

            {localStream ? (
              <RTCView
                streamURL={localStream.toURL()}
                style={styles.localVideo}
                objectFit="cover"
                mirror
              />
            ) : null}

            {missingParticipantIds.length > 0 ? (
              <Pressable style={styles.retryBtn} onPress={retryMissingPeers}>
                <Text style={styles.retryBtnText}>
                  Retry Missing Peers ({missingParticipantIds.length})
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            <Animated.View style={[styles.avatarPulse, { transform: [{ scale: pulse }] }]}>
              <Users color={BRAND.text} size={38} />
            </Animated.View>
            <Text style={styles.centerText}>{isConnecting ? "Starting call" : "Call in progress"}</Text>
          </>
        )}
      </View>

      <View style={styles.controlRow}>
        <Pressable style={[styles.circleBtn, isMuted && styles.circleBtnActive]} onPress={toggleMute}>
          {isMuted ? <MicOff color={BRAND.text} size={20} /> : <Mic color={BRAND.text} size={20} />}
        </Pressable>

        <Pressable style={[styles.circleBtn, !isSpeakerOn && styles.circleBtnActive]} onPress={toggleSpeaker}>
          {isSpeakerOn ? <Volume2 color={BRAND.text} size={20} /> : <VolumeX color={BRAND.text} size={20} />}
        </Pressable>

        {isVideoCall ? (
          <Pressable style={[styles.circleBtn, !isCameraOn && styles.circleBtnActive]} onPress={toggleCamera}>
            {isCameraOn ? <Video color={BRAND.text} size={20} /> : <VideoOff color={BRAND.text} size={20} />}
          </Pressable>
        ) : (
          <View style={styles.circleBtnGhost} />
        )}

        <Pressable style={styles.endBtn} onPress={endCall}>
          <Phone color="white" size={20} style={{ transform: [{ rotate: "135deg" }] }} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.bg, paddingHorizontal: 16 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  title: { color: BRAND.text, fontSize: 20, fontWeight: "800" },
  subtitle: { color: BRAND.muted, fontSize: 12, marginTop: 2 },
  connectionBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  connectionBadgeOk: {
    backgroundColor: "rgba(22,163,74,0.15)",
    borderColor: "rgba(22,163,74,0.45)",
  },
  connectionBadgeWarn: {
    backgroundColor: "rgba(245,158,11,0.15)",
    borderColor: "rgba(245,158,11,0.45)",
  },
  connectionBadgeText: {
    color: BRAND.text,
    fontSize: 11,
    fontWeight: "700",
  },

  centerArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  avatarPulse: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: BRAND.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: BRAND.primary,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  centerText: { color: BRAND.text, fontSize: 15, fontWeight: "700" },

  videoWrap: {
    width: "100%",
    height: "82%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#07101f",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  remoteGrid: {
    width: "100%",
    height: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    padding: 6,
  },
  remoteTile: {
    width: "49%",
    height: "49%",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#0f2039",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  remoteTileSingle: {
    width: "100%",
    height: "100%",
  },
  remoteTileHalf: {
    width: "100%",
    height: "49%",
  },
  remoteVideo: {
    width: "100%",
    height: "100%",
  },
  remoteTilePoor: {
    borderColor: "rgba(239,68,68,0.9)",
    shadowColor: "#ef4444",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  remoteNameBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
    maxWidth: "78%",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  remoteNameText: {
    color: BRAND.text,
    fontSize: 11,
    fontWeight: "700",
  },
  tileRetryBtn: {
    position: "absolute",
    left: 8,
    top: 8,
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(15,23,42,0.68)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  tileRetryBtnText: {
    color: BRAND.text,
    fontSize: 10,
    fontWeight: "700",
  },
  autoRetryBadge: {
    position: "absolute",
    left: 56,
    top: 8,
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(245,158,11,0.22)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.6)",
  },
  autoRetryText: {
    color: BRAND.text,
    fontSize: 10,
    fontWeight: "700",
  },
  cooldownBadge: {
    position: "absolute",
    left: 56,
    top: 32,
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(15,23,42,0.72)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.6)",
  },
  cooldownText: {
    color: BRAND.text,
    fontSize: 10,
    fontWeight: "700",
  },
  qualityBadge: {
    position: "absolute",
    right: 8,
    top: 8,
    maxWidth: "75%",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
  },
  qualityGood: {
    backgroundColor: "rgba(22,163,74,0.22)",
    borderColor: "rgba(22,163,74,0.55)",
  },
  qualityFair: {
    backgroundColor: "rgba(245,158,11,0.22)",
    borderColor: "rgba(245,158,11,0.55)",
  },
  qualityPoor: {
    backgroundColor: "rgba(239,68,68,0.22)",
    borderColor: "rgba(239,68,68,0.55)",
  },
  qualityUnknown: {
    backgroundColor: "rgba(148,163,184,0.2)",
    borderColor: "rgba(148,163,184,0.55)",
  },
  qualityText: {
    color: BRAND.text,
    fontSize: 10,
    fontWeight: "700",
  },
  localVideo: {
    position: "absolute",
    width: 120,
    height: 180,
    right: 12,
    bottom: 12,
    borderRadius: 12,
    backgroundColor: "#0f2039",
  },
  waitRemote: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  retryBtn: {
    position: "absolute",
    left: 12,
    bottom: 12,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(15,23,42,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  retryBtnText: {
    color: BRAND.text,
    fontSize: 12,
    fontWeight: "700",
  },

  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 26,
    gap: 10,
  },
  circleBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  circleBtnGhost: {
    width: 56,
    height: 56,
  },
  circleBtnActive: {
    backgroundColor: "#1f3758",
    borderColor: "rgba(255,255,255,0.25)",
  },
  endBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.danger,
  },
});