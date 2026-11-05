import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl, readBackendJson } from "./backend";
import type { DiligenceProject, ThesisValidationResult } from "./types";
import {
  completedInterviews,
  validationInputKey,
  validationRequest,
  validationResult,
  type ValidationReply,
} from "./validation-request";

/**
 * Investment thesis validation by Claude (POST /api/thesis-validation on the
 * backend, server/validation.ts): the project's thesis and hypotheses, checked
 * against the transcripts of COMPLETED interviews only. The result is saved on
 * the project and recomputed when its inputs change (a new interview finishes,
 * the thesis is edited).
 */

async function requestValidation(p: DiligenceProject): Promise<ThesisValidationResult> {
  const res = await fetch(apiUrl("/api/thesis-validation"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validationRequest(p)),
  });
  const body = await readBackendJson<ValidationReply & { error?: string }>(res);
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return validationResult(p, body);
}

export function useThesisValidation(
  project: DiligenceProject,
  update: (fn: (p: DiligenceProject) => DiligenceProject) => void,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const key = validationInputKey(project);
  const hasEvidence = completedInterviews(project).length > 0;
  const cached = project.thesisValidation;
  const stale = !cached || cached.inputKey !== key;

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setLoading(true);
    setError("");
    try {
      const result = await requestValidation(project);
      update((p) => ({ ...p, thesisValidation: result }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      setLoading(false);
    }
  }, [project, update]);

  // Run once when there is evidence and no up-to-date result (not again after an error).
  const tried = useRef("");
  useEffect(() => {
    if (!hasEvidence || !stale || tried.current === key) return;
    tried.current = key;
    void run();
  }, [hasEvidence, stale, key, run]);

  return { result: cached, stale, loading, error, run, hasEvidence };
}
