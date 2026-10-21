/** Shared between server and browser. */
export type TutorialStatus = "not_started" | "in_progress" | "skipped" | "completed";
export const TUTORIAL_STATUSES: TutorialStatus[] = ["not_started", "in_progress", "skipped", "completed"];

export interface TutorialState {
  /** False until migration 0008 is applied: progress then lives in this browser only. */
  stored: boolean;
  status: TutorialStatus;
  step: number;
  checklistDismissed: boolean;
  /** Finished the tour in another laboratory: don't invite again automatically. */
  completedElsewhere: boolean;
}

export const EMPTY_TUTORIAL: TutorialState = {
  stored: false,
  status: "not_started",
  step: 0,
  checklistDismissed: false,
  completedElsewhere: false,
};
