import { Flame, Thermometer, Timer, CircleCheck } from "lucide-react";
import type { Step } from "@/lib/recipe/schema";
import { cn } from "@/lib/utils";

const HEAT_TEXT: Record<NonNullable<Step["heat"]>, string> = {
  low: "Low heat",
  "medium-low": "Medium-low heat",
  medium: "Medium heat",
  "medium-high": "Medium-high heat",
  high: "High heat",
};

/** Time, temperature, heat and "done when" for a step. Renders nothing if the step has none. */
export function StepDetails({ step, size = "md" }: { step: Step; size?: "md" | "lg" }) {
  const items: { icon: typeof Timer; text: string; key: string }[] = [];
  if (step.duration) items.push({ key: "time", icon: Timer, text: step.duration.raw });
  if (step.temperature) items.push({ key: "temp", icon: Thermometer, text: step.temperature.raw });
  if (step.heat) items.push({ key: "heat", icon: Flame, text: HEAT_TEXT[step.heat] });
  if (step.doneCue) items.push({ key: "done", icon: CircleCheck, text: `Done when ${step.doneCue}` });
  if (!items.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-2", size === "lg" && "gap-2.5")}>
      {items.map(({ key, icon: Icon, text }) => (
        <li
          key={key}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full bg-secondary text-secondary-foreground",
            size === "lg" ? "px-3.5 py-2 text-base" : "px-2.5 py-1 text-sm",
          )}
        >
          <Icon className={cn("shrink-0 text-primary", size === "lg" ? "size-5" : "size-4")} aria-hidden />
          {text}
        </li>
      ))}
    </ul>
  );
}
