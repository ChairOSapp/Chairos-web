// Shared Square Web Payments SDK card() styling.
//
// The card element renders inside an iframe with Square's own defaults
// (dark input text on a transparent background). Every place we attach it
// sits on a themed box -- dark (booking, customer portal, POS) or light
// (booth-rent card form). Without an explicit style the fields are
// invisible whenever the box background matches Square's default text
// color (dark-on-dark), which is exactly the "can't see card details"
// bug. Pass the matching variant at every attach site.
//
// fontSize is 16px deliberately: iOS Safari auto-zooms any focused input
// under 16px, which breaks the checkout layout on iPhones.

export interface SquareCardStyle {
  [selector: string]: Record<string, string> | undefined
  input?: Record<string, string>
  'input::placeholder'?: Record<string, string>
  'input.is-error'?: Record<string, string>
  '.message-text'?: Record<string, string>
}

export function squareCardInputStyle(dark: boolean): SquareCardStyle {
  return {
    input: {
      backgroundColor: 'transparent',
      color: dark ? '#F5F5F4' : '#1C1917',
      fontFamily: 'inherit',
      fontSize: '16px',
      // NOTE: do NOT add lineHeight here. Square's Web Payments SDK
      // (verified on 1.85.0) rejects it inside attach() with an opaque
      // UnexpectedError and the whole card form fails to render.
    },
    'input::placeholder': {
      color: dark ? '#A8A29E' : '#78716C',
    },
    'input.is-error': {
      color: dark ? '#FCA5A5' : '#B91C1C',
    },
    '.message-text': {
      color: dark ? '#FCA5A5' : '#B91C1C',
    },
    // Browser autofill (Chrome/Safari) paints its own pale-yellow
    // background that ignores our backgroundColor, leaving light text
    // unreadable on yellow. Neutralize it so autofilled fields keep
    // the theme's readable text and background.
    'input:-webkit-autofill': {
      '-webkit-text-fill-color': dark ? '#F5F5F4' : '#1C1917',
      '-webkit-box-shadow': `0 0 0 1000px ${dark ? '#1C1917' : '#FFFFFF'} inset`,
      'caret-color': dark ? '#F5F5F4' : '#1C1917',
    },
  }
}
