import { formatDuration } from "./call-mirror";
import { uid } from "./mock-service";
import {
  UPLOADED_TOPIC,
  type DiligenceProject,
  type Expert,
  type Interview,
  type TranscriptTurn,
} from "./types";

/**
 * A transcript file the consultant uploads instead of running the AI call. The
 * interview becomes Completed with these turns, so thesis validation and the
 * evidence scorecard use it exactly like a call's transcript.
 *
 * Reads plain text ("Name: words"), Otter-style exports ("Name  0:03" then the
 * words), Zoom/Teams .vtt (incl. <v Name> tags) and .srt.
 */

export interface ParsedTurn {
  /** The label in the file ("" when the file has none). */
  speaker: string;
  text: string;
  time: string;
}

const TIME = String.raw`(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d+)?`;
const cueTime = new RegExp(String.raw`^(${TIME})\s*-->`);
const leadingTime = new RegExp(String.raw`^\[?(${TIME})\]?\s+`);
const labelThenTime = new RegExp(String.raw`^([A-Za-z][^:]{0,39}?)\s+\(?(${TIME})\)?$`);
// "Name: words": up to four words before the colon, starting with a letter; not a URL.
const labelled = /^([A-Za-z][\w.'’-]*(?: [\w.'’-]+){0,3})\s*:(?!\/\/)\s*(.*)$/;
const voiceTag = /^<v\s+([^>]+)>(.*?)(?:<\/v>)?$/;

/** "1:02:03" or "02:03.500" -> "62:03" (the app's mm:ss). */
function clock(t: string): string {
  const parts = t.split(/[.,]/)[0]!.split(":").map(Number);
  const s = parts.reduce((acc, n) => acc * 60 + n, 0);
  return formatDuration(s * 1000);
}

export function parseTranscript(raw: string): ParsedTurn[] {
  const turns: ParsedTurn[] = [];
  let time = "";
  let blank = true;
  const start = (speaker: string, text: string) => {
    turns.push({ speaker: speaker.trim(), text: text.trim(), time });
    time = "";
  };
  for (const original of raw.replace(/\r\n?/g, "\n").split("\n")) {
    let line = original.trim();
    if (!line) {
      blank = true;
      continue;
    }
    if (/^WEBVTT/.test(line) || /^\d+$/.test(line)) continue; // vtt header, srt cue number
    const cue = line.match(cueTime);
    if (cue) {
      time = clock(cue[1]!);
      continue;
    }
    const lead = line.match(leadingTime);
    if (lead) {
      time = clock(lead[1]!);
      line = line.slice(lead[0].length);
    }
    const m = line.match(voiceTag) ?? line.match(labelled);
    const head = !m && line.match(labelThenTime);
    if (m) start(m[1]!, m[2]!);
    else if (head) {
      time = clock(head[2]!);
      start(head[1]!, "");
    } else {
      const cur = turns.at(-1);
      // A continuation line, or the words under an Otter-style "Name 0:03" heading.
      if (cur && (!blank || !cur.text)) cur.text = `${cur.text} ${line}`.trim();
      else start(cur?.speaker ?? "", line); // a new paragraph: same speaker, its own turn
    }
    blank = false;
  }
  const out = turns.filter((t) => t.text);
  // With speaker labels, text before the first one is a title or preamble, not speech.
  const first = out.findIndex((t) => t.speaker);
  return first > 0 ? out.slice(first) : out;
}

/** The labels in the file, in order of first appearance. */
export const speakersOf = (turns: ParsedTurn[]) => [
  ...new Set(turns.map((t) => t.speaker).filter(Boolean)),
];

/** Which label is the interviewee: one naming them, else a generic one, else whoever said the most. */
export function guessInterviewee(turns: ParsedTurn[], name: string): string {
  const speakers = speakersOf(turns);
  const tokens = name
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const named = speakers.find((s) => tokens.some((w) => s.toLowerCase().includes(w)));
  if (named) return named;
  const generic = speakers.find((s) =>
    /interviewee|expert|respondent|customer|guest|participant/i.test(s),
  );
  if (generic) return generic;
  const words = (s: string) =>
    turns.filter((t) => t.speaker === s).reduce((n, t) => n + t.text.split(/\s+/).length, 0);
  return speakers.reduce((best, s) => (words(s) > words(best) ? s : best), speakers[0] ?? "");
}

/** The interview, completed with the uploaded turns. Unlabelled turns count as the interviewee's. */
export function withUploadedTranscript(
  iv: Interview,
  turns: ParsedTurn[],
  interviewee: string,
): Interview {
  const transcript = turns.map((t, i): TranscriptTurn => ({
    id: `up-${i + 1}`,
    speaker: !t.speaker || t.speaker === interviewee ? "expert" : "ai",
    text: t.text,
    time: t.time,
  }));
  // The link sent for the AI call is dropped: a call on it must not replace this transcript.
  const { sessionId: _drop, live: _live, ...rest } = iv;
  return { ...rest, status: "Completed", topic: UPLOADED_TOPIC, transcript };
}

/** The file's turns; throws with a message to show when it is not a usable transcript. */
export async function readTranscriptFile(file: File): Promise<ParsedTurn[]> {
  if (!/\.(txt|md|vtt|srt)$/i.test(file.name) && !file.type.startsWith("text/"))
    throw new Error(
      "Upload a text file (.txt, .vtt, .srt or .md). Save a Word or PDF transcript as .txt first.",
    );
  if (file.size > 2_000_000)
    throw new Error("That file is over 2 MB; a transcript is usually far smaller.");
  const turns = parseTranscript(await file.text());
  if (!turns.length) throw new Error("No text found in that file.");
  return turns;
}

/**
 * The project with an uploaded interview in the current round. `person` is a
 * contact's id, or a new contact to add. A contact's unfinished card is filled
 * in; otherwise a new card is added.
 */
export function withUploadedInterview(
  p: DiligenceProject,
  person: string | { name: string; title: string },
  turns: ParsedTurn[],
  interviewee: string,
): DiligenceProject {
  const added: Expert | null =
    typeof person === "string"
      ? null
      : {
          id: uid("e"),
          name: person.name.trim(),
          title: person.title.trim(),
          phone: "",
          description: "Added with an uploaded transcript.",
          source: "Custom",
        };
  const expertId = added?.id ?? (person as string);
  const open = p.interviews.find(
    (iv) => iv.expertId === expertId && iv.status !== "Completed" && !iv.live,
  );
  const blank: Interview = {
    id: uid("iv"),
    expertId,
    status: "Not Started",
    topic: "",
    questions: [],
    transcript: [],
  };
  const done = withUploadedTranscript(open ?? blank, turns, interviewee);
  return {
    ...p,
    experts: added ? [...p.experts, added] : p.experts,
    interviews: open
      ? p.interviews.map((iv) => (iv === open ? done : iv))
      : [...p.interviews, done],
  };
}
