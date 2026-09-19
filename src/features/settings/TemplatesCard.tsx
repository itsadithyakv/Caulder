import { useCallback } from "react";
import type { EmailTemplate } from "@shared/email";
import { useWorkspace } from "@/lib/workspace";
import { useResource } from "@/lib/resource";
import { TemplateList } from "./TemplateList";

/**
 * The messages worth writing once, kept with the other things set up once.
 *
 * They used to live on an Email screen beside a queue and a set of sequences.
 * The queue and the sequences went with the bridge; the templates are what a
 * contact page's Write one starts from, and Settings is where a thing you edit
 * twice a year belongs.
 */
export function TemplatesCard() {
  const { activeCompany } = useWorkspace();
  const companyId = activeCompany?.id ?? null;

  const fetchTemplates = useCallback(
    () => window.caulder.email.templates(companyId as string),
    [companyId],
  );
  const { data, reload } = useResource<EmailTemplate[]>(companyId ? fetchTemplates : null);

  if (!companyId || !data) return null;

  return <TemplateList companyId={companyId} templates={data} onChanged={reload} />;
}
