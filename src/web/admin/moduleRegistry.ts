import type { Router } from "express";

export interface AdminModule {
  key: string;
  label: string;
  navPath: string;
  router: Router;
}

export const adminModules: AdminModule[] = [];

export function registerAdminModule(mod: AdminModule): void {
  adminModules.push(mod);
}
