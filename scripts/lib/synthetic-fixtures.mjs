import {createHash} from "node:crypto";

export function syntheticIdentity(seed) {
  if (typeof seed !== "string" || seed.length === 0) throw new TypeError("seed is required");
  const token = createHash("sha256").update(seed).digest("hex").slice(0, 6);
  return Object.freeze({
    token,
    organization: `Synthetic Tenant ${token.toUpperCase()}`,
    contact: `Synthetic Contact ${token.toUpperCase()}`,
    display_name: `Synthetic Attendee ${token.toUpperCase()}`,
    email: `attendee-${token}@example.invalid`,
    phone: "+1-202-555-0142"
  });
}
