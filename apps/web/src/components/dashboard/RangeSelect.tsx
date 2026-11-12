'use client';

/** A date range picker inside a GET form (next/form): picking a range submits it, so the range lives in the URL. */
export function RangeSelect({ value, options, name = 'range' }: { value: string; options: [string, string][]; name?: string }) {
  return (
    <select
      name={name}
      defaultValue={value}
      aria-label="Date range"
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="h-10 rounded-lg border border-input bg-white px-3 text-sm font-semibold"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}
