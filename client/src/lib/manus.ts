export const MANUS_ALLOWED_DOMAINS = [
  "manus.space",
  "manus.computer",
  "manus.im",
];

export function getSafeManusUrl(manusUrl?: string | null) {
  if (!manusUrl) return null;

  try {
    const url = new URL(manusUrl);
    const host = url.hostname.toLowerCase();
    const isDomainValid = MANUS_ALLOWED_DOMAINS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`)
    );

    return url.protocol === "https:" && isDomainValid ? url.toString() : null;
  } catch {
    return null;
  }
}

export function getManusStatusLabel(status?: string) {
  return status === "online" ? "Conectado" : "Pendente";
}

export function getManusStatusColor(status?: string) {
  return status === "online" ? "text-emerald-600" : "text-amber-600";
}
