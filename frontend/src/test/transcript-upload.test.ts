import { describe, expect, it } from "vitest";
import {
  guessInterviewee,
  parseTranscript,
  speakersOf,
  withUploadedInterview,
  withUploadedTranscript,
} from "@/lib/transcript-upload";
import type { DiligenceProject, Interview } from "@/lib/types";

describe("parseTranscript", () => {
  it("reads 'Name: words' lines, with a title line before them and wrapped lines", () => {
    const turns = parseTranscript(
      "Call with Dr. Ben Lee, 3 Nov\n\nInterviewer: How have prices moved?\nBen Lee: Up twice this year,\nmostly on vaccines.\n\nInterviewer: Did clients leave?",
    );
    expect(turns).toEqual([
      { speaker: "Interviewer", text: "How have prices moved?", time: "" },
      { speaker: "Ben Lee", text: "Up twice this year, mostly on vaccines.", time: "" },
      { speaker: "Interviewer", text: "Did clients leave?", time: "" },
    ]);
  });

  it("reads .vtt cues with <v> tags and their start times", () => {
    const vtt =
      "WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\n<v Alice>Hello there.</v>\n\n2\n00:01:05.500 --> 00:01:09.000\n<v Bob>Prices rose.</v>\n";
    expect(parseTranscript(vtt)).toEqual([
      { speaker: "Alice", text: "Hello there.", time: "00:01" },
      { speaker: "Bob", text: "Prices rose.", time: "01:05" },
    ]);
  });

  it("reads Otter-style 'Name  0:03' headings with the words below", () => {
    const turns = parseTranscript(
      "Speaker 1  0:03\nHow often do you visit?\n\nSpeaker 2  1:02:10\nEvery month.",
    );
    expect(turns).toEqual([
      { speaker: "Speaker 1", text: "How often do you visit?", time: "00:03" },
      { speaker: "Speaker 2", text: "Every month.", time: "62:10" },
    ]);
  });

  it("keeps a file with no labels as one turn per paragraph, and URLs are not labels", () => {
    const turns = parseTranscript(
      "We buy online now.\nSee https://example.com for prices.\n\nThe clinic is too far.",
    );
    expect(turns.map((t) => [t.speaker, t.text])).toEqual([
      ["", "We buy online now. See https://example.com for prices."],
      ["", "The clinic is too far."],
    ]);
  });
});

describe("guessInterviewee and withUploadedTranscript", () => {
  const turns = parseTranscript(
    "Olivia: Can prices rise?\nBen Lee: Clients would leave if prices rose much.",
  );

  it("picks the label naming the contact, else whoever said the most", () => {
    expect(guessInterviewee(turns, "Dr. Ben Lee")).toBe("Ben Lee");
    expect(guessInterviewee(turns, "Someone Else")).toBe("Ben Lee");
    expect(speakersOf(turns)).toEqual(["Olivia", "Ben Lee"]);
  });

  it("completes the interview with the turns and drops the call link", () => {
    const iv: Interview = {
      id: "iv-1",
      expertId: "e-1",
      status: "Not Started",
      topic: "",
      questions: [],
      transcript: [],
      sessionId: "s-1",
    };
    const out = withUploadedTranscript(iv, turns, "Ben Lee");
    expect(out).toEqual({
      id: "iv-1",
      expertId: "e-1",
      status: "Completed",
      topic: "Uploaded transcript",
      questions: [],
      transcript: [
        { id: "up-1", speaker: "ai", text: "Can prices rise?", time: "" },
        {
          id: "up-2",
          speaker: "expert",
          text: "Clients would leave if prices rose much.",
          time: "",
        },
      ],
    });
  });
});

describe("withUploadedInterview", () => {
  const turns = parseTranscript("Me: Why switch?\nAna: The new clinic is closer.");
  const project = (): DiligenceProject =>
    ({
      id: "p-1",
      company: "Vet",
      thesis: "",
      status: "In Progress",
      networks: [],
      updatedAt: "",
      experts: [
        { id: "e-1", name: "Ana", title: "Owner", phone: "", description: "", source: "Custom" },
      ],
      interviews: [
        {
          id: "iv-1",
          expertId: "e-1",
          status: "Not Started",
          topic: "",
          questions: [],
          transcript: [],
        },
      ],
    }) as unknown as DiligenceProject;

  it("fills a contact's unfinished card instead of adding a second one", () => {
    const p = withUploadedInterview(project(), "e-1", turns, "Ana");
    expect(p.interviews).toHaveLength(1);
    expect(p.interviews[0]).toMatchObject({ id: "iv-1", status: "Completed" });
  });

  it("adds a new contact and a new completed card", () => {
    const p = withUploadedInterview(project(), { name: " Ben ", title: "Vet" }, turns, "Ana");
    expect(p.experts.at(-1)).toMatchObject({ name: "Ben", title: "Vet", source: "Custom" });
    expect(p.interviews).toHaveLength(2);
    expect(p.interviews[1]).toMatchObject({ expertId: p.experts.at(-1)!.id, status: "Completed" });
  });
});
