import type { Router } from "express";

export interface AdminModule {
  key: string;
  label: string;
  navPath: string;
  router: Router;
  // Inner SVG markup (paths/shapes only, no wrapping <svg> tag) rendered at
  // 18x18 in the admin sidebar — see the `icon()` helper in
  // src/web/views/admin/layout.ts.
  icon: string;
}

export const adminModules: AdminModule[] = [];

export function registerAdminModule(mod: AdminModule): void {
  adminModules.push(mod);
}
