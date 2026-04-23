export interface BuildInfo {
  id: string;
  label: string;
}

const FALLBACK_BUILD_ID = 'dev-local';

export function getBuildInfo(): BuildInfo {
  const id = String(process.env.NEXT_PUBLIC_BUILD_ID || FALLBACK_BUILD_ID).trim() || FALLBACK_BUILD_ID;
  return {
    id,
    label: `build ${id}`,
  };
}