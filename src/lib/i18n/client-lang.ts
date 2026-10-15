import type { Lang } from "./config";

// The browser serves a single user, so a module-level value is safe here (never used on the server).
let current: Lang = "en";
export const setClientLang = (l: Lang) => { current = l; };
export const getClientLang = () => current;
