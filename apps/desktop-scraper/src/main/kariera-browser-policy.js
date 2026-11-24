export const KARIERA_PATRAS_URL = "https://www.kariera.gr/jobs/jobs-in-achaia--patra";

export function isAllowedKarieraUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:" && (hostname === "kariera.gr" || hostname.endsWith(".kariera.gr"));
  } catch {
    return false;
  }
}

export function isAllowedKarieraSnapshotUrl(value) {
  if (!isAllowedKarieraUrl(value)) return false;
  const url = new URL(value);
  return url.hostname.toLowerCase() === "www.kariera.gr" &&
    url.pathname.replace(/\/$/, "") === "/jobs/jobs-in-achaia--patra";
}
