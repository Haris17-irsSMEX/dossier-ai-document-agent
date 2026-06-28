import type { LucideIcon } from "lucide-react";

export function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  tone?: "default" | "primary" | "success" | "warning" | "danger" | "info";
  hint?: string;
}) {
  return (
    <article className={`metric-card ${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {hint ? <small>{hint}</small> : null}
      </div>
      {Icon ? (
        <span className="metric-card-icon">
          <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
        </span>
      ) : null}
    </article>
  );
}
