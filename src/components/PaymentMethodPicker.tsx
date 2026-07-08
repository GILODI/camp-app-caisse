"use client";

import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/types";

export function PaymentMethodPicker({
  value,
  onChange,
}: {
  value: PaymentMethod | null;
  onChange: (method: PaymentMethod) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PAYMENT_METHODS.map((method) => (
        <button
          key={method.value}
          type="button"
          onClick={() => onChange(method.value)}
          className={`rounded-lg border px-4 py-3 font-semibold ${
            value === method.value
              ? "border-brand bg-brand text-white"
              : "border-black/15 bg-white text-foreground"
          }`}
        >
          {method.label}
        </button>
      ))}
    </div>
  );
}
