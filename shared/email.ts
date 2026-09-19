import { z } from "zod";

/**
 * Email templates: the messages worth writing once. Caulder never sends
 * anything; a template is filled in and handed to the machine's own mail app.
 */

export const TEMPLATE_VARIABLES = [
  { token: "{{lead.name}}", describes: "The lead's name" },
  { token: "{{lead.greeting}}", describes: "The contact person, or \"there\"" },
  { token: "{{lead.contact}}", describes: "The contact person, blank if unknown" },
  { token: "{{lead.city}}", describes: "The lead's city" },
  { token: "{{company.name}}", describes: "Your company's name" },
] as const;

export const templateInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the template a name.")
    .max(80, "Keep the name under 80 characters."),
  subject: z
    .string()
    .trim()
    .max(200, "Keep the subject under 200 characters.")
    .default(""),
  body: z.string().trim().min(1, "Write something to send.").max(20000),
  /**
   * Which way this goes out.
   *
   * A WhatsApp message is plain text with no subject line, which is why the
   * subject stopped being required above — a template that cannot exist
   * without one cannot be a WhatsApp template. The form still insists on a
   * subject for an email, where an empty one is a mistake rather than a shape.
   */
  channel: z.enum(["email", "whatsapp"]).default("email"),
});

export type TemplateInput = z.infer<typeof templateInput>;

export type EmailTemplate = {
  id: string;
  companyId: string;
  name: string;
  subject: string;
  body: string;
  channel: string;
  createdAt: string;
  updatedAt: string;
};
