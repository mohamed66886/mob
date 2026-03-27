import AsyncStorage from "@react-native-async-storage/async-storage";

const OFFLINE_QUEUE_KEY = "@workspace_queued_messages";
let hasPersistentQueue: boolean | null = null;
let warnedStorageFallback = false;
let memoryQueueStore: QueuedMessage[] = [];

export type QueuedMessage = {
  queue_id: string;
  room_id: number;
  content: string;
  type: "text" | "image" | "file" | "voice_note";
  reply_to_message_id: number | null;
  created_at: string;
  attachment?: {
    uri: string;
    name: string;
    mimeType: string;
    category: "image" | "file" | "voice";
    file_url?: string;
  };
};

function warnStorageFallbackOnce() {
  if (warnedStorageFallback) return;
  warnedStorageFallback = true;
  console.warn("AsyncStorage unavailable. Using in-memory queue fallback for this session.");
}

async function canUsePersistentQueue(): Promise<boolean> {
  if (hasPersistentQueue !== null) return hasPersistentQueue;
  try {
    await AsyncStorage.getItem("@queue_probe_key");
    hasPersistentQueue = true;
  } catch {
    hasPersistentQueue = false;
    warnStorageFallbackOnce();
  }
  return hasPersistentQueue;
}

async function readQueueStore(): Promise<QueuedMessage[]> {
  const persistent = await canUsePersistentQueue();
  if (!persistent) return [...memoryQueueStore];
  try {
    const data = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    hasPersistentQueue = false;
    warnStorageFallbackOnce();
    return [...memoryQueueStore];
  }
}

async function writeQueueStore(items: QueuedMessage[]): Promise<void> {
  const persistent = await canUsePersistentQueue();
  if (!persistent) {
    memoryQueueStore = [...items];
    return;
  }
  try {
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
    memoryQueueStore = [...items];
  } catch {
    hasPersistentQueue = false;
    warnStorageFallbackOnce();
    memoryQueueStore = [...items];
  }
}

export async function getRoomQueue(roomId: number): Promise<QueuedMessage[]> {
  const all = await readQueueStore();
  return all
    .filter((item: QueuedMessage) => item.room_id === roomId)
    .sort((a: QueuedMessage, b: QueuedMessage) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export async function putQueueItem(item: QueuedMessage): Promise<void> {
  const all = await readQueueStore();
  const existingIndex = all.findIndex((q) => q.queue_id === item.queue_id);
  if (existingIndex >= 0) all[existingIndex] = item;
  else all.push(item);
  await writeQueueStore(all);
}

export async function deleteQueueItem(queueId: string): Promise<void> {
  const all = await readQueueStore();
  const filtered = all.filter((q) => q.queue_id !== queueId);
  await writeQueueStore(filtered);
}
