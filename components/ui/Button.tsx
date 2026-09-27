import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'

/**
 * ChairOS shared Button — the single source of truth for button styling.
 *
 * Design language (from app/globals.css):
 * - Olive primary driven by `--color-primary` (#4B5320 light / #7A8C3A dark),
 *   so dark-mode contrast is handled by the token, not by per-file overrides.
 * - Warm/olive radius + typography: rounded-xl, text-sm, font-semibold.
 * - Every size guarantees a 44px minimum touch target.
 *
 * Usage:
 *   <Button variant="primary" onClick={save}>Save</Button>
 *   <Button variant="secondary" href="/dashboard">Go to dashboard</Button>
 *   <Button variant="danger" loading={saving}>Delete</Button>
 *
 * When `href` is provided the component renders an <a>; otherwise a <button>.
 * `disabled` (or `loading`) always sets both `disabled` and `aria-disabled`.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap select-none ' +
  'rounded-xl font-semibold transition-colors focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4B5320] dark:focus-visible:ring-[#7A8C3A] ' +
  // Disabled must be visually distinct, not just faded: no hover, no shadow, blocked cursor.
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ' +
  '[&:disabled]:pointer-events-none ' +
  // A disabled anchor (<a>) can't take the disabled attribute — mirror the look via aria-disabled.
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:shadow-none ' +
  '[&[aria-disabled="true"]]:pointer-events-none'

const SIZES: Record<ButtonSize, string> = {
  // 44px minimum touch target on every size.
  sm: 'min-h-[44px] px-4 py-2 text-xs',
  md: 'min-h-[44px] px-5 py-2.5 text-sm',
  lg: 'min-h-[44px] px-6 py-3.5 text-base',
}

const VARIANTS: Record<ButtonVariant, string> = {
  // Solid olive. Dark mode: --color-primary lightens to #7A8C3A, and the text
  // flips to near-black (#141412, 5.6:1) because white-on-#7A8C3A is only 3.7:1.
  primary:
    'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] ' +
    'dark:text-[#141412] shadow-sm shadow-[#4B5320]/20',
  // Outlined olive. In dark mode .dark .text-od-green / hover tokens in
  // globals.css handle the lightening; the border is explicit here because
  // #4B5320-on-dark would vanish.
  secondary:
    'border border-[#4B5320]/40 bg-transparent text-od-green ' +
    'hover:bg-[var(--color-primary-light)] dark:border-[#7A8C3A]/50',
  // Text-only. Must always be font-semibold (never body-copy weight) and
  // never rely on color alone — underline on hover for affordance.
  ghost:
    'bg-transparent text-od-green hover:bg-[var(--color-primary-light)] hover:underline underline-offset-4',
  // Solid red. Follows the repo --color-danger token (#dc2626 / #ef4444).
  danger:
    'bg-[var(--color-danger)] text-white hover:brightness-110 shadow-sm shadow-red-900/20',
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80"
    />
  )
}

// Note: we extend only the button attributes (plus a few anchor-only props
// below). Extending both ButtonHTMLAttributes and AnchorHTMLAttributes makes
// every React event handler conflict (they're generic over the element type).
export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> {
  /** Visual variant. Default: 'primary'. */
  variant?: ButtonVariant
  /** Size — all sizes keep a 44px minimum touch target. Default: 'md'. */
  size?: ButtonSize
  /** Stretch to fill the container width. Default: false. */
  fullWidth?: boolean
  /** Shows a spinner and disables the control. Default: false. */
  loading?: boolean
  /** When set, renders an <a> instead of a <button>. */
  href?: string
  /** Anchor-only props, honored when `href` is set. */
  target?: AnchorHTMLAttributes<HTMLAnchorElement>['target']
  rel?: AnchorHTMLAttributes<HTMLAnchorElement>['rel']
  disabled?: boolean
  children: ReactNode
}

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      loading = false,
      href,
      disabled,
      className = '',
      children,
      type = 'button',
      ...rest
    },
    ref,
  ) {
    const isDisabled = Boolean(disabled || loading)
    const classes = [
      BASE,
      SIZES[size],
      VARIANTS[variant],
      fullWidth ? 'w-full' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ')

    const content = (
      <>
        {loading && <Spinner />}
        {children}
      </>
    )

    if (href) {
      return (
        <a
          {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={isDisabled ? undefined : href}
          aria-disabled={isDisabled || undefined}
          aria-busy={loading || undefined}
          tabIndex={isDisabled ? -1 : undefined}
          className={classes}
        >
          {content}
        </a>
      )
    }

    return (
      <button
        {...rest}
        ref={ref as React.Ref<HTMLButtonElement>}
        type={type}
        disabled={isDisabled}
        aria-disabled={isDisabled || undefined}
        aria-busy={loading || undefined}
        className={classes}
      >
        {content}
      </button>
    )
  },
)

export default Button
