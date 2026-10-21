/**
 * The guided tour. Every step describes a feature that exists in DENTRACK.
 * `target` is a CSS selector for a [data-tour] marker; when it isn't on screen (no data, no
 * permission, small screen) the step is shown as a centered card instead, so the tour never gets stuck.
 * All text is an English key translated through the i18n dictionary.
 */
export interface TourStep {
  id: string;
  /** Page the step belongs to. The tour navigates there once; undefined = stay on the current page. */
  route?: string;
  /** Selectors tried in order. */
  targets?: string[];
  title: string;
  intro: string;
  points?: string[];
  /** The highlighted area can be clicked/typed into (never contains a save/submit button). */
  interactive?: boolean;
  adminOnly?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "dashboard",
    route: "/dashboard",
    targets: ['[data-tour="dashboard-stats"]'],
    title: "Your dashboard",
    intro: "This is your laboratory at a glance. It updates every time you open it.",
    points: [
      "These numbers show your trays (free and occupied), active cases, cases due soon or overdue, and work finished this month.",
      "Further down: a map of every tray, upcoming deadlines, each technician's workload and recent activity.",
      "Use the menu to move between Tray board, Cases, Clinics & patients, Technicians, Analytics and Finance.",
    ],
  },
  {
    id: "trays",
    route: "/trays",
    targets: ['[data-tour="tray-tile"]', '[data-tour="tray-board"]'],
    title: "Numbered trays",
    intro: "Each digital tray matches a physical tray on your bench with the same engraved number.",
    points: [
      "Available (green light) means the tray is empty and ready. Occupied means a case is in it; red or amber lights warn about deadlines.",
      "To put work in a tray, select a free tray and choose Place a case, or pick the tray when you create the case.",
      "When the work is finished and taken out, select the tray, confirm it's physically empty and choose Release tray. It becomes available again.",
    ],
  },
  {
    id: "cases",
    route: "/cases/new",
    targets: ['[data-tour="case-form"]'],
    interactive: true,
    title: "Creating a case",
    intro: "This is the form for registering incoming work. Try the fields: the tour doesn't save anything.",
    points: [
      "Choose the clinic, then enter the patient reference. A name is optional.",
      "Pick the prosthetic category and service, plus units, shade and tooth numbers.",
      "Set the due date and, if you like, choose a free tray right away.",
      "Nothing is saved until you press Create case at the bottom of the form.",
    ],
  },
  {
    id: "workflow",
    route: "/cases",
    targets: ['[data-tour="case-list"]'],
    title: "Patients, team and workflow",
    intro: "Every case shows its patient, clinic, technician, tray, production stage and due date.",
    points: [
      "Open a case to move it through production: Received, In production, Quality check, Completed and Delivered. Every change is time-stamped.",
      "Overdue cases are marked red and cases due soon amber, here and on the dashboard.",
      "Clinics & patients keeps your clinics, dentists and patient records. Technicians shows who is working on what.",
    ],
  },
  {
    id: "finance",
    route: "/finance",
    targets: ['[data-tour="finance-summary"]'],
    adminOnly: true,
    title: "Money: billed, received and earned",
    intro: "Finance is for administrators. Technicians never see prices or payments.",
    points: [
      "Invoices are what you bill clinics. Payments are the money that actually arrives, so a clinic can still owe you after you invoice.",
      "Revenue is counted when a case is delivered, at its agreed price.",
      "Direct costs are the materials, technician time and outside services recorded on each case.",
      "Expenses are running costs such as rent, electricity and software.",
      "Gross profit is revenue minus direct costs. Subtract expenses to get operating profit.",
      "Cash flow is different again: money in and out of your account, which depends on when clinics pay. Analytics shows all of this for any period.",
    ],
  },
  {
    id: "finish",
    title: "You're ready to use DENTRACK!",
    intro: "That's the tour. You can restart it any time from Help, the ? button at the top of every page.",
  },
];

export const stepsFor = (isAdmin: boolean) => TOUR_STEPS.filter((s) => isAdmin || !s.adminOnly);
