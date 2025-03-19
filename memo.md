# Refactoring Plan for HN Companion Extension

## Goal
Refactor the large content.js file into smaller, more maintainable modules with clear separation of concerns.

## Current Issues
- content.js is too large (over 2000 lines)
- Mixed responsibilities (UI, API calls, navigation, summarization)
- Hard to maintain and extend

## Refactoring Strategy
Break down content.js into logical modules following a more organized structure:

### Proposed Module Structure
1. **Core/Base Modules**
   - `hn-enhancer.js` - Main class, initialization and coordination
   - `hn-state.js` - State management (already partially separated)

2. **Feature Modules**
   - `navigation.js` - Keyboard navigation, post/comment navigation
   - `summarization.js` - AI summarization logic
   - `author-tracking.js` - Author comments tracking and navigation

3. **UI Modules**
   - `ui-components.js` - UI elements creation (help modal, popups)
   - `summary-panel.js` - Already separated

4. **Utility Modules**
   - `api-client.js` - API communication
   - `markdown-utils.js` - Markdown conversion
   - `dom-utils.js` - DOM manipulation helpers

## Todo List (in order)

### Phase 1: Initial Setup
- [x] Create memo.md for tracking progress
- [x] Create basic module structure and files
- [x] Set up module imports/exports

### Phase 2: Extract Core Functionality
- [x] Extract HNState class to hn-state.js
- [x] Create minimal HNEnhancer class in hn-enhancer.js
- [x] Set up initialization flow

### Phase 3: Extract Feature Modules
- [x] Move navigation code to navigation.js
- [x] Move summarization code to summarization.js
- [ ] Move author tracking to author-tracking.js

### Phase 4: Extract UI Components
- [ ] Move UI creation code to ui-components.js
- [ ] Ensure summary-panel.js integration

### Phase 5: Extract Utilities
- [x] Move API communication to api-client.js
- [x] Move markdown utilities to markdown-utils.js
- [x] Move DOM utilities to dom-utils.js

### Phase 6: Refinement
- [ ] Fix any integration issues
- [ ] Optimize imports

## How to Use This Memo

This memo serves as a persistent record of the refactoring plan and progress. In each session:

1. **Start each session by reviewing this memo**
   - Check what's been completed
   - Identify the next task

2. **Update the memo after each task**
   - Mark completed tasks with [x]
   - Add any new insights or challenges
   - Document any design decisions

3. **Focus on one task at a time**
   - Complete a single logical unit of work
   - Test thoroughly before moving on
   - Update this memo before ending the session

4. **Maintain backward compatibility**
   - Ensure the extension works at each step
   - Don't break existing functionality

This approach allows for incremental progress across multiple sessions, even with context limitations.
