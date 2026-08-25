-- Guarantees the day-25-of-trial reminder email (src/trigger/trialReminderEmail.ts)
-- fires exactly once per trial, not once per day the profile stays in the window.
ALTER TABLE profiles ADD COLUMN trial_reminder_sent_at timestamptz;
