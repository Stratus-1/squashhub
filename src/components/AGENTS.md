# Shared component rules

- One-time feature notices use a code-defined notice key plus server-side `feature_notice_dismissals` per user, with eligibility from a security-definer RPC; why: closed once means closed on every device, and audience rules stay server-side.
