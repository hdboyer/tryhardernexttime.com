const STATE_REQUIRED_KEYS = new Set(["enabled"]);

export function validateState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys.every((key) => STATE_REQUIRED_KEYS.has(key)) && typeof value.enabled === "boolean";
}

export function decodeGitHubContent(payload) {
  if (!payload || typeof payload.content !== "string" || payload.encoding !== "base64") {
    throw new TypeError("Unexpected GitHub content response");
  }

  const compact = payload.content.replace(/\s/g, "");
  const binary = atob(compact);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const value = JSON.parse(new TextDecoder().decode(bytes));

  if (!validateState(value)) throw new TypeError("Invalid site state");
  return value;
}
