# SKI PILOT Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Protected Gate**: Unauthenticated or unverified-email requests (`request.auth == null || request.auth.token.email_verified != true`) are denied across all collections.
2. **Admin Bootstrap & Isolation**: Only the bootstrapped verified admin (`amottaviani@hotmail.com`) or an existing verified `/admins/{uid}` record can list, create, update, or delete `/allowed_users/{inviteId}` invitations, and write `/shared_meta/{docId}` or `/shared_chunks/{chunkId}`.
3. **Zero PII Leak**: A non-admin signed-in user can ONLY `get` their own `/allowed_users/{inviteId}` document where `inviteId` matches their own normalized verified email (`normalizedAuthEmail()`). `list` on `/allowed_users`, `/shared_meta`, and `/shared_chunks` is strictly forbidden.
4. **Private Preferences Ownership**: `/user_prefs/{userId}` can only be read or written by the authenticated owner (`userId == request.auth.uid`) or an admin, and `uid` is immutable after creation.
5. **Cloud Sync Integrity**: Authorized users (`isAuthorizedUser()`) can `get` `/shared_meta/current` and `/shared_chunks/{stations_N|snow_N}` chunks, while only `isAdmin()` can mutate them with bounded array sizes (`<= 1500` items), monotonic revisions, and server-enforced timestamps (`request.time`).
6. **Temporal & Structural Integrity**: All documents require exact key allowlists (`hasAll` + `hasOnly`), bounded string sizes, regex-validated IDs (`^[a-zA-Z0-9_\-]+$`), and server-enforced timestamps (`request.time`).

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. Unauthenticated `get` on `/allowed_users/test_user` or `/shared_meta/current` -> DENIED (no auth).
2. Unverified email `request.auth.token.email_verified == false` claiming admin email -> DENIED (`isSignedInVerified` fails).
3. Non-admin `list` on `/allowed_users` or `/shared_chunks` -> DENIED (forbidden).
4. Non-admin `get` on `/allowed_users/other_friend_gmail_com` -> DENIED (`inviteId != normalizedAuthEmail()`).
5. Non-admin `create` on `/admins/{myUid}` to escalate privilege -> DENIED (`isBootstrapAdmin()` false).
6. Non-admin `create` on `/allowed_users/{myInvite}` to self-invite -> DENIED (`!isAdmin()`).
7. Friend (`role == 'friend'`) attempting to overwrite `/shared_meta/current` or `/shared_chunks/snow_0` -> DENIED (`!isAdmin()`).
8. Shadow field injection on `/shared_meta/current` (`{ ..., isSuperAdmin: true }`) -> DENIED (`hasOnly` rejects).
9. Oversized string DoW payload on `stationsFileName` (300 chars > 160) -> DENIED (`size() <= 160` rejects).
10. Unbounded chunk array (`items.size() == 2000 > 1500`) or invalid `chunkId` (`evil_chunk`) -> DENIED (`items.size() <= 1500` and regex reject).
11. Client-forged timestamp (`updatedAt: "2020-01-01"`) -> DENIED (`== request.time` rejects).
12. `updatedByUid` spoofing on `/shared_meta/current` or `/shared_chunks/*` -> DENIED (`updatedByUid == request.auth.uid`).
