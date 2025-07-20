export const parseVersion = (version: string) =>
  version
    .replace(/\D/g, '.')
    .split('.')
    .filter(Boolean)
    .map(str => Number.parseInt(str));

export const isVersionLargerThanOrEqual = (version: number[], target: number[]) => {
  const maxLength = Math.max(version.length, target.length);

  for (let i = 0; i < maxLength; i++) {
    const v1 = version[i] ?? 0;
    const v2 = target[i] ?? 0;

    if (v1 > v2) return true;
    if (v1 < v2) return false;
  }

  return true;
};
