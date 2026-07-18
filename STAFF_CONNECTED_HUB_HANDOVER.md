# GENEVIEVE HEALTH™ — Irene & Staff Connected Safety Hub V5

## Purpose

This controlled demonstration connects Irene’s whole-practice dashboard to a phone-first staff application. It is designed for Apple and Android through an installable Progressive Web App (PWA).

## What now works

- Irene can authorise a staff sign-in email, assign a role, pause access or revoke access.
- Irene and authorised Mother Board / Governance Board accounts can see the connected whole-practice communication stream.
- Staff see only their own messages, assignments, acknowledgements, role-specific modules and support controls.
- Staff can send operational messages, coverage questions, support requests, safety concerns and handovers to Irene.
- Irene can reply privately, send role-based announcements and assign work with a due time and priority.
- Staff can accept, decline, complete or request help with their own assignment.
- Messages, acknowledgements, access changes and assignment responses are timestamped for audit evidence.
- Shared state is stored in the platform database rather than browser-only storage, allowing phone-to-dashboard communication across devices.

## Default privacy boundaries

- No staff-to-staff private-message access.
- No therapy notes, diagnoses, private health details or identifiable client information.
- Reception receives operational scheduling, callback, approved-script and transfer information only.
- Provisional psychologists receive their own work, supervision actions, scope reminders and support controls.
- Psychologists receive their own appointments, continuity actions, messages, tasks and support controls.
- Irene controls Mother Board / Governance Board access.
- All important restrictions are checked on the server; hiding a button is not treated as security.

## Phone installation

- iPhone/iPad: open the Staff Phone App in Safari, use **Share**, then **Add to Home Screen**.
- Android: open the Staff Phone App in Chrome, open the browser menu, then choose **Install app** or **Add to Home screen**.

## Controlled activation sequence

1. Keep the first deployment owner-only.
2. Irene signs into `/irene` first and claims the director account.
3. Irene enters each staff member’s exact ChatGPT sign-in email and assigns the correct role.
4. Confirm staff access and privacy boundaries with fictional information.
5. Only then widen site access so authorised staff can reach the sign-in screen.
6. Complete privacy, cyber-security, clinical-governance, WHS, records-retention and incident-response review before real operational or health information is permitted.

## Safety boundary

GENEVIEVE does not diagnose, calculate a clinical risk score, make clinical decisions or automatically contact family, police, hospitals or emergency services. In an immediate emergency call 000 and follow the practice’s approved human-led procedure.
