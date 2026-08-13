import type { AppViewId } from './app-views';

export declare const APP_VIEW_IDS: ReadonlyArray<AppViewId>;

export declare function resolveRequestedAppView(rawView: string | null | undefined): AppViewId | null;

export declare function resolveProjectOpenAppView(rawView: string | null | undefined): AppViewId;
