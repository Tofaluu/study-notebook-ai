---
name: Gemini model availability
description: Guidance for avoiding failures when Google retires Gemini models for newer API users.
---

Keep the Gemini model configurable and verify that the configured model is available to the project's API key rather than assuming an older public model still works.

**Why:** Google can retire a model for new API users while existing examples and older keys still reference it, causing prompt requests to fail with a model-not-found response.

**How to apply:** After changing Gemini integration code or model configuration, make one minimal prompt-only request through the app API and confirm it returns structured output.