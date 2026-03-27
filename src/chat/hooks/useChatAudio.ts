import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated } from "react-native";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";

type VoiceAttachment = {
  uri: string;
  name: string;
  mimeType: string;
  category: "voice";
};

type UseChatAudioParams = {
  onVoiceRecorded: (attachment: VoiceAttachment) => void;
};

export function useChatAudio({ onVoiceRecorded }: UseChatAudioParams) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [audioSound, setAudioSound] = useState<Audio.Sound | null>(null);
  const [playingUri, setPlayingUri] = useState<string | null>(null);

  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveAnims = useRef(Array.from({ length: 15 }).map(() => new Animated.Value(0.2))).current;

  useEffect(() => {
    if (isRecording) {
      const anims = waveAnims.map((anim) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: Math.random() * 0.8 + 0.3,
              duration: 300 + Math.random() * 200,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.2,
              duration: 300 + Math.random() * 200,
              useNativeDriver: true,
            }),
          ]),
        ),
      );
      anims.forEach((a) => a.start());
      return () => anims.forEach((a) => a.stop());
    }
  }, [isRecording, waveAnims]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (audioSound) {
        audioSound.unloadAsync().catch(() => {});
      }
    };
  }, [audioSound]);

  const toggleRecording = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isRecording && recording) {
      try {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        setIsRecording(false);
        setRecording(null);

        if (uri) {
          onVoiceRecorded({
            uri,
            name: `voice_${Date.now()}.m4a`,
            mimeType: "audio/m4a",
            category: "voice",
          });
        }
      } catch {
        setIsRecording(false);
        setRecording(null);
      }
      return;
    }

    try {
      const permInfo = await Audio.requestPermissionsAsync();
      if (!permInfo.granted) {
        Alert.alert("الصلاحيات", "نحتاج صلاحية الميكروفون لتسجيل الصوت.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );

      setRecording(newRecording);
      setIsRecording(true);
      setRecordingMs(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingMs((prev) => prev + 1000);
      }, 1000);
    } catch {
      Alert.alert("خطأ", "فشل بدء التسجيل");
      setIsRecording(false);
    }
  }, [isRecording, onVoiceRecorded, recording]);

  const togglePlayVoice = useCallback(
    async (uri: string) => {
      if (!uri) return;
      try {
        if (playingUri === uri && audioSound) {
          await audioSound.pauseAsync();
          setPlayingUri(null);
          return;
        }

        if (audioSound) {
          await audioSound.unloadAsync();
        }

        const { sound } = await Audio.Sound.createAsync({ uri });
        setAudioSound(sound);
        setPlayingUri(uri);
        await sound.playAsync();

        sound.setOnPlaybackStatusUpdate((status: any) => {
          if (status.didJustFinish) setPlayingUri(null);
        });
      } catch {
        Alert.alert("خطأ", "فشل تشغيل المقطع الصوتي");
      }
    },
    [audioSound, playingUri],
  );

  return {
    isRecording,
    recordingMs,
    playingUri,
    waveAnims,
    toggleRecording,
    togglePlayVoice,
  };
}
