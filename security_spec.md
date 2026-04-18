# Firestore Security Specification - 態度貳貳甜點店營運系統

## Data Invariants
1. **Identity Integrity**: Any document containing a `staffId` or `creatorId` must match the authenticated user's UID.
2. **Relational Sync**: Daily reports and Journal entries must belong to a valid `shopId`.
3. **Double-Entry Balance**: Journal entries MUST have `debitTotal == creditTotal` (within absolute precision limits).
4. **Temporal Integrity**: `date` fields must follow `YYYY-MM-DD` format and matches the document ID for daily reports.
5. **Role-Based Access**: Only authenticated staff members (verified emails) can read or write documents.

## The Dirty Dozen (Test Payloads for Rejection)
1. **Spoofed Staff**: Attempt to write to `/shops/my-shop/daily/2026-04-18` as an unverified user whose email matches the staff list.
2. **Orphaned Daily**: Attempt to create a Daily Report for a shop that doesn't exist.
3. **Unbalanced Journal**: Attempt to save a Journal Entry where `debitTotal (100) != creditTotal (90)`.
4. **Shadow Field Injection**: Attempt to add `isAdmin: true` to a Settings document update.
5. **ID Poisoning**: Attempt to use `../../junk` as an `entryId`.
6. **Future Inventory**: Attempt to set `exp` (expected yield) to a negative number.
7. **Negative Amounts**: Attempt to save a Negative Amount in a Journal Line.
8. **Owner Hijack**: Attempt to change the `shopId` of an existing Daily Report.
9. **Blanket Query Scraping**: Attempt to list all shops without a specific security filter in the query.
10. **Terminal State Bypass**: Attempt to modify a Daily Report that has been marked as "Locked" or "Audited" (if implemented).
11. **Resource Exhaustion**: Attempt to write a 1MB string into a `description` field.
12. **PII Leak**: Attempt to read another shop's customer order details.

## The Test Runner Assertion (Abstract)
- All "Dirty Dozen" payloads must return `PERMISSION_DENIED`.
- Valid staff operations with correct schema and relationships return `SUCCESS`.
