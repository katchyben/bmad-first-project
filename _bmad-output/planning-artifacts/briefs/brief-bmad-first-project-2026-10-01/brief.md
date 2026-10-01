---
title: "Product Brief: Todo App (BMad Method demo)"
status: final
created: 2026-10-01
updated: 2026-10-01
---

# Product Brief: Todo App (BMad Method demo)

## Executive Summary

This project is a small but complete full-stack todo app, built so Benny can learn the BMad Method end to end. The app is the vehicle; the method is the point. It is deliberately simple in features and strict in rules: a single user manages tasks that always have a due date and time (the *due date-time*), move through a clear set of statuses, and become permanent records once finished.

The backend is a Python FastAPI service that owns every business rule, so it works the same whatever frontend calls it. A separate frontend consumes the API.

Success is not measured by the app. It is measured by whether Benny can then run the full BMad sequence (brief, PRD, architecture, stories, build) on a new project at work without help.

## Purpose and Problem

**The real problem** is learning a planning-first development method well enough to use it professionally. That needs a project small enough to finish, but with enough real decisions to make every BMad step earn its place.

**The product problem** gives those steps something to work on: one person needs to see what is due, in order of urgency, notice at a glance what is overdue, and keep an honest record of what was finished or abandoned, without that history getting in the way of today's work.

## Who This Serves

- **The app user:** one person managing their own tasks. There is a single pre-created account and no other users.
- **The learner (Benny):** an intermediate developer using the project to practise each BMad step properly, with no skipping.

## The Solution

A web app where the user logs in and sees their active tasks (To do and In progress) sorted by due date-time, with overdue tasks highlighted. Finished tasks (Done and Cancelled) sit in a collapsible section underneath.

Each task has a title, an optional description, a required due date-time, and a status:

- **To do**: newly created. It can be edited, started, marked done, cancelled or deleted.
- **In progress**: started. It can be edited, moved back to To do, marked done or cancelled. It cannot be deleted.
- **Done** or **Cancelled**: final and permanent. A finished task cannot be edited, deleted or moved, except by an undo within 5 seconds of the change.

The user can filter the list by status. The API rejects any action the rules don't allow, whichever client sends it.

## What Makes This Different

As a product, nothing. Todo apps are a solved problem, and this one is not meant to compete. What sets it apart as a learning project is that it has **real business rules**: a status model, permanent finished states, an undo window and conditional deletion. That gives the PRD, architecture and testing steps real work to do, where a plain create-read-update-delete list would not.

## Success Criteria

1. **Primary (learning):** Benny can run the whole BMad sequence on a new project without help.
2. **Every BMad step is actually done**, and each leaves its artifact behind: brief, PRD, architecture, epics and stories, then implementation.
3. **The app does what this brief says:** every business rule in the [addendum](addendum.md) is enforced by the API and covered by tests.

## Scope

**In the MVP**

- Log in and log out with one pre-created account.
- Create, edit and delete tasks, subject to the status rules.
- Start tasks, mark them done and cancel them, with a 5-second undo for marking done and cancelling.
- A list of active tasks sorted by due date-time, with overdue tasks highlighted.
- A collapsible section for finished tasks.
- Filtering by status.
- A FastAPI backend that enforces every rule, and a separate frontend.

**Explicitly out of the MVP**

- Account management: self sign-up, multiple users, password reset and change-password.
- Task features: reminders and notifications, recurring tasks, search, subtasks, priority, and tags.
- Platforms and data: a mobile app, offline use, and export or import.

## Confirmed Decisions and Open Questions

**Confirmed**

- The undo window is 5 seconds.
- The finished section shows the most recently finished tasks first.
- The user works in one time zone. Times are stored in UTC and shown in the user's local time.
- Change-password is out of the MVP. The credential is changed with the same setup mechanism that created the account.

**Open**

- **For the PRD:** the maximum title length, and how the status filter interacts with the finished section.
- **For architecture:** the frontend technology (the early recommendation is a separate single-page app that talks only to the API), the login mechanism, whether the undo window is enforced on the server or the client, the database, and where "overdue" is computed.

The status model, data model, business rules (BR-1 to BR-8), candidate use cases, authentication notes and open technical questions are in the [addendum](addendum.md).
