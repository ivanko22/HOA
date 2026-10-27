/**
 * PostHog is optional in local/dev. When NEXT_PUBLIC_POSTHOG_KEY is unset,
 * analytics calls are no-ops.
 */
export function getPostHogBrowserConfig() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
  if (!key) return null;
  return { key, host };
}
