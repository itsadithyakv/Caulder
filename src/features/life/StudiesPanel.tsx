import { useEffect, useState } from "react";
import { CalendarClock, GraduationCap } from "lucide-react";
import type { StudiesOverview } from "@shared/life";
import { describeDue } from "@shared/dates";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { formatDay, formatDuration } from "@/lib/format";
import { messageOf } from "@/lib/errors";

/**
 * Studies at a glance (PLAN.md, part four): the exams coming, each course
 * with its next exam and the study time it actually got in the last four
 * weeks, and the average worked out from grade points - on whatever scale
 * the university uses, since Caulder only multiplies by the credits.
 */

/** "Exam today", "exam tomorrow", "exam in 10 days". */
function examIn(days: number): string {
  if (days === 0) return "exam today";
  return days === 1 ? "exam tomorrow" : `exam in ${days} days`;
}

const STATUS_LABEL: Record<string, string> = {
  taking: "Taking",
  planned: "Planned",
  done: "Done",
  dropped: "Dropped",
};

export function StudiesPanel({
  companyId,
  version,
  onOpen,
  only,
}: {
  companyId: string;
  version: number;
  onOpen: (pageId: string) => void;
  /** On Life's overview, only the exams coming. */
  only?: "exams";
}) {
  const [data, setData] = useState<StudiesOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    window.caulder.life.studies(companyId).then(
      (next) => live && setData(next),
      (cause: unknown) => live && setError(messageOf(cause)),
    );
    return () => {
      live = false;
    };
  }, [companyId, version]);

  if (!data) return <ErrorLine>{error}</ErrorLine>;
  if (data.courses.length === 0 && data.exams.length === 0) return null;

  return (
    <>
      {data.exams.length > 0 && (
        <Card icon={<CalendarClock size={15} aria-hidden />} title={data.exams.length === 1 ? "1 exam coming" : `${data.exams.length} exams coming`}>
          <ul className="cold" aria-label="Exams coming">
            {data.exams.map((exam) => (
              <li key={exam.id}>
                <button type="button" className="coldrow" onClick={() => onOpen(exam.id)}>
                  <span className="coldrow__name">{exam.title}</span>
                  <span className="coldrow__meta">
                    {[exam.course?.title, formatDay(exam.on), exam.at].filter(Boolean).join(" · ")}
                  </span>
                  <span className={`coldrow__days${exam.daysLeft <= 3 ? " life__soon" : ""}`}>{describeDue(exam.on, data.today)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.courses.length > 0 && only !== "exams" && (
        <Card
          icon={<GraduationCap size={15} aria-hidden />}
          title="Courses"
          actions={
            data.average && (
              <span className="life__average" title="Grade points weighted by credits">
                Average <strong>{data.average.value}</strong>
                {data.average.credits > 0 ? ` over ${data.average.credits} credits` : ` over ${data.average.courses} courses`}
              </span>
            )
          }
        >
          <ul className="pagelist" aria-label="Courses">
            {data.courses.map((course) => (
              <li key={course.id}>
                <button type="button" className="pagerow" onClick={() => onOpen(course.id)}>
                  <span className="pagerow__main">
                    <span className="pagerow__title">
                      {course.title}
                      {course.code && <span className="life__code"> {course.code}</span>}
                    </span>
                    <span className="pagerow__excerpt">
                      {[
                        course.term,
                        course.credits !== null ? `${course.credits} credits` : null,
                        course.nextExam ? examIn(course.nextExam.daysLeft) : null,
                        course.keptMinutes > 0 ? `${formatDuration(course.keptMinutes)} studied in four weeks` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Nothing written about it yet"}
                    </span>
                  </span>
                  <span className="pagerow__meta">
                    {course.status && (
                      <span className={`badge ${course.status === "taking" ? "badge--accent" : "badge--neutral"}`}>
                        {STATUS_LABEL[course.status] ?? course.status}
                      </span>
                    )}
                    {course.grade && <span className="life__grade">{course.grade}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
