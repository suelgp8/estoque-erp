import "vue-router";
import type { Role } from "./api";

declare module "vue-router" {
  interface RouteMeta {
    title?: string;
    requiresAuth?: boolean;
    guestOnly?: boolean;
    roles?: Role[];
  }
}

export {};
