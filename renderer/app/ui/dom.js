export const el = (id) => document.getElementById(id);

// Convenience: querySelector shorthand (used in some modules)
export const q = (sel, root = document) => root.querySelector(sel);
