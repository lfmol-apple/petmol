/**
 * Version information for PETMOL Web.
 */

export const VERSION = "2.0.0";
export const BUILT_AT: string | null = new Date().toISOString();
export const GIT_SHA: string | null = null;

export function getVersionInfo() {
  return {
    service: 'petmol-web',
    version: VERSION,
    built_at: BUILT_AT,
    git_sha: GIT_SHA,
  };
}
