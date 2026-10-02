import { CalendarDays } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { chipClass } from './chipClass';
import { atTime, defaultTime, timeOf } from './defaultTime';
import { formatDueAbsolute } from './formatDue';

export const PICK_DATE_LABEL = 'Pick date…';

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

type DuePickerProps = {
  /** The picked instant, or null while a preset is chosen. */
  value: Date | null;
  /** Whether this chip is the pressed one of its chip row. */
  pressed: boolean;
  /** Called on Set with the picked local date and time. */
  onSet: (due: Date) => void;
  /** Where focus goes after Set (the add input, or the edit row's title). */
  focusAfterSet: RefObject<HTMLElement | null>;
  /**
   * The chip's text in place of the default (the edit row shows the task's
   * current due here, unpressed, while `value` seeds the popover with it).
   */
  label?: string;
  /** The id of the form's error slot, for the chip's `aria-describedby`. */
  describedBy?: string;
};

/**
 * The "Pick date…" chip and its due popover (DESIGN.md Components > Due
 * popover): a modal Radix Popover with the Calendar (past days disabled), a
 * "Time" field and a primary Set. Enter on a day moves to Time, Enter in Time
 * is Set; Set returns focus to `focusAfterSet`, Esc to the chip, unchanged.
 * After Set the chip reads the value ("Oct 12, 9:00 AM").
 */
export function DuePicker({
  value,
  pressed,
  onSet,
  focusAfterSet,
  label: labelOverride,
  describedBy,
}: DuePickerProps) {
  const timeId = useId();
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState(() => startOfDay(new Date()));
  const [day, setDay] = useState(today);
  const [time, setTime] = useState('09:00');
  // A time the user typed (or the value being re-edited) survives a day change;
  // otherwise the default follows the day.
  const [timeEdited, setTimeEdited] = useState(false);
  // Set with an empty or partial time: the field is flagged and keeps focus.
  const [timeInvalid, setTimeInvalid] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  // Set when Set closes the popover, so focus goes to `focusAfterSet`, not the chip.
  const closedBySet = useRef(false);

  function onOpenChange(next: boolean) {
    if (next) {
      const now = new Date();
      const startToday = startOfDay(now);
      // A kept value whose day has passed (left open across midnight) is not
      // offered again: that day is disabled, so start on today instead.
      const kept = value !== null && startOfDay(value) >= startToday ? value : null;
      const start = kept ?? now;
      setToday(startToday);
      setDay(startOfDay(start));
      setTime(kept ? timeOf(kept) : defaultTime(start, now));
      setTimeEdited(kept !== null);
      setTimeInvalid(false);
    }
    setOpen(next);
  }

  function selectDay(next: Date) {
    setDay(next);
    if (!timeEdited) setTime(defaultTime(next, new Date()));
  }

  function set() {
    const due = atTime(day, time);
    if (due === null) {
      setTimeInvalid(true);
      timeRef.current?.focus();
      return;
    }
    closedBySet.current = true;
    setOpen(false);
    onSet(due);
  }

  function onTimeKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    set();
  }

  const label = labelOverride ?? (value ? formatDueAbsolute(value, new Date()) : PICK_DATE_LABEL);

  return (
    <Popover modal open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        type="button"
        aria-pressed={pressed}
        // The visible value comes first, so the label stays in the name.
        aria-label={label === PICK_DATE_LABEL ? undefined : `${label}, pick another date`}
        aria-describedby={describedBy}
        className={chipClass(pressed)}
      >
        <CalendarDays aria-hidden="true" className="size-3" />
        {label}
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        align="start"
        aria-label="Pick a due date and time"
        collisionPadding={16}
        className="w-auto max-w-[calc(100vw-2rem)]"
        onOpenAutoFocus={(event) => {
          // Start on the selected day, not the first tabbable (the month nav);
          // without one, Radix's default focus stands.
          const selected =
            contentRef.current?.querySelector<HTMLButtonElement>('[data-selected] button');
          if (!selected) return;
          event.preventDefault();
          selected.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (!closedBySet.current) return; // Esc or outside: back to the chip.
          closedBySet.current = false;
          const target = focusAfterSet.current;
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}
      >
        <Calendar
          mode="single"
          required
          selected={day}
          onSelect={selectDay}
          defaultMonth={day}
          startMonth={today}
          disabled={{ before: today }}
          onDayKeyDown={(date, modifiers, event) => {
            if (event.key !== 'Enter' || modifiers.disabled) return;
            // Select without the click Enter would fire, then move on to Time.
            event.preventDefault();
            selectDay(date);
            timeRef.current?.focus();
          }}
        />
        <div className="flex flex-wrap items-end gap-2 px-2 pb-1">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor={timeId} className="text-[13px]">
              Time
            </Label>
            <Input
              ref={timeRef}
              id={timeId}
              type="time"
              value={time}
              aria-invalid={timeInvalid || undefined}
              onChange={(e) => {
                setTime(e.target.value);
                setTimeEdited(true);
                setTimeInvalid(false);
              }}
              onKeyDown={onTimeKeyDown}
            />
          </div>
          <Button type="button" className="text-[13px]" onClick={set}>
            Set
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
