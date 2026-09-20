/**
 * A thought about something to make, caught whole.
 *
 * "Edit on helicopter by asap rocky, grunge dark edit - here is the link of
 * that for reference https://..." is three things said in one breath: what it
 * is, what it should be like, and where the reference is. Kept as one line it
 * is a title nobody can scan; kept as an idea with its title, its detail and
 * its link apart, it is a page that can be opened in a month and acted on.
 *
 * The tell is the word after the first. "Edit the video" is something to do;
 * "edit **on** helicopter" is a thing - an edit - and what follows is what it
 * is of. So this only ever reads a line that opens with the name of something
 * people make, followed by a word that says what it is about.
 */

export type Thought = {
  /** "Edit on helicopter by asap rocky". */
  title: string;
  /** Whatever else was said about it: "grunge dark edit". */
  detail: string;
  /** Every link in the line, as it was pasted. */
  links: string[];
};

const LINK = /\bhttps?:\/\/[^\s<>()[\]]+|\bwww\.[^\s<>()[\]]+/gi;

/** "Here is the link of that for reference", "(the link attached)", "ref:" - talk about the link, which is not the thought. */
const LINK_TALK =
  /[\s,;:–-]*\(?\s*(?:here(?:'s|\s+is)\s+)?(?:the\s+|a\s+|my\s+)?(?:link|url|reference|ref)\b(?:\s+(?:of|to|for)\s+(?:that|it|this))?(?:\s+(?:for|as)\s+(?:a\s+)?reference)?(?:\s+(?:is\s+)?attached)?\s*\)?\s*[:–-]?\s*/gi;

/** The things people make, said as things: followed by what they are of, about or for. */
const MAKING =
  /^\s*(?:an?\s+|new\s+)?(?:edit|video|reel|short|vlog|post|thread|blog|article|essay|newsletter|song|beat|track|remix|mix|cover|design|logo|poster|thumbnail|animation|sketch|drawing|painting|photo|shoot|script|story|poem|app|tool|feature|project|concept|startup|business|product|game|podcast|series|talk|workshop)\s+(?:idea\s+)?(?:on|of|about|for|with|using|inspired\s+by|like|idea|concept)\b/i;

/** The thought in a line, or null when the line is not one. */
export function readThought(line: string): Thought | null {
  if (!MAKING.test(line)) return null;

  const links = [...line.matchAll(LINK)].map((match) => match[0].replace(/[.,;:!?'"]+$/, ""));
  const said = line.replace(LINK, " ").replace(LINK_TALK, " ").replace(/\s+/g, " ").trim();

  // What it is, then what it should be like: the first comma or dash is where one ends.
  const cut = /\s*(?:,|;|\s[-–—]\s|[-–—]\s|\s[-–—]|:\s)\s*/.exec(said);
  const title = (cut ? said.slice(0, cut.index) : said).trim();
  const detail = cut ? said.slice(cut.index + cut[0].length).replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, "").trim() : "";
  if (!title) return null;

  return { title: title.charAt(0).toUpperCase() + title.slice(1), detail, links };
}

/** The page it becomes: what it should be like, then where the reference is. */
export function thoughtBody(thought: Thought, said: string): string {
  const parts = [thought.detail ? thought.detail.charAt(0).toUpperCase() + thought.detail.slice(1) : ""];
  if (thought.links.length > 0) parts.push(thought.links.map((link) => `Reference: ${link}`).join("\n"));
  // As it was said, under a rule: what was tidied above is a reading, and the words are theirs.
  parts.push(`---\n\n_${said}_`);
  return parts.filter(Boolean).join("\n\n");
}
