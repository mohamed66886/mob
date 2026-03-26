import AsyncStorage from "@react-native-async-storage/async-storage";

export type QueuedAttachment = {
  uri: string;
  name: string;
  mimeType: string;
  category: "image" | "file";
  file_url?: string;
};

export type QueuedMessage = {
  queue_id: string;
  room_id: number;
  content: string;
  type: "text" | "image" | "file";
  reply_to_message_id: number | null;
  created_at: string;
  attachment?: QueuedAttachment;
};

function roomQueueKey(roomId: number) {
  return `workspace_offline_queue_room_${roomId}`;
}

export async function loadRoomQueue(roomId: number): Promise<QueuedMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(roomQueueKey(roomId));
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((row) => row && typeof row === "object")
      .sort(
        (a, b) =>
          new Date(String(a.created_at || "")).getTime() -
          new Date(String(b.created_at || "")).getTime(),
      );
  } catch {
    return [];
  }
}

export async function saveRoomQueue(roomId: number, queue: QueuedMessage[]) {
  await AsyncStorage.setItem(roomQueueKey(roomId), JSON.stringify(queue));
}

export async function upsertQueueItem(roomId: number, item: QueuedMessage) {
  const queue = await loadRoomQueue(roomId);
  const idx = queue.findIndex((row) => row.queue_id === item.queue_id);

  if (idx >= 0) {
    queue[idx] = item;
  } else {
    queue.push(item);
  }

  await saveRoomQueue(roomId, queue);
}

export async function removeQueueItem(roomId: number, queueId: string) {
  const queue = await loadRoomQueue(roomId);
  const next = queue.filter((row) => row.queue_id !== queueId);
  await saveRoomQueue(roomId, next);
}
