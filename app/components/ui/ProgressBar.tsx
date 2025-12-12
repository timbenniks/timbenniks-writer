interface ProgressBarProps {
  current: number;
  total: number;
  currentItem: string;
  statusLabel: string;
  color?: "blue" | "amber" | "green" | "purple";
}

const colorClasses = {
  blue: {
    bg: "bg-blue-50",
    border: "border-blue-100",
    textPrimary: "text-blue-900",
    textSecondary: "text-blue-700",
    progressBg: "bg-blue-200",
    progressFill: "bg-blue-600",
  },
  amber: {
    bg: "bg-amber-50",
    border: "border-amber-100",
    textPrimary: "text-amber-900",
    textSecondary: "text-amber-700",
    progressBg: "bg-amber-200",
    progressFill: "bg-amber-600",
  },
  green: {
    bg: "bg-green-50",
    border: "border-green-100",
    textPrimary: "text-green-900",
    textSecondary: "text-green-700",
    progressBg: "bg-green-200",
    progressFill: "bg-green-600",
  },
  purple: {
    bg: "bg-purple-50",
    border: "border-purple-100",
    textPrimary: "text-purple-900",
    textSecondary: "text-purple-700",
    progressBg: "bg-purple-200",
    progressFill: "bg-purple-600",
  },
};

export default function ProgressBar({
  current,
  total,
  currentItem,
  statusLabel,
  color = "blue",
}: ProgressBarProps) {
  const colors = colorClasses[color];
  const percentage = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className={`${colors.bg} border-b ${colors.border}`}>
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className={`text-sm font-medium ${colors.textPrimary}`}>
                {statusLabel}
              </span>
              <span className={`text-sm ${colors.textSecondary}`}>
                {current} / {total}
              </span>
            </div>
            <div className={`w-full ${colors.progressBg} rounded-full h-2`}>
              <div
                className={`${colors.progressFill} h-2 rounded-full transition-all duration-300`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            {currentItem && (
              <p className={`text-sm ${colors.textSecondary} mt-1 truncate`}>
                {currentItem}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

