import Stripe from 'stripe'
import { loadStripe } from '@stripe/stripe-js'

// Server-only Stripe client — never import this in client components
export function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-05-27.dahlia' as any,
  })
}

// Client-side Stripe.js singleton
let stripePromise: ReturnType<typeof loadStripe> | null = null
export function getStripeJs() {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
  }
  return stripePromise
}

export const PLANS = {
  solo: { price: process.env.STRIPE_SOLO_PRICE_ID!, label: 'Solo Chair', amount: '$25/mo' },
  owner: { price: process.env.STRIPE_OWNER_PRICE_ID!, label: 'Shop Owner', amount: '$99/mo' },
} as const

export type PlanKey = keyof typeof PLANS
