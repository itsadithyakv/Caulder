import { BRAIN_GROUPS, BRAIN_SECTION_LIST, type BrainSectionId } from "@shared/brain";
import { SECTION_ICON } from "./sections";

/**
 * Every section of the company's brain, with a line on what goes in it, under
 * the four things a brain is for. The rail lists only the sections that hold
 * something, so it stays short; this is where the rest are, and where a new
 * company starts one.
 */
export function SectionsIndex({
  counts,
  onOpen,
}: {
  counts: Record<BrainSectionId, number>;
  onOpen: (section: BrainSectionId) => void;
}) {
  const sections = BRAIN_SECTION_LIST;
  return (
    <section className="card">
      <h2 className="card__title">All sections</h2>
      <p className="card__hint">What the company knows, by what it is for. Each opens with the kinds of page it holds.</p>
      {BRAIN_GROUPS.map((group) => (
        <section key={group.id} className="sectionsindex__group" aria-label={group.label}>
          <h3 className="sectionsindex__heading">{group.label}</h3>
          <ul className="sectionsindex">
            {sections
              .filter((section) => section.group === group.id)
              .map((section) => {
                const Icon = SECTION_ICON[section.id];
                const count = counts[section.id] ?? 0;
                const lead = /^(.*?[.!?])(\s|$)/.exec(section.prompt)?.[1] ?? section.prompt;
                return (
                  <li key={section.id}>
                    <button type="button" className="sectionsindex__item" onClick={() => onOpen(section.id)}>
                      <Icon size={18} className="sectionsindex__icon" aria-hidden />
                      <span className="sectionsindex__text">
                        <span className="sectionsindex__name">
                          {section.label}
                          {count > 0 && <span className="sectionsindex__count">{count}</span>}
                        </span>
                        {count > 0 && <span className="sectionsindex__lead">{lead}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </section>
  );
}
