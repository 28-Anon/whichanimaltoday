function hasStringValue(raw: unknown): raw is { value: string } {
  return (
    typeof raw === "object" &&
    raw !== null &&
    "value" in raw &&
    typeof (raw as { value: unknown }).value === "string"
  );
}

export function readTextField(
  fieldData: Record<string, unknown>,
  fieldName: string
): string {
  const raw = fieldData[fieldName];
  if (typeof raw === "string") return raw;
  if (hasStringValue(raw)) return raw.value;
  throw new Error(
    `Field "${fieldName}" is not a recognized text field shape: ${JSON.stringify(raw)}`
  );
}

function hasUrlProperty(raw: unknown): raw is { url: string } {
  return (
    typeof raw === "object" &&
    raw !== null &&
    "url" in raw &&
    typeof (raw as { url: unknown }).url === "string"
  );
}

function hasWrappedUrlValue(raw: unknown): raw is { value: { url: string } } {
  return (
    typeof raw === "object" &&
    raw !== null &&
    "value" in raw &&
    hasUrlProperty((raw as { value: unknown }).value)
  );
}

export function readImageField(
  fieldData: Record<string, unknown>,
  fieldName: string
): string {
  const raw = fieldData[fieldName];
  if (typeof raw === "string") return raw;
  if (hasUrlProperty(raw)) return raw.url;
  if (hasWrappedUrlValue(raw)) return raw.value.url;
  throw new Error(
    `Field "${fieldName}" is not a recognized image field shape: ${JSON.stringify(raw)}`
  );
}
