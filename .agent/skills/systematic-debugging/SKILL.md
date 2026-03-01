---
name: systematic-debugging
description: 4-phase systematic debugging methodology with root cause analysis and evidence-based verification. Use when debugging complex issues.
allowed-tools: Read, Glob, Grep
---

# Systematic Debugging

> "No adivines. Investiga sistemáticamente. Arregla la causa raíz, no el síntoma."

## Overview

This skill provides a structured approach to debugging that prevents random guessing and ensures problems are properly understood before solving.

## 4-Phase Debugging Process

### Phase 1: Reproduce

Before fixing, reliably reproduce the issue.

```markdown
## Reproduction Steps

1. [Exact step to reproduce]
2. [Next step]
3. [Expected vs actual result]

## Reproduction Rate

- [ ] Always (100%)
- [ ] Often (50-90%)
- [ ] Sometimes (10-50%)
- [ ] Rare (<10%)
```

**Questions to answer:**

- Can I reproduce it consistently?
- What are the exact steps?
- What's the expected vs actual behavior?

### Phase 2: Isolate

Narrow down the source.

```markdown
## Isolation Questions

- When did this start happening?
- What changed recently?
- Does it happen in all environments?
- Can we reproduce with minimal code?
- What's the smallest change that triggers it?
```

**Techniques:**

- Binary search through commits (git bisect)
- Remove components until bug disappears
- Create minimal reproduction case

### Phase 3: Understand

Find the root cause, not just symptoms.

```markdown
## Root Cause Analysis - The 5 Whys

1. Why: [First observation - the bug symptom]
2. Why: [Deeper reason - what caused that?]
3. Why: [Still deeper - why did THAT happen?]
4. Why: [Getting closer - what's behind that?]
5. Why: [Root cause - the fundamental issue]
```

**Key insight:** The symptom is NOT the bug. Keep asking "why" until you find the root cause.

### Phase 4: Fix & Verify

Fix and verify it's truly fixed.

```markdown
## Fix Verification

- [ ] Bug no longer reproduces
- [ ] Related functionality still works
- [ ] No new issues introduced
- [ ] Regression test added to prevent future occurrence
```

**Important:** Add a test that would have caught this bug before merging!

---

## Debugging Checklist

### Before Starting

- [ ] Can reproduce consistently
- [ ] Have minimal reproduction case
- [ ] Understand expected behavior

### During Investigation

- [ ] Check recent changes (git log)
- [ ] Check logs for errors
- [ ] Add logging if needed
- [ ] Use debugger/breakpoints
- [ ] Trace data flow

### After Fix

- [ ] Root cause documented
- [ ] Fix verified
- [ ] Regression test added
- [ ] Similar code checked for same issue

---

## Common Debugging Commands

```bash
# Recent changes
git log --oneline -20
git diff HEAD~5

# Find when bug was introduced
git bisect start
git bisect bad HEAD
git bisect good <known-good-commit>

# Search for pattern
grep -r "errorPattern" --include="*.ts"

# Check logs (if using PM2)
pm2 logs app-name --err --lines 100
```

---

## By Error Type

| Error Type        | Investigation Approach                      |
| ----------------- | ------------------------------------------- |
| **Runtime Error** | Read stack trace, check types and nulls     |
| **Logic Bug**     | Trace data flow, compare expected vs actual |
| **Performance**   | Profile first, then optimize                |
| **Intermittent**  | Look for race conditions, timing            |
| **Memory Leak**   | Check event listeners, closures, caches     |

---

## Anti-Patterns

❌ **Random changes** - "Maybe if I change this..."
❌ **Ignoring evidence** - "That can't be the cause"
❌ **Assuming** - "It must be X" without proof
❌ **Not reproducing first** - Fixing blindly
❌ **Stopping at symptoms** - Not finding root cause
❌ **Multiple changes at once** - Can't tell which fixed it
