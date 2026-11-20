export function classifyAccess({ status = 0, title = "", body = "" } = {}) {
  if ([401, 403, 429].includes(status)) return { allowed: false, blocked: true, reason: `Access denied with HTTP ${status}` };
  if (status >= 400) return { allowed: false, blocked: false, reason: `Source returned HTTP ${status}` };
  if (/cloudflare|access denied|captcha|security challenge|verify you are human/i.test(`${title} ${body.slice(0, 1000)}`)) {
    return { allowed: false, blocked: true, reason: `Access challenge detected (${title || "untitled response"})` };
  }
  return { allowed: true, blocked: false, reason: "" };
}
