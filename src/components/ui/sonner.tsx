"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      richColors
      closeButton
      toastOptions={{
        className: "border border-slate-700 bg-slate-900 text-slate-100",
      }}
      {...props}
    />
  );
}
