import type { HeatmapDay } from "@/domain/stats";

const weekdayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function weekdayIndex(date: string): number {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return (day + 6) % 7;
}

function formatDay(day: HeatmapDay): string {
  return `${day.date} · ${day.count} ${day.count === 1 ? "activité" : "activités"} · ${day.minutes} min`;
}

const intensityStyles: Record<HeatmapDay["level"], string> = {
  0: "border-white/[0.06] bg-white/[0.035]",
  1: "border-emerald-500/20 bg-emerald-500/25",
  2: "border-emerald-400/30 bg-emerald-400/55",
  3: "border-amber-300/40 bg-amber-300/80",
};

export function ActivityHeatmap({
  days,
  activeDays,
}: {
  days: HeatmapDay[];
  activeDays: number;
}) {
  const weeks = Array.from({ length: 12 }, (_, index) =>
    days.slice(index * 7, index * 7 + 7).sort(
      (left, right) => weekdayIndex(left.date) - weekdayIndex(right.date),
    ),
  );

  return (
    <section
      aria-labelledby="activity-heatmap-title"
      className="min-w-0 rounded-3xl border border-white/[0.08] bg-[#0A0A0A] p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="activity-heatmap-title"
            className="text-lg font-semibold tracking-tight text-[#EDEDED]"
          >
            Activité · 12 semaines
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Chaque carré rassemble les actions d’une journée.
          </p>
        </div>
        <p className="text-sm text-zinc-300">
          <span className="font-mono font-semibold tabular-nums text-[#EDEDED]">
            {activeDays}
          </span>{" "}
          / 84 jours actifs
        </p>
      </div>

      <div
        role="group"
        aria-label="Activité quotidienne des 84 derniers jours, du lundi au dimanche"
        className="mt-5 grid min-w-0 grid-cols-[auto_repeat(12,minmax(0,1fr))] gap-x-1.5 gap-y-1.5"
      >
        {weekdayLabels.map((label, rowIndex) => (
          <span
            key={label}
            className={`flex h-full items-center pr-1 text-[9px] text-zinc-500 ${
              rowIndex % 2 === 0 ? "" : "invisible"
            }`}
            aria-hidden="true"
          >
            {rowIndex === 0 ? "Lun" : rowIndex === 2 ? "Mer" : rowIndex === 4 ? "Ven" : ""}
          </span>
        )).flatMap((label, rowIndex) => [
          label,
          ...weeks.map((week, weekIndex) => {
            const day = week[rowIndex];
            if (!day) {
              return (
                <span
                  key={`empty-${weekIndex}-${rowIndex}`}
                  aria-hidden="true"
                  className="aspect-square w-full min-w-0"
                />
              );
            }
            const description = formatDay(day);
            return (
              <button
                key={day.date}
                type="button"
                title={description}
                aria-label={description}
                className={`aspect-square w-full min-w-0 rounded-[4px] border border-white/[0.08] transition-colors duration-150 hover:ring-1 hover:ring-white/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white ${intensityStyles[day.level]}`}
              />
            );
          }),
        ])}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5" aria-label="Moins d’activité à plus d’activité">
          <span>Moins</span>
          {([0, 1, 2, 3] as const).map((level) => (
            <span
              key={level}
              aria-hidden="true"
              className={`size-3 rounded-[3px] border ${intensityStyles[level]}`}
            />
          ))}
          <span>Plus</span>
        </span>
        <span>Survoler ou parcourir au clavier pour le détail</span>
      </div>
    </section>
  );
}
