import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ComponentProps<"button"> & { variant?: "default" | "outline" | "ghost" };

export function Button({ variant = "default", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn("button", `button-${variant}`, className)} {...props} />;
}
