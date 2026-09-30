# Household controls — prototype behavior

- Membership and E-Stamp grants are read-only in the resident UI. Existing invite/join/role-edit entry points now direct residents to juristic management.
- `homes[].members[].estampAllowed` represents the grant received from the juristic system. Demo home h1 grants m1 access and leaves m2 ungranted. It is independent of ownership and approval-call assignment.
- `homes[].contactPolicy` stores `mode`, one `recipientId`, and `recipientChangedAt` (epoch milliseconds). Only the current member with role เจ้าบ้าน can modify this policy. A successful recipient change locks all subsequent changes for 3,600,000 ms, including switching back. Saving the same person does not restart the lock.
- Modes: bypass permits entry without a call; approve routes a simulated call only to the selected member; dnd suppresses calls and denies entry. Changing away from approve resolves a pending simulated call accordingly. The existing Version 2 gate for incoming banners remains in place.
- Member-level `notificationPreferences` defaults to true for vehicle, parcel, announcement, bill, and other. Ordinary notifications snapshot all eligible household recipient keys at creation. Call approval is separate from these switches.
- Notification read and clear state is personal. Browser storage events deliver eligible simulated notifications to other open tabs without changing each tab's active identity.

## Integration still required for production

This repository has no authenticated juristic API, Firebase service worker, FCM device-token registration, or push sender. Current data, permissions and cooldown enforcement are a localStorage prototype. No production permission or gate decision should trust these client fields.

The authenticated backend must identify the current member, read juristic-owned E-Stamp grants, authorize only the homeowner for policy changes, enforce the 60-minute interval atomically using server time, and return the authoritative next-change timestamp. Robot requests must evaluate that policy server-side. FCM must target the selected member's registered devices for approval calls, and each opted-in household member's devices for ordinary events. The UI's version preference is not an access-control boundary.

Validation: `node tests/household-policy.cjs` covers permissions, single recipient, cooldown persistence/boundary, three modes, per-member settings and notifications, independent read/clear, local delivery across two tabs, and mobile layouts.
