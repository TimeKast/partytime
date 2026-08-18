const invitePrivateHeaders = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/reset-password',
        headers: [
          {
            key: 'Referrer-Policy',
            value: 'no-referrer',
          },
        ],
      },
      {
        source: '/invite',
        headers: invitePrivateHeaders,
      },
      {
        source: '/invite/:slug',
        headers: invitePrivateHeaders,
      },
      {
        source: '/verify',
        headers: invitePrivateHeaders,
      },
      {
        source: '/verify/:slug',
        headers: invitePrivateHeaders,
      },
      {
        // ISSUE-011: the Stripe return page must never be cached — it polls
        // a status endpoint and must always re-run that check on load, not
        // serve a stale success/cancelled snapshot from a shared/browser
        // cache. `:slug/pago` is specific enough (literal `pago` suffix) to
        // not collide with any other route source above.
        source: '/:slug/pago',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
