// On/off switches used across the console and apps. Plain markup (no client
// code), so server pages can use them:
//  - <ToggleButton>: a submit button that flips a setting (put it in a <form>
//    with the hidden inputs the action needs).
//  - <ToggleInput>: a form field (a real checkbox underneath), for forms that
//    are saved with a Save button.
//  - <Switch>: just the track and knob, for custom buttons.

const ON = "bg-[#1f7a4d]";
const OFF_LIGHT = "bg-[#cfc6b5]";
const OFF_DARK = "bg-white/25";

export function Switch({ on, dark = false, small = false }: { on: boolean; dark?: boolean; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={
        "relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 " +
        (small ? "h-[18px] w-8 " : "h-[22px] w-10 ") +
        (on ? ON : dark ? OFF_DARK : OFF_LIGHT)
      }
    >
      <span
        className={
          "absolute left-[2px] rounded-full bg-white shadow-sm transition-transform duration-200 " +
          (small ? "h-[14px] w-[14px] " : "h-[18px] w-[18px] ") +
          (on ? (small ? "translate-x-[14px]" : "translate-x-[18px]") : "translate-x-0")
        }
      />
    </span>
  );
}

export function ToggleButton({
  on,
  label,
  showState = true,
  small = false,
  title,
}: {
  on: boolean;
  label: string; // what is being switched, for screen readers (e.g. "Invoice after every order")
  showState?: boolean; // show "On" / "Off" next to the switch
  small?: boolean;
  title?: string;
}) {
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={on}
      aria-label={`${label}: ${on ? "on" : "off"}. Click to turn ${on ? "off" : "on"}.`}
      title={title ?? `Click to turn ${on ? "off" : "on"}`}
      className="inline-flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f7a4d]/40 focus-visible:ring-offset-2"
    >
      <Switch on={on} small={small} />
      {showState && <span className={"text-[12.5px] font-semibold " + (on ? "text-[#2c6a4e]" : "text-ink/50")}>{on ? "On" : "Off"}</span>}
    </button>
  );
}

export function ToggleInput({
  name,
  defaultChecked,
  label,
  hint,
  value,
}: {
  name: string;
  defaultChecked?: boolean;
  label: React.ReactNode;
  hint?: React.ReactNode;
  value?: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-start gap-2.5 text-[13.5px] text-ink">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={
          "relative mt-[1px] inline-flex h-[22px] w-10 shrink-0 items-center rounded-full transition-colors duration-200 " +
          OFF_LIGHT +
          " peer-checked:bg-[#1f7a4d] peer-focus-visible:ring-2 peer-focus-visible:ring-[#1f7a4d]/40 peer-focus-visible:ring-offset-2" +
          " [&>span]:translate-x-0 peer-checked:[&>span]:translate-x-[18px]"
        }
      >
        <span className="absolute left-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-200" />
      </span>
      <span>
        {label}
        {hint && <span className="block text-[12px] text-ink/50">{hint}</span>}
      </span>
    </label>
  );
}
