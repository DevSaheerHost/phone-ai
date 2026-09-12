const COLORS: Record<string, string> = {
  neutral: "bg-black/5 text-current dark:bg-white/10",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  danger: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
};

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: keyof typeof COLORS }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${COLORS[tone]}`}>{children}</span>;
}
