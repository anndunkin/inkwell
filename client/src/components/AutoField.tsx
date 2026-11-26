import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  value: string;
  onSave: (v: string) => void | Promise<void>;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
  testId?: string;
  ariaLabel?: string;
  /** Reject empty values and revert instead. */
  required?: boolean;
}

/** Text field that saves when it loses focus (or on Enter for single-line). */
export default function AutoField({ value, onSave, multiline, rows = 4, placeholder, className, testId, ariaLabel, required }: Props) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  const skip = useRef(false);
  useEffect(() => { if (!focused.current) setText(value); }, [value]);

  function commit() {
    focused.current = false;
    if (skip.current) { skip.current = false; setText(value); return; }
    const next = text;
    if (required && !next.trim()) { setText(value); return; }
    if (next !== value) void onSave(next);
  }

  if (multiline) {
    return (
      <Textarea
        value={text} rows={rows} placeholder={placeholder} className={className} data-testid={testId} aria-label={ariaLabel}
        onFocus={() => { focused.current = true; }} onChange={e => setText(e.target.value)} onBlur={commit}
      />
    );
  }
  return (
    <Input
      value={text} placeholder={placeholder} className={className} data-testid={testId} aria-label={ariaLabel}
      onFocus={() => { focused.current = true; }} onChange={e => setText(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { skip.current = true; (e.target as HTMLInputElement).blur(); } }}
    />
  );
}
