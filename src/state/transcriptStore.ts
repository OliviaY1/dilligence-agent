import { SERVER, type ServerEvent } from "../realtime/events";

// The transcript as a pure reducer over the event stream. Items are keyed by
// item_id because one turn is built from several events, user transcripts
// arrive late, and interrupted turns are amended in place.

export type TurnStatus = "pending" | "streaming" | "complete" | "interrupted";

export interface UserItem {
  kind: "user";
  itemId: string;
  /** null until the transcription arrives. */
  text: string | null;
  status: TurnStatus;
  at: number;
}

export interface AssistantItem {
  kind: "assistant";
  itemId: string;
  text: string;
  status: TurnStatus;
  at: number;
}

export interface SystemItem {
  kind: "system";
  itemId: string;
  text: string;
  at: number;
}

export type TranscriptItem = UserItem | AssistantItem | SystemItem;

export interface TranscriptState {
  order: string[];
  items: Record<string, TranscriptItem>;
}

export const emptyTranscript: TranscriptState = { order: [], items: {} };

export function toList(state: TranscriptState): TranscriptItem[] {
  return state.order.flatMap((id) => state.items[id] ?? []);
}

/** Add an item once, after `prevId` when known so late items land in place. */
function addItem(state: TranscriptState, item: TranscriptItem, prevId?: string): TranscriptState {
  if (state.items[item.itemId]) return state;
  const idx = prevId && state.items[prevId] ? state.order.indexOf(prevId) + 1 : state.order.length;
  const order = [...state.order.slice(0, idx), item.itemId, ...state.order.slice(idx)];
  return { order, items: { ...state.items, [item.itemId]: item } };
}

function updateItem(
  state: TranscriptState,
  itemId: string,
  fn: (item: TranscriptItem) => TranscriptItem,
): TranscriptState {
  const cur = state.items[itemId];
  if (!cur) return state;
  const next = fn(cur);
  return next === cur ? state : { order: state.order, items: { ...state.items, [itemId]: next } };
}

function markStreamingInterrupted(state: TranscriptState): TranscriptState {
  let changed = false;
  const items = { ...state.items };
  for (const id of state.order) {
    const it = items[id];
    if (it?.kind === "assistant" && it.status === "streaming") {
      items[id] = { ...it, status: "interrupted" };
      changed = true;
    }
  }
  return changed ? { order: state.order, items } : state;
}

function addSystem(state: TranscriptState, text: string, now: number): TranscriptState {
  return addItem(state, { kind: "system", itemId: `system-${now}-${state.order.length}`, text, at: now });
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

const pendingUser = (itemId: string, now: number): UserItem => ({
  kind: "user",
  itemId,
  text: null,
  status: "pending",
  at: now,
});

const streamingAssistant = (itemId: string, now: number): AssistantItem => ({
  kind: "assistant",
  itemId,
  text: "",
  status: "streaming",
  at: now,
});

export function transcriptReducer(state: TranscriptState, evt: ServerEvent, now: number): TranscriptState {
  const prevId = str(evt["previous_item_id"]);
  const itemId = str(evt["item_id"]);

  switch (evt.type) {
    case SERVER.speechStarted:
      // The user cut in; their bubble appears now and is filled by transcription later.
      return itemId ? addItem(markStreamingInterrupted(state), pendingUser(itemId, now), prevId) : state;

    case SERVER.transcriptionCompleted: {
      if (!itemId) return state;
      const text = str(evt["transcript"]) ?? "";
      return updateItem(addItem(state, pendingUser(itemId, now), prevId), itemId, (it) =>
        it.kind === "user" ? { ...it, text, status: "complete" } : it,
      );
    }

    case SERVER.transcriptionFailed:
      if (!itemId) return state;
      return updateItem(state, itemId, (it) =>
        it.kind === "user" ? { ...it, text: "[transcription failed]", status: "complete" } : it,
      );

    case SERVER.outputItemAdded: {
      const item = evt["item"] as { id?: string; type?: string; role?: string } | undefined;
      if (!item?.id || item.type !== "message" || item.role !== "assistant") return state;
      return addItem(state, streamingAssistant(item.id, now), prevId);
    }

    case SERVER.audioTranscriptDelta: {
      if (!itemId) return state;
      const delta = str(evt["delta"]) ?? "";
      return updateItem(addItem(state, streamingAssistant(itemId, now), prevId), itemId, (it) =>
        it.kind === "assistant"
          ? { ...it, text: it.text + delta, status: it.status === "interrupted" ? "interrupted" : "streaming" }
          : it,
      );
    }

    case SERVER.audioTranscriptDone: {
      if (!itemId) return state;
      const full = str(evt["transcript"]);
      return updateItem(state, itemId, (it) =>
        it.kind === "assistant"
          ? { ...it, text: full ?? it.text, status: it.status === "interrupted" ? "interrupted" : "complete" }
          : it,
      );
    }

    case SERVER.idleTimeout:
      return addSystem(state, "session timed out after five minutes of silence", now);
    case SERVER.maxDuration:
      return addSystem(state, "session reached its maximum duration", now);
    default:
      return state;
  }
}

export function replay(events: ServerEvent[], startAt = 0, state = emptyTranscript): TranscriptState {
  return events.reduce((s, evt, i) => transcriptReducer(s, evt, startAt + i), state);
}

/** Plain text, as sent to Claude for question updates. */
export function toPlainText(state: TranscriptState): string {
  return toList(state)
    .map((it) => {
      const t = new Date(it.at).toLocaleTimeString(undefined, { hour12: false });
      if (it.kind === "user") return `[${t}] You: ${it.text ?? "(transcribing…)"}`;
      if (it.kind === "assistant")
        return `[${t}] Assistant: ${it.text}${it.status === "interrupted" ? " — interrupted" : ""}`;
      return `[${t}] — ${it.text} —`;
    })
    .join("\n");
}
