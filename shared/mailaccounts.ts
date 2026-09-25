import { z } from "zod";

/**
 * Mail accounts that are not the Google script: Zoho, Outlook, Yahoo, a
 * domain of your own - anything that speaks SMTP.
 *
 * The password (an app password, for every provider that offers one) is
 * encrypted by the operating system before it is stored, like the Google
 * connection, and is never handed back to the window. What the window sees
 * is the shape below, which has no secret in it.
 *
 * What these accounts cannot do, and say so: see a reply. The Google script
 * reads the thread; SMTP only sends. So a message from one of these is sent,
 * or scheduled and sent by Caulder when it is due, and that is the end of
 * what Caulder knows about it - no reply on Today, no automatic follow-up.
 */

export type MailAccount = {
  id: string;
  /** What the picker calls it: "Zoho work", "Uni". */
  label: string;
  /** The address it sends as. */
  address: string;
  host: string;
  port: number;
  /** TLS from the first byte (465), rather than STARTTLS on a plain connection (587). */
  secure: boolean;
  username: string;
  isDefault: boolean;
  createdAt: string;
};

/** Where a message can be sent from: the Google script (id null), or an account. */
export type MailSender = {
  id: string | null;
  label: string;
  address: string;
  /** Only the script reads the thread, so only it sees a reply and can follow up by itself. */
  seesReplies: boolean;
};

export const mailAccountInput = z.object({
  label: z.string().trim().min(1, "Give the account a name.").max(60),
  address: z.string().trim().toLowerCase().email("That is not an email address."),
  host: z.string().trim().min(1, "Which server does it send through?").max(200),
  port: z.number().int().min(1).max(65535, "That is not a port."),
  secure: z.boolean(),
  username: z.string().trim().min(1, "The username is usually the address itself.").max(200),
  password: z.string().min(1, "The password, or an app password, is needed to send.").max(500),
});
export type MailAccountInput = z.input<typeof mailAccountInput>;

/**
 * The servers the common providers send through. Every one of these wants an
 * app password rather than the account's own, made in that provider's
 * security settings; the note says where.
 */
type MailPreset = { id: string; label: string; host: string; port: number; secure: boolean; note: string };

export const MAIL_PRESETS: readonly MailPreset[] = [
  {
    id: "zoho",
    label: "Zoho Mail",
    host: "smtp.zoho.com",
    port: 465,
    secure: true,
    note: "Make an app password in Zoho: My Account, Security, App passwords. If your Zoho is on zoho.in, pick Zoho Mail (India).",
  },
  { id: "zoho-in", label: "Zoho Mail (India)", host: "smtp.zoho.in", port: 465, secure: true, note: "The same, for an account on zoho.in." },
  {
    id: "outlook",
    label: "Outlook or Microsoft 365",
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    note: "Needs SMTP AUTH allowed on the mailbox, which an admin may have to switch on.",
  },
  { id: "yahoo", label: "Yahoo Mail", host: "smtp.mail.yahoo.com", port: 465, secure: true, note: "Make an app password under Account security." },
  { id: "icloud", label: "iCloud Mail", host: "smtp.mail.me.com", port: 587, secure: false, note: "Make an app-specific password at appleid.apple.com." },
  {
    id: "gmail",
    label: "Gmail, without the script",
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    note: "An app password from Google Account, Security. The script is better for Gmail: it sees replies.",
  },
  { id: "other", label: "Another server", host: "", port: 587, secure: false, note: "Your provider's SMTP settings." },
];
