/**
 * Where a contact is found when it is not by email or phone: LinkedIn and
 * Instagram.
 *
 * A student founder's first message to a stranger is more often a LinkedIn
 * note or an Instagram DM than an email, so these are fields of their own
 * rather than a line in the notes. What is typed is whatever was to hand - a
 * whole address copied from the browser with its tracking on the end, a
 * handle with an @, a bare name - and one address in full is what is kept, so
 * the contact page, the import and main all read the same thing.
 *
 * Pure: main builds the address it opens from the contact's own row with
 * `profileLink` and `messageLink`, the way it builds a WhatsApp link, and the
 * window never hands it one.
 */

export const PROFILE_KINDS = ["linkedin", "instagram"] as const;
export type ProfileKind = (typeof PROFILE_KINDS)[number];

export const PROFILE_LABEL: Record<ProfileKind, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
};

/** What LinkedIn calls its kinds of page. A bare name is a person. */
const LINKEDIN_KINDS = ["in", "company", "school", "pub"] as const;

/** A LinkedIn name: letters of any script, digits, and the marks it allows. Percent for a name copied encoded. */
const LINKEDIN_NAME = /^[\p{L}\p{N}_%.-]{2,100}$/u;

/** An Instagram handle: up to thirty of letters, digits, full stops and underscores. */
const INSTAGRAM_HANDLE = /^[A-Za-z0-9._]{1,30}$/;

/** The path of an address on one of a site's own hosts, or null when it is somewhere else. */
function pathOn(written: string, site: string): string | null {
  const found = /^(?:https?:\/\/)?([a-z0-9.-]+)(\/[^?#]*)?/i.exec(written);
  if (!found) return null;
  const host = (found[1] ?? "").toLowerCase();
  if (host !== site && !host.endsWith(`.${site}`)) return null;
  return found[2] ?? "/";
}

function linkedIn(written: string): string | null {
  // An address, with or without its scheme; else what follows the site's name.
  const path = /linkedin\.com/i.test(written) ? pathOn(written, "linkedin.com") : `/${written.replace(/^\/+/, "")}`;
  if (path === null) return null;

  const parts = path.split("/").filter((part) => part.length > 0);
  const first = (parts[0] ?? "").toLowerCase();
  const kind = (LINKEDIN_KINDS as readonly string[]).includes(first) ? first : null;
  // "in/priya-nair" names its kind; "priya-nair" alone is a person.
  const name = kind === null ? (parts.length === 1 ? parts[0] : undefined) : parts[1];
  if (name === undefined || !LINKEDIN_NAME.test(name)) return null;
  return `https://www.linkedin.com/${kind ?? "in"}/${name}`;
}

function instagramHandle(written: string): string | null {
  let handle: string | undefined;
  if (/instagram\.com|(?:^|\/\/)ig\.me\//i.test(written)) {
    const path = pathOn(written, "instagram.com") ?? pathOn(written, "ig.me");
    if (path === null) return null;
    const parts = path.split("/").filter((part) => part.length > 0);
    // ig.me/m/handle is the address of a conversation with them.
    handle = parts[0] === "m" ? parts[1] : parts[0];
  } else {
    handle = written.replace(/^@/, "");
  }
  if (handle === undefined || !INSTAGRAM_HANDLE.test(handle)) return null;
  // Posts, reels and the like are not somebody's page.
  if (["p", "reel", "reels", "explore", "stories", "accounts"].includes(handle.toLowerCase())) return null;
  return handle;
}

/**
 * What is kept for a profile: its address in full, or null for nothing
 * typed. Throws the sentence the person reads when what was typed is not a
 * profile on that site.
 */
export function cleanProfile(kind: ProfileKind, raw: string | null | undefined): string | null {
  const written = (raw ?? "").trim();
  if (written.length === 0) return null;

  if (kind === "linkedin") {
    const address = linkedIn(written);
    if (address === null) {
      throw new Error("That does not look like a LinkedIn profile. Paste its address, such as linkedin.com/in/priya-nair.");
    }
    return address;
  }

  const handle = instagramHandle(written);
  if (handle === null) {
    throw new Error("That does not look like an Instagram handle. Write it like @priya.nair, or paste the profile's address.");
  }
  return `https://www.instagram.com/${handle}`;
}

/** The address to open for a stored profile, or null when there is none or it is not one. Never throws. */
export function profileLink(kind: ProfileKind, stored: string | null): string | null {
  try {
    return cleanProfile(kind, stored);
  } catch {
    return null;
  }
}

/**
 * Where a message to them is written. Instagram has an address for a
 * conversation; LinkedIn has none that takes a name, so its profile is the
 * nearest place, with Message on it.
 */
export function messageLink(kind: ProfileKind, stored: string | null): string | null {
  const address = profileLink(kind, stored);
  if (address === null) return null;
  if (kind === "instagram") return `https://ig.me/m/${address.slice(address.lastIndexOf("/") + 1)}`;
  return address;
}

/** A profile as it is shown on a contact: "in/priya-nair", "@priya.nair". */
export function profileShown(kind: ProfileKind, stored: string | null): string | null {
  const address = profileLink(kind, stored);
  if (address === null) return null;
  if (kind === "instagram") return `@${address.slice(address.lastIndexOf("/") + 1)}`;
  const path = address.replace("https://www.linkedin.com/", "");
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}
