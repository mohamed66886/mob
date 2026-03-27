export const DELETED_MESSAGE = "تم حذف هذه الرساله";

export function normalizeMessages(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
}

export function normalizeMessageRecord(msg: any) {
  if (!msg) return msg;

  const hasReplyObject = !!msg.replied_message;
  const hasReplyFields = msg.reply_content || msg.reply_sender_name || msg.reply_sender_id;

  return {
    ...msg,
    ...(hasReplyObject || !hasReplyFields
      ? {}
      : {
          replied_message: {
            id: msg.reply_to_message_id,
            sender_id: msg.reply_sender_id,
            sender_name: msg.reply_sender_name || "Unknown",
            content: msg.reply_content || "",
          },
        }),
    reactions: Array.isArray(msg.reactions) ? msg.reactions : [],
  };
}

export function normalizeChatMessages(raw: any): any[] {
  return normalizeMessages(raw).map((msg) => normalizeMessageRecord(msg));
}

export function parseChatDate(value?: string | number | Date | null): Date | null {
  if (!value && value !== 0) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const dateFromNumber = new Date(value);
    return Number.isNaN(dateFromNumber.getTime()) ? null : dateFromNumber;
  }

  const normalized = String(value).trim();
  if (!normalized) return null;

  let isoLike = normalized;
  if (!isoLike.includes("T") && isoLike.includes(" ")) {
    isoLike = isoLike.replace(" ", "T");
  }

  const parsed = new Date(isoLike);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const fallback = new Date(normalized);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function formatChatTime(value?: string | number | Date | null): string {
  const date = parseChatDate(value);
  if (!date) return "--:--";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isSafeHttpsUrl(url?: string | null): boolean {
  if (!url) return false;
  return /^https:\/\//i.test(String(url).trim());
}
